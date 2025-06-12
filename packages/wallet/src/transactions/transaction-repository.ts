/**
 * @fileoverview Transaction Repository
 * 
 * Repository pattern implementation for transaction data access and persistence.
 * Provides abstraction over transaction storage and retrieval with caching and
 * efficient querying capabilities.
 */

import {
  WalletError,
  WalletErrorCode,
  ErrorSeverity,
  withErrorContext,
  TypedEventEmitter,
  type WalletHandle,
  type TransactionId,
  type UnixTimestamp
} from '@tari-project/tarijs-core';
import type {
  TransactionInfo,
  Transaction,
  TransactionFilter,
  TransactionQueryOptions,
  TransactionStatusUpdate,
  TransactionSortBy
} from '@tari-project/tarijs-core';
import { TransactionStatus, TransactionDirection, TransactionUtils } from '@tari-project/tarijs-core';

/**
 * Configuration for the transaction repository
 */
export interface TransactionRepositoryConfig {
  /** Wallet handle for FFI operations */
  walletHandle: WalletHandle;
  /** Maximum number of transactions to keep in memory cache */
  maxHistorySize: number;
  /** Whether to persist transactions to disk */
  persistToDisk?: boolean;
  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
}

/**
 * Repository events
 */
export interface TransactionRepositoryEvents {
  'transaction:added': [transaction: TransactionInfo];
  'transaction:updated': [update: TransactionStatusUpdate];
  'transaction:removed': [transactionId: TransactionId];
  'cache:full': [size: number, limit: number];
}

/**
 * Cache entry for transactions
 */
interface CacheEntry {
  transaction: TransactionInfo;
  timestamp: number;
  lastAccessed: number;
}

/**
 * Query result metadata
 */
export interface QueryResult<T> {
  data: T[];
  totalCount: number;
  hasMore: boolean;
  nextOffset?: number;
}

/**
 * Transaction repository providing data access abstraction
 */
export class TransactionRepository extends TypedEventEmitter {
  private readonly config: TransactionRepositoryConfig;
  private readonly cache = new Map<TransactionId, CacheEntry>();
  private readonly indexByStatus = new Map<TransactionStatus, Set<TransactionId>>();
  private readonly indexByDirection = new Map<TransactionDirection, Set<TransactionId>>();
  private readonly indexByAddress = new Map<string, Set<TransactionId>>();
  private readonly sortedByTimestamp: TransactionId[] = [];
  private isDisposed = false;
  private cacheCleanupTimer?: NodeJS.Timeout;

  constructor(config: TransactionRepositoryConfig) {
    super();
    this.config = {
      ...config,
      cacheTtlMs: config.cacheTtlMs || 24 * 60 * 60 * 1000, // 24 hours default
      persistToDisk: config.persistToDisk || false
    };

    // Start cache cleanup timer
    this.startCacheCleanup();
  }

  /**
   * Add a new transaction to the repository
   */
  @withErrorContext('add_transaction', 'transaction_repository')
  async addTransaction(transaction: TransactionInfo): Promise<void> {
    this.ensureNotDisposed();

    if (this.cache.has(transaction.id)) {
      throw new WalletError(
        WalletErrorCode.DuplicateTransaction,
        `Transaction ${transaction.id} already exists`,
        { severity: ErrorSeverity.Error }
      );
    }

    // Check cache size limit
    if (this.cache.size >= this.config.maxHistorySize) {
      await this.evictOldestTransactions();
    }

    // Create cache entry
    const entry: CacheEntry = {
      transaction,
      timestamp: Date.now(),
      lastAccessed: Date.now()
    };

    // Add to cache and indexes
    this.cache.set(transaction.id, entry);
    this.addToIndexes(transaction);
    this.insertSorted(transaction.id, transaction.timestamp);

    // Emit event
    this.emit('transaction:added', transaction);

    // Persist if enabled
    if (this.config.persistToDisk) {
      await this.persistTransaction(transaction);
    }
  }

