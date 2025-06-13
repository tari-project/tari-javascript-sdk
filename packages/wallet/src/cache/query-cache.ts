import { MemoryDisposableResource as DisposableResource } from '@tari-project/tarijs-core';
// Note: MemoryUtils might need to be implemented or imported differently

/**
 * Intelligent caching layer for expensive queries
 * Uses WeakRef for memory-pressure-sensitive caching and TTL for expiration
 */

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Default TTL in milliseconds */
  defaultTTL: number;
  /** Maximum cache size (number of entries) */
  maxSize: number;
  /** Enable automatic cleanup of expired entries */
  enableAutoCleanup: boolean;
  /** Cleanup interval in milliseconds */
  cleanupInterval: number;
  /** Enable cache statistics */
  enableStats: boolean;
  /** Memory pressure threshold for automatic eviction */
  memoryPressureThreshold: number;
}

/**
 * Cache entry metadata
 */
export interface CacheEntry<T> {
  key: string;
  value: WeakRef<T>;
  expires: number;
  created: number;
  lastAccessed: number;
  hits: number;
  size: number;
  ttl: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  totalEntries: number;
  hits: number;
  misses: number;
  evictions: number;
  memoryEvictions: number;
  totalMemoryUsage: number;
  hitRatio: number;
  avgHits: number;
  oldestEntry: number;
  newestEntry: number;
}

/**
 * Cache invalidation pattern
 */
export interface InvalidationPattern {
  type: 'exact' | 'prefix' | 'suffix' | 'contains' | 'regex';
  pattern: string;
}

/**
 * Query fetcher function type
 */
export type QueryFetcher<T> = () => Promise<T>;

/**
 * Main query cache implementation
 */
export class QueryCache extends DisposableResource {
  private readonly config: CacheConfig;
  private readonly cache = new Map<string, CacheEntry<any>>();
  private readonly stats: CacheStats;
  private cleanupTimer?: NodeJS.Timeout;
  private readonly invalidationPatterns = new Set<InvalidationPattern>();

  constructor(config: Partial<CacheConfig> = {}) {
    super();
    
    this.config = {
      defaultTTL: 300000, // 5 minutes
      maxSize: 1000,
      enableAutoCleanup: true,
      cleanupInterval: 60000, // 1 minute
      enableStats: true,
      memoryPressureThreshold: 0.8,
      ...config
    };

    this.stats = {
      totalEntries: 0,
      hits: 0,
      misses: 0,
      evictions: 0,
      memoryEvictions: 0,
      totalMemoryUsage: 0,
      hitRatio: 0,
      avgHits: 0,
      oldestEntry: Number.MAX_SAFE_INTEGER,
      newestEntry: 0
    };

    if (this.config.enableAutoCleanup) {
      this.startCleanupTimer();
    }
  }

  /**
   * Get cached value or fetch if not available
   */
  async get<T>(
    key: string,
    fetcher: QueryFetcher<T>,
    ttl?: number
  ): Promise<T> {
    this.checkDisposed();

    // Try to get from cache first
    const cached = this.getCached<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    // Cache miss - fetch the value
    const value = await fetcher();
    
    // Store in cache
    this.set(key, value, ttl || this.config.defaultTTL);
    
    return value;
  }

  /**
   * Get cached value without fetching
   */
  getCached<T>(key: string): T | undefined {
    this.checkDisposed();

    const entry = this.cache.get(key);
    if (!entry) {
      this.recordMiss();
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      this.recordMiss();
      return undefined;
    }

    // Try to get value from WeakRef
    const value = entry.value.deref();
    if (value === undefined) {
      // Value was garbage collected
      this.cache.delete(key);
      this.recordMemoryEviction();
      return undefined;
    }

    // Update access metadata
    entry.lastAccessed = Date.now();
    entry.hits++;
    
    this.recordHit();
    return value;
  }

  /**
   * Set a value in the cache
   */
  set<T>(key: string, value: T, ttl?: number): void {
    this.checkDisposed();

    const actualTTL = ttl || this.config.defaultTTL;
    const now = Date.now();
    
    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Check cache size limit
    if (this.cache.size >= this.config.maxSize) {
      this.evictOldest();
    }

    // Check memory pressure
    if (MemoryUtils.isMemoryPressureHigh(this.config.memoryPressureThreshold)) {
      this.evictMemoryPressure();
    }

    const entry: CacheEntry<T> = {
      key,
      value: new WeakRef(value),
      expires: now + actualTTL,
      created: now,
      lastAccessed: now,
      hits: 0,
      size: MemoryUtils.estimateObjectSize(value),
      ttl: actualTTL
    };

    this.cache.set(key, entry);
    this.updateStatsForNewEntry(entry);
  }

  /**
   * Check if a key exists in cache (and is not expired)
   */
  has(key: string): boolean {
    this.checkDisposed();
    return this.getCached(key) !== undefined;
  }

  /**
   * Delete a specific key from cache
   */
  delete(key: string): boolean {
    this.checkDisposed();
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.checkDisposed();
    this.cache.clear();
    this.resetStats();
  }

