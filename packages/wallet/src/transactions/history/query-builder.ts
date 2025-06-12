/**
 * @fileoverview Transaction History Query Builder
 * 
 * Provides a fluent interface for building complex transaction history queries
 * with support for filtering, sorting, pagination, and performance optimization.
 */

import {
  WalletError,
  WalletErrorCode,
  type UnixTimestamp
} from '@tari-project/tarijs-core';
import type { TransactionSortBy } from '@tari-project/tarijs-core';
import type {
  TransactionFilter,
  TransactionQueryOptions
} from '../../types/transaction-extensions.js';
import { TransactionStatus, TransactionDirection } from '@tari-project/tarijs-core';
import type { HistoryServiceConfig } from './history-service.js';

/**
 * Built query result containing optimized filter and options
 */
export interface BuiltQuery {
  filter: TransactionFilter;
  options: TransactionQueryOptions;
  metadata: {
    estimatedResultCount?: number;
    useIndex?: string;
    optimizationHints?: string[];
  };
}

/**
 * Query performance hints for optimization
 */
export interface QueryPerformanceHints {
  /** Estimated number of results */
  estimatedCount?: number;
  /** Suggested index to use */
  suggestedIndex?: string;
  /** Whether to use pagination optimization */
  usePaginationOptimization?: boolean;
  /** Whether to use filtering optimization */
  useFilterOptimization?: boolean;
}

/**
 * Transaction history query builder providing fluent interface for complex queries
 * 
 * Features:
 * - Fluent method chaining for readable query construction
 * - Automatic query optimization based on filters and sort order
 * - Index hint generation for performance
 * - Validation of query parameters
 * - Pagination strategy optimization
 * - Filter combination and normalization
 */
export class HistoryQueryBuilder {
  private readonly config: HistoryServiceConfig;
  private filter: TransactionFilter = {};
  private options: TransactionQueryOptions = {};

  constructor(config: HistoryServiceConfig) {
    this.config = config;
  }

  /**
   * Filter by transaction status
   */
  withStatus(status: TransactionStatus | TransactionStatus[]): this {
    this.filter.status = Array.isArray(status) ? status : [status];
    return this;
  }

  /**
   * Filter by transaction direction
   */
  withDirection(direction: TransactionDirection | TransactionDirection[]): this {
    this.filter.direction = Array.isArray(direction) ? direction : [direction];
    return this;
  }

  /**
   * Filter by date range
   */
  withDateRange(startDate: Date | UnixTimestamp, endDate?: Date | UnixTimestamp): this {
    this.filter.startDate = typeof startDate === 'object' ? 
      startDate.getTime() as UnixTimestamp : startDate;
    
    if (endDate) {
      this.filter.endDate = typeof endDate === 'object' ? 
        endDate.getTime() as UnixTimestamp : endDate;
    }
    
    return this;
  }

  /**
   * Filter by amount range
   */
  withAmountRange(minAmount?: bigint, maxAmount?: bigint): this {
    if (minAmount !== undefined) {
      this.filter.minAmount = minAmount as any;
    }
    if (maxAmount !== undefined) {
      this.filter.maxAmount = maxAmount as any;
    }
    return this;
  }

  /**
   * Filter by address (exact match or partial)
   */
  withAddress(address: string, exactMatch: boolean = false): this {
    if (exactMatch) {
      this.filter.address = address;
    } else {
      // For partial matching, we'd need to implement this in the repository
      this.filter.addressPattern = address;
    }
    return this;
  }

  /**
   * Filter by transaction message content
   */
  withMessage(messagePattern: string): this {
    this.filter.messagePattern = messagePattern;
    return this;
  }

  /**
   * Filter to include only transactions with fees above threshold
   */
  withMinimumFee(minFee: bigint): this {
    this.filter.minFee = minFee as any;
    return this;
  }

  /**
   * Filter for one-sided transactions only
   */
  onlyOneSided(): this {
    this.filter.isOneSided = true;
    return this;
  }