  /**
   * Update an existing transaction
   */
  @withErrorContext('update_transaction', 'transaction_repository')
  async updateTransaction(transaction: TransactionInfo): Promise<void> {
    this.ensureNotDisposed();

    const existingEntry = this.cache.get(transaction.id);
    if (!existingEntry) {
      throw new WalletError(
        WalletErrorCode.TransactionNotFound,
        `Transaction ${transaction.id} not found`,
        ErrorSeverity.Error
      );
    }

    const previousTransaction = existingEntry.transaction;

    // Remove from old indexes
    this.removeFromIndexes(previousTransaction);

    // Update cache entry
    existingEntry.transaction = transaction;
    existingEntry.lastAccessed = Date.now();

    // Add to new indexes
    this.addToIndexes(transaction);

    // Update sorted order if timestamp changed
    if (transaction.timestamp !== previousTransaction.timestamp) {
      this.removeSorted(transaction.id);
      this.insertSorted(transaction.id, transaction.timestamp);
    }

    // Create status update event
    const update: TransactionStatusUpdate = {
      id: transaction.id,
      previousStatus: previousTransaction.status,
      newStatus: transaction.status,
      timestamp: Date.now() as UnixTimestamp,
      details: this.extractUpdateDetails(previousTransaction, transaction)
    };

    // Emit events
    this.emit('transaction:updated', update);

    // Persist if enabled
    if (this.config.persistToDisk) {
      await this.persistTransaction(transaction);
    }
  }

  /**
   * Get a transaction by ID
   */
  @withErrorContext('get_transaction', 'transaction_repository')
  async getTransaction(transactionId: TransactionId): Promise<TransactionInfo | null> {
    this.ensureNotDisposed();

    const entry = this.cache.get(transactionId);
    if (!entry) {
      // Try loading from persistence if enabled
      if (this.config.persistToDisk) {
        const persisted = await this.loadPersistedTransaction(transactionId);
        if (persisted) {
          await this.addTransaction(persisted);
          return persisted;
        }
      }
      return null;
    }

    // Update last accessed time
    entry.lastAccessed = Date.now();
    return entry.transaction;
  }

  /**
   * Get transactions with filtering and pagination
   */
  @withErrorContext('get_transactions', 'transaction_repository')
  async getTransactions(
    filter?: TransactionFilter,
    options?: TransactionQueryOptions
  ): Promise<TransactionInfo[]> {
    this.ensureNotDisposed();

    let candidateIds: Set<TransactionId>;

    // Use indexes to optimize queries
    if (filter?.status && filter.status.length > 0) {
      candidateIds = new Set();
      for (const status of filter.status) {
        const statusIds = this.indexByStatus.get(status);
        if (statusIds) {
          statusIds.forEach(id => candidateIds.add(id));
        }
      }
    } else if (filter?.direction && filter.direction.length > 0) {
      candidateIds = new Set();
      for (const direction of filter.direction) {
        const directionIds = this.indexByDirection.get(direction);
        if (directionIds) {
          directionIds.forEach(id => candidateIds.add(id));
        }
      }
    } else if (filter?.address) {
      candidateIds = this.indexByAddress.get(filter.address) || new Set();
    } else {
      // No specific filter, use all transactions
      candidateIds = new Set(this.cache.keys());
    }

    // Get transactions from cache
    const candidates: TransactionInfo[] = [];
    for (const id of candidateIds) {
      const entry = this.cache.get(id);
      if (entry) {
        entry.lastAccessed = Date.now();
        candidates.push(entry.transaction);
      }
    }

    // Apply additional filtering
    let filtered = candidates;
    if (filter) {
      filtered = TransactionUtils.filter(candidates, filter);
    }

    // Apply sorting
    const sortBy = options?.sortBy || 'timestamp' as TransactionSortBy;
    const sortOrder = options?.sortOrder || 'desc';
    const sorted = TransactionUtils.sort(filtered, sortBy, sortOrder);

    // Apply pagination
    const offset = options?.offset || 0;
    const limit = options?.limit;
    
    if (limit !== undefined) {
      return sorted.slice(offset, offset + limit);
    }

    return sorted.slice(offset);
  }

  /**
   * Get query result with metadata
   */
  @withErrorContext('query_transactions', 'transaction_repository')
  async queryTransactions(
    filter?: TransactionFilter,
    options?: TransactionQueryOptions
  ): Promise<QueryResult<TransactionInfo>> {
    this.ensureNotDisposed();

    // Get all matching transactions first
    const allMatching = await this.getTransactions(filter);
    const totalCount = allMatching.length;

    // Apply pagination
    const offset = options?.offset || 0;
    const limit = options?.limit;
    
    let data: TransactionInfo[];
    let hasMore = false;
    let nextOffset: number | undefined;

    if (limit !== undefined) {
      data = allMatching.slice(offset, offset + limit);
      hasMore = offset + limit < totalCount;
      if (hasMore) {
        nextOffset = offset + limit;
      }
    } else {
      data = allMatching.slice(offset);
      hasMore = false;
    }

    return {
      data,
      totalCount,
      hasMore,
      nextOffset
    };
  }