  /**
   * Invalidate cache entries based on patterns
   */
  invalidate(pattern: InvalidationPattern): number {
    this.checkDisposed();

    let invalidated = 0;
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (this.matchesPattern(key, pattern)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      invalidated++;
    }

    return invalidated;
  }

  /**
   * Add a global invalidation pattern
   */
  addInvalidationPattern(pattern: InvalidationPattern): void {
    this.invalidationPatterns.add(pattern);
  }

  /**
   * Remove a global invalidation pattern
   */
  removeInvalidationPattern(pattern: InvalidationPattern): boolean {
    return this.invalidationPatterns.delete(pattern);
  }

  /**
   * Check all global invalidation patterns
   */
  checkInvalidationPatterns(): number {
    let totalInvalidated = 0;
    
    for (const pattern of this.invalidationPatterns) {
      totalInvalidated += this.invalidate(pattern);
    }
    
    return totalInvalidated;
  }

  /**
   * Manually trigger cleanup of expired entries
   */
  cleanup(): number {
    this.checkDisposed();

    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache) {
      // Check if expired
      if (now > entry.expires) {
        keysToDelete.push(key);
        continue;
      }

      // Check if value was garbage collected
      if (entry.value.deref() === undefined) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    return keysToDelete.length;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    if (!this.config.enableStats) {
      return { ...this.stats, totalEntries: this.cache.size };
    }

    // Update computed stats
    const totalRequests = this.stats.hits + this.stats.misses;
    this.stats.hitRatio = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    this.stats.totalEntries = this.cache.size;
    
    // Calculate memory usage
    let totalMemory = 0;
    let totalHits = 0;
    let oldest = Number.MAX_SAFE_INTEGER;
    let newest = 0;

    for (const entry of this.cache.values()) {
      totalMemory += entry.size;
      totalHits += entry.hits;
      oldest = Math.min(oldest, entry.created);
      newest = Math.max(newest, entry.created);
    }

    this.stats.totalMemoryUsage = totalMemory;
    this.stats.avgHits = this.cache.size > 0 ? totalHits / this.cache.size : 0;
    this.stats.oldestEntry = oldest === Number.MAX_SAFE_INTEGER ? 0 : oldest;
    this.stats.newestEntry = newest;

    return { ...this.stats };
  }

  /**
   * Get cache entries summary
   */
  getEntriesSummary(): Array<{
    key: string;
    created: number;
    lastAccessed: number;
    hits: number;
    size: number;
    ttl: number;
    expires: number;
    isExpired: boolean;
    isAlive: boolean;
  }> {
    const now = Date.now();
    const summary: any[] = [];

    for (const [key, entry] of this.cache) {
      summary.push({
        key,
        created: entry.created,
        lastAccessed: entry.lastAccessed,
        hits: entry.hits,
        size: entry.size,
        ttl: entry.ttl,
        expires: entry.expires,
        isExpired: now > entry.expires,
        isAlive: entry.value.deref() !== undefined
      });
    }

    return summary.sort((a, b) => b.lastAccessed - a.lastAccessed);
  }

  /**
   * Export cache configuration
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }

  /**
   * Update cache configuration
   */
  updateConfig(newConfig: Partial<CacheConfig>): void {
    Object.assign(this.config, newConfig);
    
    // Restart cleanup timer if settings changed
    if (this.config.enableAutoCleanup && !this.cleanupTimer) {
      this.startCleanupTimer();
    } else if (!this.config.enableAutoCleanup && this.cleanupTimer) {
      this.stopCleanupTimer();
    }
  }

  /**
   * Check if a key matches an invalidation pattern
   */
  private matchesPattern(key: string, pattern: InvalidationPattern): boolean {
    switch (pattern.type) {
      case 'exact':
        return key === pattern.pattern;
      
      case 'prefix':
        return key.startsWith(pattern.pattern);
      
      case 'suffix':
        return key.endsWith(pattern.pattern);
      
      case 'contains':
        return key.includes(pattern.pattern);
      
      case 'regex':
        try {
          const regex = new RegExp(pattern.pattern);
          return regex.test(key);
        } catch {
          return false;
        }
      
      default:
        return false;
    }
  }