  /**
   * Filter for coinbase transactions only
   */
  onlyCoinbase(): this {
    this.filter.isCoinbase = true;
    return this;
  }

  /**
   * Exclude pending transactions
   */
  excludePending(): this {
    const currentStatus = this.filter.status || [];
    this.filter.status = currentStatus.filter(status => status !== TransactionStatus.Pending);
    return this;
  }

  /**
   * Only pending transactions
   */
  onlyPending(): this {
    this.filter.status = [TransactionStatus.Pending];
    return this;
  }

  /**
   * Set pagination parameters
   */
  withPagination(offset: number, limit: number): this {
    this.options.offset = offset;
    this.options.limit = Math.min(limit, this.config.maxPageSize);
    return this;
  }

  /**
   * Set page-based pagination
   */
  withPage(page: number, pageSize: number = this.config.defaultPageSize): this {
    const offset = page * pageSize;
    return this.withPagination(offset, pageSize);
  }

  /**
   * Set sorting options
   */
  sortBy(field: TransactionSortBy, order: 'asc' | 'desc' = 'desc'): this {
    this.options.sortBy = field;
    this.options.sortOrder = order;
    return this;
  }

  /**
   * Sort by timestamp (most common case)
   */
  sortByTimestamp(order: 'asc' | 'desc' = 'desc'): this {
    return this.sortBy('timestamp' as TransactionSortBy, order);
  }

  /**
   * Sort by amount
   */
  sortByAmount(order: 'asc' | 'desc' = 'desc'): this {
    return this.sortBy('amount' as TransactionSortBy, order);
  }

  /**
   * Sort by fee
   */
  sortByFee(order: 'asc' | 'desc' = 'desc'): this {
    return this.sortBy('fee' as TransactionSortBy, order);
  }

  /**
   * Add custom filter criteria
   */
  withCustomFilter(key: string, value: any): this {
    (this.filter as any)[key] = value;
    return this;
  }

  /**
   * Set query timeout
   */
  withTimeout(timeoutMs: number): this {
    this.options.timeoutMs = timeoutMs;
    return this;
  }

  /**
   * Enable/disable result caching for this query
   */
  withCaching(enabled: boolean): this {
    this.options.enableCaching = enabled;
    return this;
  }

  /**
   * Build the final query with optimizations
   */
  build(
    additionalFilter?: TransactionFilter,
    additionalOptions?: TransactionQueryOptions
  ): BuiltQuery {
    // Merge with additional parameters
    const finalFilter: TransactionFilter = {
      ...this.filter,
      ...additionalFilter
    };

    const finalOptions: TransactionQueryOptions = {
      ...this.options,
      ...additionalOptions
    };

    // Validate the query
    this.validateQuery(finalFilter, finalOptions);

    // Apply optimizations
    const optimizedQuery = this.optimizeQuery(finalFilter, finalOptions);

    // Generate performance hints
    const metadata = this.generateQueryMetadata(optimizedQuery.filter, optimizedQuery.options);

    return {
      filter: optimizedQuery.filter,
      options: optimizedQuery.options,
      metadata
    };
  }

  /**
   * Reset the builder to start a new query
   */
  reset(): this {
    this.filter = {};
    this.options = {};
    return this;
  }

  /**
   * Clone the current builder state
   */
  clone(): HistoryQueryBuilder {
    const cloned = new HistoryQueryBuilder(this.config);
    cloned.filter = { ...this.filter };
    cloned.options = { ...this.options };
    return cloned;
  }