  /**
   * Remove a transaction from the repository
   */
  @withErrorContext('remove_transaction', 'transaction_repository')
  async removeTransaction(transactionId: TransactionId): Promise<void> {
    this.ensureNotDisposed();

    const entry = this.cache.get(transactionId);
    if (!entry) {
      return; // Already removed
    }

    const transaction = entry.transaction;

    // Remove from cache and indexes
    this.cache.delete(transactionId);
    this.removeFromIndexes(transaction);
    this.removeSorted(transactionId);

    // Emit event
    this.emit('transaction:removed', transactionId);

    // Remove from persistence if enabled
    if (this.config.persistToDisk) {
      await this.removePersistedTransaction(transactionId);
    }
  }

  /**
   * Clear all transactions
   */
  @withErrorContext('clear_transactions', 'transaction_repository')
  async clear(): Promise<void> {
    this.ensureNotDisposed();

    const transactionIds = Array.from(this.cache.keys());

    // Clear all data structures
    this.cache.clear();
    this.indexByStatus.clear();
    this.indexByDirection.clear();
    this.indexByAddress.clear();
    this.sortedByTimestamp.length = 0;

    // Emit events for each removed transaction
    for (const id of transactionIds) {
      this.emit('transaction:removed', id);
    }

    // Clear persistence if enabled
    if (this.config.persistToDisk) {
      await this.clearPersistedTransactions();
    }
  }

  /**
   * Get repository statistics
   */
  getStatistics(): {
    totalTransactions: number;
    cacheSize: number;
    memoryUsage: number;
    oldestTransaction?: UnixTimestamp;
    newestTransaction?: UnixTimestamp;
    statusBreakdown: Record<TransactionStatus, number>;
    directionBreakdown: Record<TransactionDirection, number>;
  } {
    const stats = {
      totalTransactions: this.cache.size,
      cacheSize: this.cache.size,
      memoryUsage: this.estimateMemoryUsage(),
      statusBreakdown: {} as Record<TransactionStatus, number>,
      directionBreakdown: {} as Record<TransactionDirection, number>
    };

    // Initialize counters
    Object.values(TransactionStatus).forEach(status => {
      stats.statusBreakdown[status] = this.indexByStatus.get(status)?.size || 0;
    });
    Object.values(TransactionDirection).forEach(direction => {
      stats.directionBreakdown[direction] = this.indexByDirection.get(direction)?.size || 0;
    });

    // Get timestamp range
    if (this.sortedByTimestamp.length > 0) {
      const oldestId = this.sortedByTimestamp[0];
      const newestId = this.sortedByTimestamp[this.sortedByTimestamp.length - 1];
      const oldestEntry = this.cache.get(oldestId);
      const newestEntry = this.cache.get(newestId);
      
      if (oldestEntry) {
        (stats as any).oldestTransaction = oldestEntry.transaction.timestamp;
      }
      if (newestEntry) {
        (stats as any).newestTransaction = newestEntry.transaction.timestamp;
      }
    }

    return stats;
  }

  /**
   * Add transaction to indexes
   */
  private addToIndexes(transaction: TransactionInfo): void {
    // Status index
    let statusSet = this.indexByStatus.get(transaction.status);
    if (!statusSet) {
      statusSet = new Set();
      this.indexByStatus.set(transaction.status, statusSet);
    }
    statusSet.add(transaction.id);

    // Direction index
    let directionSet = this.indexByDirection.get(transaction.direction);
    if (!directionSet) {
      directionSet = new Set();
      this.indexByDirection.set(transaction.direction, directionSet);
    }
    directionSet.add(transaction.id);

    // Address index
    let addressSet = this.indexByAddress.get(transaction.address);
    if (!addressSet) {
      addressSet = new Set();
      this.indexByAddress.set(transaction.address, addressSet);
    }
    addressSet.add(transaction.id);
  }

  /**
   * Remove transaction from indexes
   */
  private removeFromIndexes(transaction: TransactionInfo): void {
    // Status index
    const statusSet = this.indexByStatus.get(transaction.status);
    if (statusSet) {
      statusSet.delete(transaction.id);
      if (statusSet.size === 0) {
        this.indexByStatus.delete(transaction.status);
      }
    }

    // Direction index
    const directionSet = this.indexByDirection.get(transaction.direction);
    if (directionSet) {
      directionSet.delete(transaction.id);
      if (directionSet.size === 0) {
        this.indexByDirection.delete(transaction.direction);
      }
    }

    // Address index
    const addressSet = this.indexByAddress.get(transaction.address);
    if (addressSet) {
      addressSet.delete(transaction.id);
      if (addressSet.size === 0) {
        this.indexByAddress.delete(transaction.address);
      }
    }
  }