  /**
   * Evict oldest entries when cache is full
   */
  private evictOldest(): void {
    if (this.cache.size === 0) return;

    // Find oldest entry by last accessed time
    let oldestKey: string | undefined;
    let oldestTime = Number.MAX_SAFE_INTEGER;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Evict entries under memory pressure
   */
  private evictMemoryPressure(): void {
    // Evict 20% of entries with lowest hit ratio
    const entriesToEvict = Math.floor(this.cache.size * 0.2);
    if (entriesToEvict === 0) return;

    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({ key, entry }))
      .sort((a, b) => {
        // Sort by hit ratio (hits per age)
        const ageA = Date.now() - a.entry.created;
        const ageB = Date.now() - b.entry.created;
        const ratioA = a.entry.hits / (ageA || 1);
        const ratioB = b.entry.hits / (ageB || 1);
        return ratioA - ratioB;
      });

    for (let i = 0; i < entriesToEvict && i < entries.length; i++) {
      this.cache.delete(entries[i].key);
      this.stats.memoryEvictions++;
    }
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      try {
        this.cleanup();
        this.checkInvalidationPatterns();
      } catch (error) {
        console.warn('Error during cache cleanup:', error);
      }
    }, this.config.cleanupInterval);
  }

  /**
   * Stop cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Record cache hit
   */
  private recordHit(): void {
    if (this.config.enableStats) {
      this.stats.hits++;
    }
  }

  /**
   * Record cache miss
   */
  private recordMiss(): void {
    if (this.config.enableStats) {
      this.stats.misses++;
    }
  }

  /**
   * Record memory eviction
   */
  private recordMemoryEviction(): void {
    if (this.config.enableStats) {
      this.stats.memoryEvictions++;
    }
  }

  /**
   * Update stats for new entry
   */
  private updateStatsForNewEntry<T>(entry: CacheEntry<T>): void {
    if (this.config.enableStats) {
      this.stats.totalMemoryUsage += entry.size;
    }
  }

  /**
   * Reset statistics
   */
  private resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
    this.stats.memoryEvictions = 0;
    this.stats.totalMemoryUsage = 0;
    this.stats.hitRatio = 0;
    this.stats.avgHits = 0;
    this.stats.oldestEntry = Number.MAX_SAFE_INTEGER;
    this.stats.newestEntry = 0;
  }

  /**
   * Dispose and cleanup
   */
  protected disposeSync(): void {
    this.stopCleanupTimer();
    this.cache.clear();
    this.invalidationPatterns.clear();
  }
}

/**
 * Factory for creating specialized caches
 */
export class QueryCacheFactory {
  /**
   * Create a high-performance cache for frequent queries
   */
  static createHighPerformance(): QueryCache {
    return new QueryCache({
      defaultTTL: 60000, // 1 minute
      maxSize: 2000,
      enableAutoCleanup: true,
      cleanupInterval: 30000, // 30 seconds
      enableStats: true,
      memoryPressureThreshold: 0.7
    });
  }

  /**
   * Create a long-term cache for expensive queries
   */
  static createLongTerm(): QueryCache {
    return new QueryCache({
      defaultTTL: 1800000, // 30 minutes
      maxSize: 500,
      enableAutoCleanup: true,
      cleanupInterval: 300000, // 5 minutes
      enableStats: true,
      memoryPressureThreshold: 0.8
    });
  }

  /**
   * Create a memory-efficient cache
   */
  static createMemoryEfficient(): QueryCache {
    return new QueryCache({
      defaultTTL: 300000, // 5 minutes
      maxSize: 200,
      enableAutoCleanup: true,
      cleanupInterval: 60000, // 1 minute
      enableStats: false,
      memoryPressureThreshold: 0.6
    });
  }

  /**
   * Create a cache for session-based data
   */
  static createSession(): QueryCache {
    return new QueryCache({
      defaultTTL: 900000, // 15 minutes
      maxSize: 100,
      enableAutoCleanup: true,
      cleanupInterval: 120000, // 2 minutes
      enableStats: true,
      memoryPressureThreshold: 0.85
    });
  }
}

/**
 * Global cache instances for common use cases
 */
export class GlobalCaches {
  private static balanceCache?: QueryCache;
  private static transactionCache?: QueryCache;
  private static contactCache?: QueryCache;
  private static utxoCache?: QueryCache;

  /**
   * Get balance query cache
   */
  static getBalanceCache(): QueryCache {
    if (!this.balanceCache) {
      this.balanceCache = QueryCacheFactory.createHighPerformance();
    }
    return this.balanceCache;
  }

  /**
   * Get transaction query cache
   */
  static getTransactionCache(): QueryCache {
    if (!this.transactionCache) {
      this.transactionCache = QueryCacheFactory.createLongTerm();
    }
    return this.transactionCache;
  }

  /**
   * Get contact query cache
   */
  static getContactCache(): QueryCache {
    if (!this.contactCache) {
      this.contactCache = QueryCacheFactory.createSession();
    }
    return this.contactCache;
  }

  /**
   * Get UTXO query cache
   */
  static getUtxoCache(): QueryCache {
    if (!this.utxoCache) {
      this.utxoCache = QueryCacheFactory.createMemoryEfficient();
    }
    return this.utxoCache;
  }

  /**
   * Dispose all global caches
   */
  static disposeAll(): void {
    this.balanceCache?.[Symbol.dispose]();
    this.transactionCache?.[Symbol.dispose]();
    this.contactCache?.[Symbol.dispose]();
    this.utxoCache?.[Symbol.dispose]();
    
    this.balanceCache = undefined;
    this.transactionCache = undefined;
    this.contactCache = undefined;
    this.utxoCache = undefined;
  }
}