  /**
   * Validate query parameters
   */
  private validateQuery(filter: TransactionFilter, options: TransactionQueryOptions): void {
    // Validate date range
    if (filter.startDate && filter.endDate && filter.startDate > filter.endDate) {
      throw new WalletError(
        WalletErrorCode.InvalidInput,
        'Start date cannot be after end date',
        { 
          context: { 
            metadata: { startDate: filter.startDate, endDate: filter.endDate } 
          } 
        }
      );
    }

    // Validate amount range
    if (filter.minAmount && filter.maxAmount && filter.minAmount > filter.maxAmount) {
      throw new WalletError(
        WalletErrorCode.InvalidInput,
        'Minimum amount cannot be greater than maximum amount',
        { 
          context: { 
            metadata: { minAmount: filter.minAmount.toString(), maxAmount: filter.maxAmount.toString() } 
          } 
        }
      );
    }

    // Validate pagination
    if (options.offset && options.offset < 0) {
      throw new WalletError(
        WalletErrorCode.InvalidInput,
        'Offset cannot be negative',
        { 
          context: { 
            metadata: { offset: options.offset } 
          } 
        }
      );
    }

    if (options.limit && options.limit <= 0) {
      throw new WalletError(
        WalletErrorCode.InvalidInput,
        'Limit must be positive',
        { 
          context: { 
            metadata: { limit: options.limit } 
          } 
        }
      );
    }

    if (options.limit && options.limit > this.config.maxPageSize) {
      throw new WalletError(
        WalletErrorCode.InvalidInput,
        `Limit cannot exceed maximum page size of ${this.config.maxPageSize}`,
        { 
          context: { 
            metadata: { limit: options.limit, maxPageSize: this.config.maxPageSize } 
          } 
        }
      );
    }
  }

  /**
   * Optimize query based on filters and access patterns
   */
  private optimizeQuery(
    filter: TransactionFilter,
    options: TransactionQueryOptions
  ): { filter: TransactionFilter; options: TransactionQueryOptions } {
    const optimizedFilter = { ...filter };
    const optimizedOptions = { ...options };

    // Optimization 1: If filtering by status, ensure most selective statuses come first
    if (optimizedFilter.status && optimizedFilter.status.length > 1) {
      optimizedFilter.status = this.orderStatusesBySelectivity(optimizedFilter.status);
    }

    // Optimization 2: If sorting by timestamp and have date filter, optimize pagination
    if (optimizedOptions.sortBy === 'timestamp' && (filter.startDate || filter.endDate)) {
      optimizedOptions.usePaginationOptimization = true;
    }

    // Optimization 3: For large offset values, suggest cursor-based pagination
    if ((optimizedOptions.offset || 0) > 1000) {
      optimizedOptions.useCursorPagination = true;
    }

    // Optimization 4: If filtering by direction, prioritize most common direction
    if (optimizedFilter.direction && optimizedFilter.direction.length > 1) {
      optimizedFilter.direction = this.orderDirectionsByFrequency(optimizedFilter.direction);
    }

    return {
      filter: optimizedFilter,
      options: optimizedOptions
    };
  }

  /**
   * Generate query metadata for performance monitoring
   */
  private generateQueryMetadata(
    filter: TransactionFilter,
    options: TransactionQueryOptions
  ): BuiltQuery['metadata'] {
    const metadata: BuiltQuery['metadata'] = {
      optimizationHints: []
    };

    // Estimate result count based on filters
    metadata.estimatedResultCount = this.estimateResultCount(filter);

    // Suggest appropriate index
    metadata.useIndex = this.suggestIndex(filter, options);

    // Generate optimization hints
    if (filter.status) {
      metadata.optimizationHints?.push('status-index-available');
    }

    if (filter.startDate || filter.endDate) {
      metadata.optimizationHints?.push('timestamp-index-recommended');
    }

    if ((options.offset || 0) > 1000) {
      metadata.optimizationHints?.push('cursor-pagination-recommended');
    }

    if (filter.address) {
      metadata.optimizationHints?.push('address-index-required');
    }

    return metadata;
  }