  /**
   * Insert transaction ID in sorted order by timestamp
   */
  private insertSorted(transactionId: TransactionId, timestamp: UnixTimestamp): void {
    // Binary search for insertion point
    let left = 0;
    let right = this.sortedByTimestamp.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const midId = this.sortedByTimestamp[mid];
      const midEntry = this.cache.get(midId);
      
      if (midEntry && midEntry.transaction.timestamp < timestamp) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    this.sortedByTimestamp.splice(left, 0, transactionId);
  }

  /**
   * Remove transaction ID from sorted array
   */
  private removeSorted(transactionId: TransactionId): void {
    const index = this.sortedByTimestamp.indexOf(transactionId);
    if (index >= 0) {
      this.sortedByTimestamp.splice(index, 1);
    }
  }

  /**
   * Extract update details from transaction changes
   */
  private extractUpdateDetails(
    previous: TransactionInfo, 
    current: TransactionInfo
  ): TransactionStatusUpdate['details'] {
    const details: any = {};

    if ('blockHeight' in current && current.blockHeight !== (previous as any).blockHeight) {
      details.blockHeight = current.blockHeight;
    }

    if ('confirmations' in current && current.confirmations !== (previous as any).confirmations) {
      details.confirmations = current.confirmations;
    }

    if ('hash' in current && current.hash !== (previous as any).hash) {
      details.hash = current.hash;
    }

    if ('cancellationReason' in current) {
      details.cancellationReason = (current as any).cancellationReason;
    }

    return Object.keys(details).length > 0 ? details : undefined;
  }

  /**
   * Evict oldest transactions when cache is full
   */
  private async evictOldestTransactions(): Promise<void> {
    const entriesToEvict = Math.max(1, Math.floor(this.config.maxHistorySize * 0.1)); // Evict 10%
    const allEntries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    for (let i = 0; i < entriesToEvict && i < allEntries.length; i++) {
      const [transactionId] = allEntries[i];
      await this.removeTransaction(transactionId);
    }

    this.emit('cache:full', this.cache.size, this.config.maxHistorySize);
  }

  /**
   * Estimate memory usage
   */
  private estimateMemoryUsage(): number {
    // Rough estimate: each transaction ~1KB in memory
    return this.cache.size * 1024;
  }

  /**
   * Start cache cleanup timer
   */
  private startCacheCleanup(): void {
    this.cacheCleanupTimer = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000); // Clean up every minute
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredEntries(): void {
    if (this.isDisposed) return;

    const now = Date.now();
    const expiredIds: TransactionId[] = [];

    for (const [id, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.cacheTtlMs!) {
        expiredIds.push(id);
      }
    }

    // Remove expired entries
    for (const id of expiredIds) {
      this.removeTransaction(id).catch(() => {
        // Ignore cleanup errors
      });
    }
  }

  /**
   * Persistence methods (placeholder implementations)
   */
  private async persistTransaction(transaction: TransactionInfo): Promise<void> {
    // TODO: Implement disk persistence
    // This would save to IndexedDB in browser or SQLite in Node.js
  }

  private async loadPersistedTransaction(transactionId: TransactionId): Promise<TransactionInfo | null> {
    // TODO: Implement disk loading
    return null;
  }

  private async removePersistedTransaction(transactionId: TransactionId): Promise<void> {
    // TODO: Implement disk removal
  }

  private async clearPersistedTransactions(): Promise<void> {
    // TODO: Implement disk clearing
  }

  /**
   * Ensure repository is not disposed
   */
  private ensureNotDisposed(): void {
    if (this.isDisposed) {
      throw new WalletError(
        WalletErrorCode.ResourceDisposed,
        'Transaction repository has been disposed',
        ErrorSeverity.Error
      );
    }
  }

  /**
   * Dispose of the repository and clean up resources
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    // Stop cleanup timer
    if (this.cacheCleanupTimer) {
      clearInterval(this.cacheCleanupTimer);
      this.cacheCleanupTimer = undefined;
    }

    // Clear all data
    await this.clear();
    this.removeAllListeners();
  }

  /**
   * AsyncDisposable implementation
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }
}
