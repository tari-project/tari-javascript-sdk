/**
 * @fileoverview Performance optimization and caching layer for storage operations
 * 
 * Provides intelligent caching with TTL management, LRU eviction, and secure
 * memory handling for storage operations across all platforms.
 */

import type { SecureStorage, StorageResult } from './secure-storage.js';

export interface CacheConfig {
  /** Maximum number of cached items */
  maxSize?: number;
  /** Default TTL in milliseconds */
  defaultTTL?: number;
  /** Enable memory encryption for cached values */
  enableEncryption?: boolean;
  /** Memory pressure threshold (0-1) for cache cleanup */
  memoryPressureThreshold?: number;
  /** Enable LRU eviction */
  enableLRU?: boolean;
  /** Enable cache metrics collection */
  enableMetrics?: boolean;
}

export interface CacheEntry {
  key: string;
  value: Buffer;
  timestamp: number;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
  encrypted: boolean;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  memoryUsage: number;
  totalOperations: number;
  averageAccessTime: number;
  hitRate: number;
}

/**
 * Simple XOR encryption for in-memory cache values
 */
class MemoryEncryption {
  private key: Buffer;

  constructor() {
    // Generate a random key for this session
    this.key = Buffer.allocUnsafe(32);
    require('crypto').randomFillSync(this.key);
  }

  encrypt(data: Buffer): Buffer {
    const encrypted = Buffer.allocUnsafe(data.length);
    for (let i = 0; i < data.length; i++) {
      encrypted[i] = data[i] ^ this.key[i % this.key.length];
    }
    return encrypted;
  }

  decrypt(encrypted: Buffer): Buffer {
    // XOR encryption is symmetric
    return this.encrypt(encrypted);
  }

  destroy(): void {
    this.key.fill(0);
  }
}

/**
 * LRU cache implementation with security features
 */
export class SecureStorageCache implements SecureStorage {
  private storage: SecureStorage;
  private cache = new Map<string, CacheEntry>();
  private config: Required<CacheConfig>;
  private encryption?: MemoryEncryption;
  private metrics: CacheMetrics;
  private accessOrder: string[] = [];

  constructor(storage: SecureStorage, config: CacheConfig = {}) {
    this.storage = storage;
    this.config = {
      maxSize: 1000,
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      enableEncryption: true,
      memoryPressureThreshold: 0.8,
      enableLRU: true,
      enableMetrics: true,
      ...config,
    };

    if (this.config.enableEncryption) {
      this.encryption = new MemoryEncryption();
    }

    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      memoryUsage: 0,
      totalOperations: 0,
      averageAccessTime: 0,
      hitRate: 0,
    };

