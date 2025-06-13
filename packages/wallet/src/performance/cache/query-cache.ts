/**
 * Query cache for performance optimization
 * Provides LRU eviction and memory management for cached query results
 */

export interface CacheEntry<T = any> {
  readonly key: string;
  readonly value: T;
  readonly timestamp: number;
  readonly size: number;
  readonly accessCount: number;
}

export interface CacheOptions {
  readonly maxSize?: number;
  readonly ttl?: number;
  readonly maxMemory?: number;
}

export interface CacheStats {
  readonly size: number;
  readonly hitRate: number;
  readonly totalHits: number;
  readonly totalMisses: number;
  readonly memoryUsage: number;
}

/**
 * LRU cache implementation for query optimization
 */
export class QueryCache<T = any> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly accessOrder = new Map<string, number>();
  private readonly options: Required<CacheOptions>;
  private hitCount = 0;
  private missCount = 0;
  private accessCounter = 0;

  constructor(options: CacheOptions = {}) {
    this.options = {
      maxSize: options.maxSize ?? 1000,
      ttl: options.ttl ?? 5 * 60 * 1000, // 5 minutes
      maxMemory: options.maxMemory ?? 50 * 1024 * 1024, // 50MB
    };
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.missCount++;
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.options.ttl) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.missCount++;
      return undefined;
    }

    // Update access order
    this.accessOrder.set(key, ++this.accessCounter);
    this.hitCount++;
    
    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T): void {
    const size = this.estimateSize(value);
    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: Date.now(),
      size,
      accessCount: 1,
    };

    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict if necessary
    this.evictIfNeeded(size);

    this.cache.set(key, entry);
    this.accessOrder.set(key, ++this.accessCounter);
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
    this.hitCount = 0;
    this.missCount = 0;
    this.accessCounter = 0;
  }

  /**
   * Get cache size (number of entries)
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.hitCount + this.missCount;
    return {
      size: this.cache.size,
      hitRate: totalRequests > 0 ? this.hitCount / totalRequests : 0,
      totalHits: this.hitCount,
      totalMisses: this.missCount,
      memoryUsage: this.getMemoryUsage(),
    };
  }

  /**
   * Evict entries to make room for new entry
   */
  private evictIfNeeded(newEntrySize: number): void {
    // Check size limit
    while (this.cache.size >= this.options.maxSize) {
      this.evictLRU();
    }

    // Check memory limit
    while (this.getMemoryUsage() + newEntrySize > this.options.maxMemory) {
      this.evictLRU();
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestAccess = Infinity;

    for (const [key, accessTime] of this.accessOrder) {
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
    }
  }

  /**
   * Estimate memory usage of cache
   */
  private getMemoryUsage(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.size;
    }
    return total;
  }

  /**
   * Estimate size of a cached value
   */
  private estimateSize(value: T): number {
    if (typeof value === 'string') {
      return value.length * 2; // Unicode chars are 2 bytes
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value).length * 2;
    }
    return 8; // Default size for primitives
  }
}