  /**
   * Estimate result count based on filter selectivity
   */
  private estimateResultCount(filter: TransactionFilter): number {
    let estimate = 10000; // Base estimate

    // Reduce estimate based on filters
    if (filter.status && filter.status.length === 1) {
      estimate *= 0.6; // Status filter is moderately selective
    }

    if (filter.direction && filter.direction.length === 1) {
      estimate *= 0.5; // Direction filter is fairly selective
    }

    if (filter.startDate && filter.endDate) {
      const timeRange = Number(filter.endDate) - Number(filter.startDate);
      const dayRange = timeRange / (24 * 60 * 60 * 1000);
      if (dayRange < 7) {
        estimate *= 0.1; // Weekly range is very selective
      } else if (dayRange < 30) {
        estimate *= 0.3; // Monthly range is selective
      } else if (dayRange < 365) {
        estimate *= 0.7; // Yearly range is somewhat selective
      }
    }

    if (filter.address) {
      estimate *= 0.05; // Address filter is highly selective
    }

    if (filter.minAmount || filter.maxAmount) {
      estimate *= 0.4; // Amount filter is moderately selective
    }

    return Math.max(1, Math.floor(estimate));
  }

  /**
   * Suggest the most appropriate index for the query
   */
  private suggestIndex(filter: TransactionFilter, options: TransactionQueryOptions): string {
    // Primary index selection based on filters and sort order
    if (options.sortBy === 'timestamp' && (filter.startDate || filter.endDate)) {
      return 'timestamp_composite';
    }

    if (filter.status && filter.direction) {
      return 'status_direction_composite';
    }

    if (filter.status) {
      return 'status_index';
    }

    if (filter.address) {
      return 'address_index';
    }

    if (options.sortBy === 'amount') {
      return 'amount_index';
    }

    // Default to timestamp index for most queries
    return 'timestamp_index';
  }

  /**
   * Order transaction statuses by selectivity (most selective first)
   */
  private orderStatusesBySelectivity(statuses: TransactionStatus[]): TransactionStatus[] {
    const selectivityOrder = [
      TransactionStatus.Cancelled,
      TransactionStatus.Failed,
      TransactionStatus.Pending,
      TransactionStatus.Completed
    ];

    return statuses.sort((a, b) => {
      const aIndex = selectivityOrder.indexOf(a);
      const bIndex = selectivityOrder.indexOf(b);
      return aIndex - bIndex;
    });
  }

  /**
   * Order directions by frequency (most common first for early filtering)
   */
  private orderDirectionsByFrequency(directions: TransactionDirection[]): TransactionDirection[] {
    // In most wallets, outbound transactions are more common
    const frequencyOrder = [
      TransactionDirection.Outbound,
      TransactionDirection.Inbound
    ];

    return directions.sort((a, b) => {
      const aIndex = frequencyOrder.indexOf(a);
      const bIndex = frequencyOrder.indexOf(b);
      return aIndex - bIndex;
    });
  }

  /**
   * Static factory methods for common query patterns
   */
  static forRecentTransactions(config: HistoryServiceConfig, days: number = 30): HistoryQueryBuilder {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return new HistoryQueryBuilder(config)
      .withDateRange(cutoffDate)
      .sortByTimestamp('desc')
      .withPagination(0, config.defaultPageSize);
  }

  static forInboundTransactions(config: HistoryServiceConfig): HistoryQueryBuilder {
    return new HistoryQueryBuilder(config)
      .withDirection(TransactionDirection.Inbound)
      .sortByTimestamp('desc');
  }

  static forOutboundTransactions(config: HistoryServiceConfig): HistoryQueryBuilder {
    return new HistoryQueryBuilder(config)
      .withDirection(TransactionDirection.Outbound)
      .sortByTimestamp('desc');
  }

  static forPendingTransactions(config: HistoryServiceConfig): HistoryQueryBuilder {
    return new HistoryQueryBuilder(config)
      .onlyPending()
      .sortByTimestamp('desc');
  }

  static forLargeTransactions(
    config: HistoryServiceConfig,
    minAmount: bigint
  ): HistoryQueryBuilder {
    return new HistoryQueryBuilder(config)
      .withAmountRange(minAmount)
      .sortByAmount('desc');
  }
}
