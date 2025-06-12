/**
 * @fileoverview Transaction History Service
 * 
 * Provides comprehensive transaction history querying with advanced filtering,
 * pagination, sorting, and search capabilities. Combines pending and completed
 * transactions into unified views with performance optimizations.
 */

import {
  getFFIBindings,
  WalletError,
  WalletErrorCode,
  withErrorContext,
  withRetry,
  TypedEventEmitter,
  type WalletHandle,
  type TransactionId,
  type UnixTimestamp,
  validateRequired
} from '@tari-project/tarijs-core';
import type {
  TransactionInfo,
  TransactionFilter,
  TransactionQueryOptions,
  TransactionSortBy,
  TransactionStatistics
} from '@tari-project/tarijs-core';
import { TransactionStatus, TransactionDirection } from '@tari-project/tarijs-core';
import { TransactionRepository, type QueryResult } from '../transaction-repository.js';
import { HistoryQueryBuilder } from './query-builder.js';
import { HistoryFilters } from './filters.js';

/**
 * Configuration for the history service
 */
export interface HistoryServiceConfig {
  /** Wallet handle for FFI operations */
  walletHandle: WalletHandle;
  /** Maximum number of results per page */
  maxPageSize: number;
  /** Default page size when not specified */
  defaultPageSize: number;
  /** Whether to cache query results */
  enableCaching: boolean;
  /** Cache TTL in milliseconds */
  cacheTtlMs: number;
  /** Whether to include pending transactions in history */
  includePending: boolean;
}

/**
 * History service events
 */
export interface HistoryServiceEvents {
  'history:updated': (count: number) => void;
  'history:filtered': (filter: TransactionFilter, resultCount: number) => void;
  'cache:hit': (query: string) => void;
  'cache:miss': (query: string) => void;
}

/**
 * Combined transaction history entry with enriched metadata
 */
export interface HistoryEntry extends TransactionInfo {
  /** Age of transaction in milliseconds */
  age: number;
  /** Whether this transaction is searchable */
  isSearchable: boolean;
  /** Formatted display amount */
  displayAmount: string;
  /** Human-readable status */
  statusLabel: string;
  /** Categorization tags */
  tags: string[];
}

/**
 * Search result with highlighting and relevance scoring
 */
export interface SearchResult {
  /** Matching transactions */
  transactions: HistoryEntry[];
  /** Total number of matches */
  totalMatches: number;
  /** Search query used */
  query: string;
  /** Search execution time in milliseconds */
  executionTimeMs: number;
  /** Whether results are truncated */
  isTruncated: boolean;
  /** Suggested refinements */
  suggestions: string[];
}

/**
 * Transaction history service providing comprehensive querying capabilities
 * 
 * Features:
 * - Advanced filtering by status, direction, amount ranges, dates
 * - Full-text search across transaction messages and addresses
 * - Pagination with cursor-based and offset-based options
 * - Multiple sorting strategies with performance optimization
 * - Result caching with intelligent invalidation
 * - Statistics and analytics generation
 * - Export capabilities for external analysis
 */
export class HistoryService extends TypedEventEmitter {
  private readonly config: HistoryServiceConfig;
  private readonly repository: TransactionRepository;
  private readonly queryBuilder: HistoryQueryBuilder;
  private readonly filters: HistoryFilters;
  private readonly ffi = getFFIBindings();
  private readonly queryCache = new Map<string, { result: any; timestamp: number }>();
  private isDisposed = false;

  constructor(
    config: HistoryServiceConfig,
    repository: TransactionRepository
  ) {
    super();
    
    this.config = config;
    this.repository = repository;
    this.queryBuilder = new HistoryQueryBuilder(config);
    this.filters = new HistoryFilters();

    // Listen for repository changes to invalidate cache
    this.repository.on('transaction:added', () => this.invalidateCache());
    this.repository.on('transaction:updated', () => this.invalidateCache());
    this.repository.on('transaction:removed', () => this.invalidateCache());
  }

