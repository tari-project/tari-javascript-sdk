/**
 * @fileoverview Balance caching system with TTL and statistics
 * 
 * This module provides a caching layer for balance operations to improve
 * performance by reducing FFI calls while maintaining data freshness.
 */

import {
  WalletError,
  WalletErrorCode,
  ErrorSeverity
} from '@tari-project/tarijs-core';

/**
 * Cache entry with expiration
 */
interface CacheEntry<T> {
  /** Cached value */
  value: T;
  /** Timestamp when the entry was created */
  createdAt: number;
  /** Timestamp when the entry expires */
  expiresAt: number;
  /** Number of times this entry has been accessed */
  accessCount: number;
  /** Last access timestamp */
  lastAccessed: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total number of get operations */
  totalGets: number;
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Cache hit ratio (0-1) */
  hitRatio: number;
  /** Number of entries currently in cache */
  entryCount: number;
  /** Number of expired entries cleaned up */
  expiredCleanups: number;
  /** Total memory used (estimated in bytes) */
  estimatedMemoryUsage: number;
}

/**
 * Cache configuration options
 */
export interface CacheConfig {
  /** Default TTL in milliseconds */
  defaultTtlMs: number;
  /** Maximum number of entries before cleanup */
  maxEntries: number;
  /** How often to run cleanup (in milliseconds) */
  cleanupIntervalMs: number;
  /** Enable automatic cleanup */
  autoCleanup: boolean;
}

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG: CacheConfig = {
  defaultTtlMs: 5000, // 5 seconds
  maxEntries: 100,
  cleanupIntervalMs: 30000, // 30 seconds
  autoCleanup: true,
};

/**
 * Balance cache implementation with TTL and automatic cleanup
 */
export class BalanceCache {
  private readonly cache = new Map<string, CacheEntry<any>>();
  private readonly config: CacheConfig;
  private stats: CacheStats = {
    totalGets: 0,
    hits: 0,
    misses: 0,
    hitRatio: 0,
    entryCount: 0,
    expiredCleanups: 0,
    estimatedMemoryUsage: 0,
  };
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    defaultTtlMs: number = DEFAULT_CONFIG.defaultTtlMs,
    config: Partial<CacheConfig> = {}
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      defaultTtlMs,
      ...config
    };

    // Start automatic cleanup if enabled
    if (this.config.autoCleanup) {
      this.startCleanupTimer();
    }
  }

  /**
   * Get a value from the cache
   */
  get<T>(key: string): T | null {
    this.stats.totalGets++;

    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      this.updateHitRatio();
      return null;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.expiredCleanups++;
      this.updateStats();
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = now;
    this.stats.hits++;
    this.updateHitRatio();

    return entry.value as T;
  }

  /**
   * Set a value in the cache with optional TTL
   */
  set<T>(key: string, value: T, ttlMs?: number): void {
    const now = Date.now();
    const ttl = ttlMs || this.config.defaultTtlMs;

    // Check if we need to evict entries first
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldestEntries(Math.floor(this.config.maxEntries * 0.1)); // Evict 10%
    }

    const entry: CacheEntry<T> = {
      value,
      createdAt: now,
      expiresAt: now + ttl,
      accessCount: 0,
      lastAccessed: now,
    };

    this.cache.set(key, entry);
    this.updateStats();
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.updateStats();
      return false;
    }

    return true;
  }

  /**
   * Delete a specific key from the cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.updateStats();
    }
    return deleted;
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
    this.resetStats();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get all cache keys (for debugging)
   */
  getKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Update TTL for existing entry
   */
  updateTtl(ttlMs: number): void {
    this.config.defaultTtlMs = ttlMs;
  }

  /**
   * Refresh an existing entry's expiration time
   */
  refresh(key: string, ttlMs?: number): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    const ttl = ttlMs || this.config.defaultTtlMs;
    entry.expiresAt = Date.now() + ttl;
    return true;
  }

  /**
   * Get or set pattern: get value or compute and cache it
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    try {
      const value = await factory();
      this.set(key, value, ttlMs);
      return value;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to compute and cache value',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error
        }
      );
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.stats.expiredCleanups += cleanedCount;
      this.updateStats();
    }

    return cleanedCount;
  }

  /**
   * Force eviction of least recently used entries
   */
  evictLRU(count: number): number {
    if (count <= 0 || this.cache.size === 0) {
      return 0;
    }

    // Sort entries by last accessed time (oldest first)
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    const toEvict = Math.min(count, entries.length);
    for (let i = 0; i < toEvict; i++) {
      this.cache.delete(entries[i][0]);
    }

    this.updateStats();
    return toEvict;
  }

  /**
   * Get cache entries sorted by access frequency
   */
  getTopEntries(limit: number = 10): Array<{ key: string; accessCount: number; lastAccessed: Date }> {
    return Array.from(this.cache.entries())
      .map(([key, entry]) => ({
        key,
        accessCount: entry.accessCount,
        lastAccessed: new Date(entry.lastAccessed)
      }))
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);
  }

  /**
   * Dispose of the cache and stop timers
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Evict oldest entries by creation time
   */
  private evictOldestEntries(count: number): number {
    if (count <= 0 || this.cache.size === 0) {
      return 0;
    }

    // Sort entries by creation time (oldest first)
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.createdAt - b.createdAt);

    const toEvict = Math.min(count, entries.length);
    for (let i = 0; i < toEvict; i++) {
      this.cache.delete(entries[i][0]);
    }

    return toEvict;
  }

  /**
   * Update cache statistics
   */
  private updateStats(): void {
    this.stats.entryCount = this.cache.size;
    this.updateHitRatio();
    this.updateMemoryUsage();
  }

  /**
   * Update hit ratio calculation
   */
  private updateHitRatio(): void {
    this.stats.hitRatio = this.stats.totalGets > 0 
      ? this.stats.hits / this.stats.totalGets 
      : 0;
  }

  /**
   * Estimate memory usage (rough approximation)
   */
  private updateMemoryUsage(): void {
    let estimatedBytes = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      // Estimate key size (2 bytes per character for UTF-16)
      estimatedBytes += key.length * 2;
      
      // Estimate entry metadata size
      estimatedBytes += 40; // Rough estimate for entry object overhead
      
      // Estimate value size (simplified - assumes small balance objects)
      estimatedBytes += 100; // Rough estimate for balance object
    }
    
    this.stats.estimatedMemoryUsage = estimatedBytes;
  }

  /**
   * Reset statistics
   */
  private resetStats(): void {
    this.stats = {
      totalGets: 0,
      hits: 0,
      misses: 0,
      hitRatio: 0,
      entryCount: 0,
      expiredCleanups: 0,
      estimatedMemoryUsage: 0,
    };
  }
}