    // Set up cleanup intervals
    this.setupCleanup();
  }

  async store(key: string, value: Buffer, options?: any): Promise<StorageResult> {
    const startTime = Date.now();
    
    try {
      // Store in underlying storage
      const result = await this.storage.store(key, value, options);
      
      if (result.success) {
        // Add to cache
        await this.addToCache(key, value, options?.ttl);
      }

      this.updateMetrics(startTime);
      return result;

    } catch (error) {
      this.updateMetrics(startTime);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Cache store operation failed',
      };
    }
  }

  async retrieve(key: string, options?: any): Promise<StorageResult<Buffer>> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cached = this.getFromCache(key);
      if (cached) {
        this.metrics.hits++;
        this.updateAccessOrder(key);
        this.updateMetrics(startTime);
        return { success: true, data: cached };
      }

      // Cache miss - fetch from storage
      this.metrics.misses++;
      const result = await this.storage.retrieve(key, options);
      
      if (result.success && result.data) {
        // Add to cache for future use
        await this.addToCache(key, result.data, options?.ttl);
      }

      this.updateMetrics(startTime);
      return result;

    } catch (error) {
      this.updateMetrics(startTime);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Cache retrieve operation failed',
      };
    }
  }

  async remove(key: string): Promise<StorageResult> {
    const startTime = Date.now();
    
    try {
      // Remove from cache
      this.removeFromCache(key);
      
      // Remove from underlying storage
      const result = await this.storage.remove(key);
      
      this.updateMetrics(startTime);
      return result;

    } catch (error) {
      this.updateMetrics(startTime);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Cache remove operation failed',
      };
    }
  }

  async exists(key: string): Promise<StorageResult<boolean>> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      if (this.cache.has(key)) {
        const entry = this.cache.get(key)!;
        if (entry.expiresAt > Date.now()) {
          this.metrics.hits++;
          this.updateAccessOrder(key);
          this.updateMetrics(startTime);
          return { success: true, data: true };
        } else {
          // Expired entry
          this.removeFromCache(key);
        }
      }

      // Check underlying storage
      this.metrics.misses++;
      const result = await this.storage.exists(key);
      
      this.updateMetrics(startTime);
      return result;

    } catch (error) {
      this.updateMetrics(startTime);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Cache exists operation failed',
      };
    }
  }

  async list(): Promise<StorageResult<string[]>> {
    // Always delegate to underlying storage for list operations
    return this.storage.list();
  }

  async getMetadata(key: string): Promise<StorageResult<any>> {
    // Delegate to underlying storage for metadata
    return this.storage.getMetadata(key);
  }

  async clear(): Promise<StorageResult> {
    const startTime = Date.now();
    
    try {
      // Clear cache
      this.clearCache();
      
      // Clear underlying storage
      const result = await this.storage.clear();
      
      this.updateMetrics(startTime);
      return result;

    } catch (error) {
      this.updateMetrics(startTime);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Cache clear operation failed',
      };
    }
  }

  async getInfo(): Promise<StorageResult<any>> {
    const storageInfo = await this.storage.getInfo();
    
    if (!storageInfo.success) {
      return storageInfo;
    }

    return {
      success: true,
      data: {
        ...storageInfo.data,
        cache: {
          enabled: true,
          config: this.config,
          metrics: this.getMetrics(),
          memoryUsage: this.calculateMemoryUsage(),
          entryCount: this.cache.size,
        },
      },
    };
  }

  async test(): Promise<StorageResult> {
    // Test both cache and underlying storage
    const testKey = `__cache_test_${Date.now()}`;
    const testValue = Buffer.from('cache test data');

    try {
      // Test store
      const storeResult = await this.store(testKey, testValue);
      if (!storeResult.success) {
        return storeResult;
      }

      // Test retrieve from cache
      const retrieveResult = await this.retrieve(testKey);
      if (!retrieveResult.success || !retrieveResult.data?.equals(testValue)) {
        return {
          success: false,
          error: 'Cache retrieve test failed',
        };
      }

      // Test remove
      const removeResult = await this.remove(testKey);
      if (!removeResult.success) {
        return removeResult;
      }

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Cache test failed',
      };
    }
  }

  /**
   * Add item to cache with optional TTL
   */
  private async addToCache(key: string, value: Buffer, ttl?: number): Promise<void> {
    const now = Date.now();
    const actualTTL = ttl ?? this.config.defaultTTL;
    
    let cacheValue = value;
    let encrypted = false;

    // Encrypt if enabled
    if (this.encryption) {
      cacheValue = this.encryption.encrypt(value);
      encrypted = true;
    }

    const entry: CacheEntry = {
      key,
      value: cacheValue,
      timestamp: now,
      expiresAt: now + actualTTL,
      accessCount: 1,
      lastAccessed: now,
      size: cacheValue.length,
      encrypted,
    };

    // Check if we need to evict items
    await this.ensureCapacity();

    this.cache.set(key, entry);
    this.updateAccessOrder(key);
    
    // Update memory usage
    this.metrics.memoryUsage += entry.size;
  }

  /**
   * Get item from cache if valid
   */
  private getFromCache(key: string): Buffer | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    
    // Check if expired
    if (entry.expiresAt <= now) {
      this.removeFromCache(key);
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = now;

    // Decrypt if necessary
    let value = entry.value;
    if (entry.encrypted && this.encryption) {
      value = this.encryption.decrypt(entry.value);
    }

    return value;
  }

  /**
   * Remove item from cache
   */
  private removeFromCache(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.metrics.memoryUsage -= entry.size;
      
      // Remove from access order
      const index = this.accessOrder.indexOf(key);
      if (index >= 0) {
        this.accessOrder.splice(index, 1);
      }
      
      // Clear sensitive data
      if (entry.encrypted) {
        entry.value.fill(0);
      }
    }
  }

  /**
   * Update access order for LRU
   */
  private updateAccessOrder(key: string): void {
    if (!this.config.enableLRU) return;

    // Remove from current position
    const index = this.accessOrder.indexOf(key);
    if (index >= 0) {
      this.accessOrder.splice(index, 1);
    }
    
    // Add to end (most recently used)
    this.accessOrder.push(key);
  }

  /**
   * Ensure cache doesn't exceed capacity
   */
  private async ensureCapacity(): Promise<void> {
    if (this.cache.size < this.config.maxSize) {
      return;
    }

    // Check memory pressure
    if (this.shouldEvictForMemoryPressure()) {
      await this.evictLeastRecentlyUsed(Math.floor(this.config.maxSize * 0.2)); // Evict 20%
      return;
    }

    // Standard LRU eviction
    if (this.config.enableLRU && this.accessOrder.length > 0) {
      const lruKey = this.accessOrder[0];
      this.removeFromCache(lruKey);
      this.metrics.evictions++;
    } else {
      // Evict oldest entry
      let oldestKey = '';
      let oldestTime = Date.now();
      
      for (const [key, entry] of this.cache) {
        if (entry.timestamp < oldestTime) {
          oldestTime = entry.timestamp;
          oldestKey = key;
        }
      }
      
      if (oldestKey) {
        this.removeFromCache(oldestKey);
        this.metrics.evictions++;
      }
    }
  }

  /**
   * Check if we should evict due to memory pressure
   */
  private shouldEvictForMemoryPressure(): boolean {
    try {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const usage = process.memoryUsage();
        const usageRatio = usage.heapUsed / usage.heapTotal;
        return usageRatio > this.config.memoryPressureThreshold;
      }
    } catch (error) {
      // Ignore errors in memory pressure detection
    }
    return false;
  }

  /**
   * Evict least recently used items
   */
  private async evictLeastRecentlyUsed(count: number): Promise<void> {
    if (!this.config.enableLRU) return;

    const toEvict = this.accessOrder.slice(0, count);
    for (const key of toEvict) {
      this.removeFromCache(key);
      this.metrics.evictions++;
    }
  }

  /**
   * Clear all cache entries
   */
  private clearCache(): void {
    // Securely clear sensitive data
    for (const entry of this.cache.values()) {
      if (entry.encrypted) {
        entry.value.fill(0);
      }
    }
    
    this.cache.clear();
    this.accessOrder = [];
    this.metrics.memoryUsage = 0;
  }

  /**
   * Calculate current memory usage
   */
  private calculateMemoryUsage(): number {
    let usage = 0;
    for (const entry of this.cache.values()) {
      usage += entry.size;
      usage += entry.key.length * 2; // Approximate string overhead
      usage += 64; // Approximate object overhead
    }
    return usage;
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(startTime: number): void {
    if (!this.config.enableMetrics) return;

    const duration = Date.now() - startTime;
    this.metrics.totalOperations++;
    
    // Update running average
    const prevAvg = this.metrics.averageAccessTime;
    const count = this.metrics.totalOperations;
    this.metrics.averageAccessTime = (prevAvg * (count - 1) + duration) / count;
    
    // Update hit rate
    const totalHits = this.metrics.hits;
    const totalAccess = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = totalAccess > 0 ? totalHits / totalAccess : 0;
  }

  /**
   * Get current cache metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Setup cleanup intervals
   */
  private setupCleanup(): void {
    // Clean up expired entries every minute
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60 * 1000);

    // Memory pressure cleanup every 30 seconds
    setInterval(() => {
      if (this.shouldEvictForMemoryPressure()) {
        this.evictLeastRecentlyUsed(Math.floor(this.cache.size * 0.1));
      }
    }, 30 * 1000);
  }

  /**
   * Remove expired entries
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.removeFromCache(key);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.clearCache();
    
    if (this.encryption) {
      this.encryption.destroy();
    }
  }
}