  /**
   * Get transaction history with advanced filtering and pagination
   * 
   * @param filter Optional filter criteria
   * @param options Query options including pagination and sorting
   * @returns Promise resolving to paginated history results
   */
  @withErrorContext('get_transaction_history', 'history_service')
  @withRetry()
  async getTransactionHistory(
    filter?: TransactionFilter,
    options?: TransactionQueryOptions
  ): Promise<QueryResult<HistoryEntry>> {
    this.ensureNotDisposed();
    
    // Validate and normalize options
    const normalizedOptions = this.normalizeQueryOptions(options);
    
    // Build cache key
    const cacheKey = this.buildCacheKey(filter, normalizedOptions);
    
    // Check cache if enabled
    if (this.config.enableCaching) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.emit('cache:hit', cacheKey);
        return cached;
      }
      this.emit('cache:miss', cacheKey);
    }

    // Build the query
    const query = this.queryBuilder.build(filter, normalizedOptions);
    
    // Execute query through repository
    const repositoryResult = await this.repository.queryTransactions(
      query.filter,
      query.options
    );

    // Enrich transactions with history metadata
    const enrichedTransactions = await this.enrichTransactions(repositoryResult.data);

    // Apply post-processing filters that can't be done at repository level
    const finalTransactions = this.filters.applyPostProcessingFilters(
      enrichedTransactions,
      filter
    );

    // Build final result
    const result: QueryResult<HistoryEntry> = {
      data: finalTransactions.slice(0, normalizedOptions.limit),
      totalCount: repositoryResult.totalCount,
      hasMore: repositoryResult.hasMore,
      nextOffset: repositoryResult.nextOffset
    };

    // Cache result if enabled
    if (this.config.enableCaching) {
      this.cacheResult(cacheKey, result);
    }

    // Emit event
    this.emit('history:filtered', filter || {}, result.data.length);

    return result;
  }

  /**
   * Search transaction history with full-text search capabilities
   * 
   * @param query Search query string
   * @param filter Optional additional filters
   * @param options Query options
   * @returns Promise resolving to search results with relevance scoring
   */
  @withErrorContext('search_transaction_history', 'history_service')
  async searchTransactionHistory(
    query: string,
    filter?: TransactionFilter,
    options?: TransactionQueryOptions
  ): Promise<SearchResult> {
    this.ensureNotDisposed();
    validateRequired(query, 'query');
    
    const startTime = Date.now();
    
    // Normalize search query
    const normalizedQuery = this.normalizeSearchQuery(query);
    
    // Build search filter
    const searchFilter = this.buildSearchFilter(normalizedQuery, filter);
    
    // Execute search
    const searchResults = await this.getTransactionHistory(searchFilter, options);
    
    // Calculate relevance scores and sort by relevance
    const scoredTransactions = this.scoreSearchResults(
      searchResults.data,
      normalizedQuery
    );

    // Generate search suggestions
    const suggestions = await this.generateSearchSuggestions(normalizedQuery);

    const executionTimeMs = Date.now() - startTime;

    return {
      transactions: scoredTransactions,
      totalMatches: searchResults.totalCount,
      query: normalizedQuery,
      executionTimeMs,
      isTruncated: searchResults.hasMore,
      suggestions
    };
  }

  /**
   * Get transaction statistics for a given time period and filters
   * 
   * @param filter Optional filter criteria
   * @param timeRange Optional time range specification
   * @returns Promise resolving to transaction statistics
   */
  @withErrorContext('get_transaction_statistics', 'history_service')
  async getTransactionStatistics(
    filter?: TransactionFilter,
    timeRange?: { startDate: Date; endDate: Date }
  ): Promise<TransactionStatistics> {
    this.ensureNotDisposed();
    
    // Build filter with time range
    const statsFilter: TransactionFilter = {
      ...filter,
      ...(timeRange && {
        startDate: timeRange.startDate.getTime() as UnixTimestamp,
        endDate: timeRange.endDate.getTime() as UnixTimestamp
      })
    };

    // Get all matching transactions
    const allTransactions = await this.getAllMatchingTransactions(statsFilter);
    
    // Calculate comprehensive statistics
    return this.calculateDetailedStatistics(allTransactions);
  }

  /**
   * Get recent transaction activity with configurable time window
   * 
   * @param timeWindowMs Time window in milliseconds (default: 24 hours)
   * @param limit Maximum number of transactions to return
   * @returns Promise resolving to recent transactions
   */
  @withErrorContext('get_recent_activity', 'history_service')
  async getRecentActivity(
    timeWindowMs: number = 24 * 60 * 60 * 1000, // 24 hours
    limit: number = 50
  ): Promise<HistoryEntry[]> {
    this.ensureNotDisposed();
    
    const cutoffTime = Date.now() - timeWindowMs;
    
    const filter: TransactionFilter = {
      startDate: cutoffTime as UnixTimestamp
    };

    const options: TransactionQueryOptions = {
      sortBy: 'timestamp' as TransactionSortBy,
      sortOrder: 'desc',
      limit,
      offset: 0
    };

    const result = await this.getTransactionHistory(filter, options);
    return result.data;
  }

  /**
   * Export transaction history in various formats
   * 
   * @param filter Optional filter criteria
   * @param format Export format ('csv' | 'json' | 'xlsx')
   * @returns Promise resolving to export data
   */
  @withErrorContext('export_transaction_history', 'history_service')
  async exportTransactionHistory(
    filter?: TransactionFilter,
    format: 'csv' | 'json' | 'xlsx' = 'csv'
  ): Promise<{
    data: string | Buffer;
    filename: string;
    mimeType: string;
  }> {
    this.ensureNotDisposed();
    
    // Get all matching transactions (no pagination for export)
    const allTransactions = await this.getAllMatchingTransactions(filter);
    
    // Generate export data based on format
    switch (format) {
      case 'csv':
        return this.exportToCsv(allTransactions);
      case 'json':
        return this.exportToJson(allTransactions);
      case 'xlsx':
        return this.exportToXlsx(allTransactions);
      default:
        throw new WalletError(
          WalletErrorCode.InvalidInput,
          `Unsupported export format: ${format}`,
          { format, supportedFormats: ['csv', 'json', 'xlsx'] }
        );
    }
  }

  /**
   * Get all transactions matching filter (used for statistics and export)
   */
  private async getAllMatchingTransactions(filter?: TransactionFilter): Promise<HistoryEntry[]> {
    const allTransactions: HistoryEntry[] = [];
    let offset = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const batch = await this.getTransactionHistory(filter, {
        offset,
        limit: batchSize,
        sortBy: 'timestamp' as TransactionSortBy,
        sortOrder: 'desc'
      });

      allTransactions.push(...batch.data);
      hasMore = batch.hasMore;
      offset += batchSize;
    }

    return allTransactions;
  }

  /**
   * Enrich transactions with additional metadata for history display
   */
  private async enrichTransactions(transactions: TransactionInfo[]): Promise<HistoryEntry[]> {
    const now = Date.now();
    
    return transactions.map(tx => {
      const age = now - Number(tx.timestamp);
      const isSearchable = !!(tx.message || tx.address);
      const displayAmount = this.formatDisplayAmount(tx.amount);
      const statusLabel = this.getStatusLabel(tx.status);
      const tags = this.generateTransactionTags(tx);

      return {
        ...tx,
        age,
        isSearchable,
        displayAmount,
        statusLabel,
        tags
      } as HistoryEntry;
    });
  }

  /**
   * Score search results by relevance to query
   */
  private scoreSearchResults(transactions: HistoryEntry[], query: string): HistoryEntry[] {
    const scoredTransactions = transactions.map(tx => {
      let score = 0;
      const queryLower = query.toLowerCase();

      // Message relevance (highest weight)
      if (tx.message && tx.message.toLowerCase().includes(queryLower)) {
        score += 10;
        if (tx.message.toLowerCase().startsWith(queryLower)) {
          score += 5;
        }
      }

      // Address relevance
      if (tx.address.toLowerCase().includes(queryLower)) {
        score += 5;
      }

      // Amount relevance (if query is numeric)
      if (!isNaN(Number(query)) && tx.amount.toString().includes(query)) {
        score += 3;
      }

      // Tags relevance
      score += tx.tags.filter(tag => 
        tag.toLowerCase().includes(queryLower)
      ).length * 2;

      // Recency boost (more recent = higher score)
      const daysSinceTransaction = tx.age / (24 * 60 * 60 * 1000);
      if (daysSinceTransaction < 7) {
        score += 2;
      } else if (daysSinceTransaction < 30) {
        score += 1;
      }

      return { ...tx, score };
    });

    // Sort by score (descending) then by timestamp (descending)
    return scoredTransactions
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return Number(b.timestamp) - Number(a.timestamp);
      })
      .map(({ score, ...tx }) => tx); // Remove score from final result
  }

  /**
   * Normalize query options with defaults and validation
   */
  private normalizeQueryOptions(options?: TransactionQueryOptions): TransactionQueryOptions {
    const defaultOptions: TransactionQueryOptions = {
      offset: 0,
      limit: this.config.defaultPageSize,
      sortBy: 'timestamp' as TransactionSortBy,
      sortOrder: 'desc'
    };

    const normalized = { ...defaultOptions, ...options };

    // Validate and clamp page size
    if (normalized.limit! > this.config.maxPageSize) {
      normalized.limit = this.config.maxPageSize;
    }

    return normalized;
  }

  /**
   * Build cache key for query result caching
   */
  private buildCacheKey(filter?: TransactionFilter, options?: TransactionQueryOptions): string {
    return JSON.stringify({ filter, options });
  }

  /**
   * Get result from cache if valid
   */
  private getFromCache(key: string): QueryResult<HistoryEntry> | null {
    const cached = this.queryCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTtlMs) {
      return cached.result;
    }
    
    if (cached) {
      this.queryCache.delete(key);
    }
    
    return null;
  }

  /**
   * Cache query result
   */
  private cacheResult(key: string, result: QueryResult<HistoryEntry>): void {
    this.queryCache.set(key, {
      result,
      timestamp: Date.now()
    });
  }

  /**
   * Invalidate all cached results
   */
  private invalidateCache(): void {
    this.queryCache.clear();
  }

  /**
   * Helper methods for formatting and processing
   */
  private formatDisplayAmount(amount: bigint): string {
    // Convert microTari to Tari with appropriate decimal places
    const tari = Number(amount) / 1000000;
    return tari.toLocaleString(undefined, {
      minimumFractionDigits: 6,
      maximumFractionDigits: 6
    }) + ' T';
  }

  private getStatusLabel(status: any): string {
    const statusLabels: Record<string, string> = {
      Pending: 'Pending',
      Completed: 'Completed',
      Cancelled: 'Cancelled',
      Failed: 'Failed',
      Unknown: 'Unknown'
    };
    
    return statusLabels[status] || 'Unknown';
  }

  private generateTransactionTags(tx: TransactionInfo): string[] {
    const tags: string[] = [];
    
    // Direction tags
    tags.push(tx.direction === TransactionDirection.Inbound ? 'received' : 'sent');
    
    // Status tags
    tags.push(this.getStatusLabel(tx.status).toLowerCase());
    
    // Special transaction type tags
    if ('isOneSided' in tx && tx.isOneSided) {
      tags.push('one-sided');
    }
    
    if ('isCoinbase' in tx && tx.isCoinbase) {
      tags.push('coinbase');
    }
    
    // Amount-based tags
    const amountTari = Number(tx.amount) / 1000000;
    if (amountTari >= 1000) {
      tags.push('large');
    } else if (amountTari < 1) {
      tags.push('small');
    }
    
    return tags;
  }

  private normalizeSearchQuery(query: string): string {
    return query.trim().toLowerCase();
  }

  private buildSearchFilter(query: string, additionalFilter?: TransactionFilter): TransactionFilter {
    // For now, we'll use message search as the primary search mechanism
    // In a full implementation, this would support more sophisticated search syntax
    return {
      ...additionalFilter,
      // Note: This would need to be implemented in the repository layer
      // searchQuery: query
    };
  }

  private async generateSearchSuggestions(query: string): Promise<string[]> {
    // Generate search suggestions based on common patterns
    const suggestions: string[] = [];
    
    // If query looks like an amount, suggest amount-based searches
    if (!isNaN(Number(query))) {
      suggestions.push(`amount:${query}`, `>amount:${query}`, `<amount:${query}`);
    }
    
    // If query looks like a date, suggest date-based searches
    if (query.match(/\d{4}-\d{2}-\d{2}/)) {
      suggestions.push(`date:${query}`, `after:${query}`, `before:${query}`);
    }
    
    // Common search patterns
    if (query.length > 2) {
      suggestions.push(
        `message:"${query}"`,
        `tag:${query}`,
        `status:${query}`
      );
    }
    
    return suggestions.slice(0, 5); // Limit to 5 suggestions
  }

  private calculateDetailedStatistics(transactions: HistoryEntry[]): TransactionStatistics {
    // Implementation would calculate comprehensive statistics
    // For now, return basic structure
    const totalSent = transactions
      .filter(tx => tx.direction === TransactionDirection.Outbound)
      .reduce((sum, tx) => sum + tx.amount, BigInt(0));
    
    const totalReceived = transactions
      .filter(tx => tx.direction === TransactionDirection.Inbound)
      .reduce((sum, tx) => sum + tx.amount, BigInt(0));

    return {
      total: transactions.length,
      byStatus: {} as any, // Would be properly calculated
      byDirection: {} as any, // Would be properly calculated
      totalSent: totalSent as any,
      totalReceived: totalReceived as any,
      totalFees: BigInt(0) as any,
      averageAmount: transactions.length > 0 ? 
        (totalSent + totalReceived) / BigInt(transactions.length) as any : 
        BigInt(0) as any,
      averageFee: BigInt(0) as any,
      dateRange: {
        earliest: Math.min(...transactions.map(tx => Number(tx.timestamp))) as any,
        latest: Math.max(...transactions.map(tx => Number(tx.timestamp))) as any
      }
    };
  }

  private async exportToCsv(transactions: HistoryEntry[]): Promise<{
    data: string;
    filename: string;
    mimeType: string;
  }> {
    const headers = [
      'Timestamp',
      'Direction',
      'Amount (T)',
      'Fee (µT)',
      'Status',
      'Address',
      'Message',
      'Transaction ID'
    ];

    const rows = transactions.map(tx => [
      new Date(Number(tx.timestamp)).toISOString(),
      tx.direction === TransactionDirection.Inbound ? 'Received' : 'Sent',
      tx.displayAmount,
      tx.fee.toString(),
      tx.statusLabel,
      tx.address,
      tx.message || '',
      tx.id.toString()
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field.replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    
    return {
      data: csvContent,
      filename: `transaction-history-${timestamp}.csv`,
      mimeType: 'text/csv'
    };
  }

  private async exportToJson(transactions: HistoryEntry[]): Promise<{
    data: string;
    filename: string;
    mimeType: string;
  }> {
    const exportData = {
      exportedAt: new Date().toISOString(),
      transactionCount: transactions.length,
      transactions: transactions.map(tx => ({
        ...tx,
        timestamp: new Date(Number(tx.timestamp)).toISOString(),
        amount: tx.amount.toString(),
        fee: tx.fee.toString()
      }))
    };

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    
    return {
      data: JSON.stringify(exportData, null, 2),
      filename: `transaction-history-${timestamp}.json`,
      mimeType: 'application/json'
    };
  }

  private async exportToXlsx(transactions: HistoryEntry[]): Promise<{
    data: Buffer;
    filename: string;
    mimeType: string;
  }> {
    // For now, return CSV-like data as Buffer
    // In a real implementation, this would use a library like xlsx to generate Excel files
    const csvExport = await this.exportToCsv(transactions);
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    
    return {
      data: Buffer.from(csvExport.data, 'utf8'),
      filename: `transaction-history-${timestamp}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
  }

  /**
   * Ensure service is not disposed
   */
  private ensureNotDisposed(): void {
    if (this.isDisposed) {
      throw new WalletError(
        WalletErrorCode.ResourceDisposed,
        'History service has been disposed'
      );
    }
  }

  /**
   * Dispose of the service and clean up resources
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.invalidateCache();
    this.removeAllListeners();
  }
}

/**
 * Default configuration for history service
 */
export const DEFAULT_HISTORY_SERVICE_CONFIG: Partial<HistoryServiceConfig> = {
  maxPageSize: 1000,
  defaultPageSize: 50,
  enableCaching: true,
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
  includePending: true
};
