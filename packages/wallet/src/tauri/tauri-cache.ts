/**
 * @fileoverview Tauri-optimized caching layer for storage operations
 * 
 * Provides specialized caching for Tauri's invoke system with
 * memory-efficient operation batching and reduced IPC overhead.
 */

import type { SecureStorage, StorageResult } from '../platform/storage/secure-storage.js';
import { StorageResults } from '../platform/storage/types/storage-result.js';
import type { CacheConfig, CacheEntry, CacheMetrics } from '../platform/storage/cache.js';

/**
 * Tauri-specific cache configuration
 */
export interface TauriCacheConfig extends CacheConfig {
  /** Enable IPC call deduplication */
  enableDeduplication?: boolean;
  /** Prefetch related keys on cache miss */
  enablePrefetching?: boolean;
  /** Background cache warming */
  enableBackgroundWarming?: boolean;
  /** Tauri-specific serialization optimizations */
  optimizeSerialization?: boolean;
  /** Maximum concurrent IPC operations */
  maxConcurrentOperations?: number;
}

/**
 * Tauri cache entry with additional metadata
 */
interface TauriCacheEntry extends CacheEntry {
  /** IPC operation ID for tracking */
  operationId?: string;
  /** Serialization format used */
  serializationFormat: 'buffer' | 'array' | 'compressed';
  /** Original size before compression */
  originalSize: number;
  /** Access pattern for prefetching */
  accessPattern: string[];
}

/**
 * Tauri cache metrics with IPC tracking
 */
interface TauriCacheMetrics extends CacheMetrics {
  /** IPC operations saved through caching */
  ipcOperationsSaved: number;
  /** Data compression ratio */
  compressionRatio: number;
  /** Prefetch hit rate */
  prefetchHitRate: number;
  /** Deduplication savings */
  deduplicationSavings: number;
}

/**
 * Pending operation tracker for deduplication
 */
interface PendingOperation {
  key: string;
  operation: 'retrieve' | 'exists' | 'getMetadata';
  promise: Promise<any>;
  requestors: Array<{
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }>;
}

/**
 * Memory-efficient XOR encryption for Tauri cache
 */
class TauriMemoryEncryption {
  private key: Uint8Array;

  constructor() {
    // Generate a random key using Tauri's crypto if available
    this.key = new Uint8Array(32);
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(this.key);
    } else {
      // Fallback to simple random
      for (let i = 0; i < this.key.length; i++) {
        this.key[i] = Math.floor(Math.random() * 256);
      }
    }
  }

  encrypt(data: Buffer): Uint8Array {
    const encrypted = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      encrypted[i] = data[i] ^ this.key[i % this.key.length];
    }
    return encrypted;
  }

  decrypt(encrypted: Uint8Array): Buffer {
    const decrypted = new Uint8Array(encrypted.length);
    for (let i = 0; i < encrypted.length; i++) {
      decrypted[i] = encrypted[i] ^ this.key[i % this.key.length];
    }
    return Buffer.from(decrypted);
  }

  destroy(): void {
    this.key.fill(0);
  }
}

/**
 * Tauri-optimized secure storage cache
 */
export class TauriSecureStorageCache implements SecureStorage {
  private storage: SecureStorage;
  private cache = new Map<string, TauriCacheEntry>();
  private config: Required<TauriCacheConfig>;
  private encryption?: TauriMemoryEncryption;
  private metrics: TauriCacheMetrics;
  private accessOrder: string[] = [];
  private pendingOperations = new Map<string, PendingOperation>();
  private prefetchQueue = new Set<string>();
  private backgroundTasks = new Set<Promise<void>>();
  private operationCounter = 0;

  constructor(storage: SecureStorage, config: TauriCacheConfig = {}) {
    this.storage = storage;
    this.config = {
      maxSize: 1000,
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      enableEncryption: true,
      memoryPressureThreshold: 0.8,
      enableLRU: true,
      enableMetrics: true,
      enableDeduplication: true,
      enablePrefetching: true,
      enableBackgroundWarming: false,
      optimizeSerialization: true,
      maxConcurrentOperations: 5,
      ...config,
    };

    if (this.config.enableEncryption) {
      this.encryption = new TauriMemoryEncryption();
    }

    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      memoryUsage: 0,
      totalOperations: 0,
      averageAccessTime: 0,
      hitRate: 0,
      ipcOperationsSaved: 0,
      compressionRatio: 0,
      prefetchHitRate: 0,
      deduplicationSavings: 0,
    };

    this.setupCleanup();
    
    if (this.config.enableBackgroundWarming) {
      this.startBackgroundWarming();
    }
  }

  async store(key: string, value: Buffer, options?: any): Promise<StorageResult<void>> {
    const startTime = Date.now();
    
    try {
      // Store in underlying storage
      const result = await this.storage.store(key, value, options);
      
      if (StorageResults.isOk(result)) {
        // Add to cache with Tauri optimizations
        await this.addToTauriCache(key, value, options?.ttl);
        
        // Update access pattern for prefetching
        this.updateAccessPattern(key);
      }

      this.updateMetrics(startTime);
      return result;

    } catch (error) {
      this.updateMetrics(startTime);
      return StorageResults.internalError(error instanceof Error ? error.message : 'Cache store operation failed');
    }
  }

  async retrieve(key: string, options?: any): Promise<StorageResult<Buffer>> {
    const startTime = Date.now();
    
    try {
      // Check for pending operations first (deduplication)
      if (this.config.enableDeduplication && this.pendingOperations.has(key)) {
        const pending = this.pendingOperations.get(key)!;
        if (pending.operation === 'retrieve') {
          this.metrics.deduplicationSavings++;
          
          return new Promise((resolve, reject) => {
            pending.requestors.push({ resolve, reject });
          });
        }
      }

      // Check cache first
      const cached = this.getFromTauriCache(key);
      if (cached) {
        this.metrics.hits++;
        this.metrics.ipcOperationsSaved++;
        this.updateAccessOrder(key);
        this.updateMetrics(startTime);
        
        // Trigger prefetching if enabled
        if (this.config.enablePrefetching) {
          this.triggerPrefetch(key);
        }
        
        return StorageResults.ok(cached);
      }

      // Cache miss - fetch from storage with deduplication
      this.metrics.misses++;
      
      const operationPromise = this.storage.retrieve(key, options);
      
      if (this.config.enableDeduplication) {
        const pendingOp: PendingOperation = {
          key,
          operation: 'retrieve',
          promise: operationPromise,
          requestors: [],
        };
        
        this.pendingOperations.set(key, pendingOp);
        
        // Clean up when done
        operationPromise.finally(() => {
          this.pendingOperations.delete(key);
        });
      }
      
      const result = await operationPromise;
      
      if (StorageResults.isOk(result) && result.value) {
        // Add to cache for future use
        await this.addToTauriCache(key, result.value, options?.ttl);
        this.updateAccessPattern(key);
      }

      this.updateMetrics(startTime);
      return result;

    } catch (error) {
      this.updateMetrics(startTime);
      return StorageResults.internalError(error instanceof Error ? error.message : 'Cache retrieve operation failed');
    }
  }

  async remove(key: string): Promise<StorageResult<void>> {
    const startTime = Date.now();
    
    try {
      // Remove from cache first
      this.removeFromTauriCache(key);
      
      // Remove from underlying storage
      const result = await this.storage.remove(key);
      
      this.updateMetrics(startTime);
      return result;

    } catch (error) {
      this.updateMetrics(startTime);
      return StorageResults.internalError(error instanceof Error ? error.message : 'Cache remove operation failed');
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
          this.metrics.ipcOperationsSaved++;
          this.updateAccessOrder(key);
          this.updateMetrics(startTime);
          return StorageResults.ok(true);
        } else {
          // Expired entry
          this.removeFromTauriCache(key);
        }
      }

      // Check underlying storage with deduplication
      this.metrics.misses++;
      
      if (this.config.enableDeduplication && this.pendingOperations.has(key)) {
        const pending = this.pendingOperations.get(key)!;
        if (pending.operation === 'exists') {
          this.metrics.deduplicationSavings++;
          
          return new Promise((resolve, reject) => {
            pending.requestors.push({ resolve, reject });
          });
        }
      }
      
      const result = await this.storage.exists(key);
      
      this.updateMetrics(startTime);
      return result;

    } catch (error) {
      this.updateMetrics(startTime);
      return StorageResults.internalError(error instanceof Error ? error.message : 'Cache exists operation failed');
    }
  }

  async list(): Promise<StorageResult<string[]>> {
    // Always delegate to underlying storage for list operations
    return this.storage.list();
  }

  async getMetadata(key: string): Promise<StorageResult<any>> {
    // Check cache for metadata if available
    if (this.cache.has(key)) {
      const entry = this.cache.get(key)!;
      if (entry.expiresAt > Date.now()) {
        this.metrics.hits++;
        this.metrics.ipcOperationsSaved++;
        
        return StorageResults.ok({
          createdAt: new Date(entry.timestamp),
          modifiedAt: new Date(entry.lastAccessed),
          size: entry.originalSize,
          encrypted: entry.encrypted,
        });
      }
    }
    
    // Delegate to underlying storage
    return this.storage.getMetadata(key);
  }

  async clear(): Promise<StorageResult<void>> {
    const startTime = Date.now();
    
    try {
      // Clear cache
      this.clearTauriCache();
      
      // Clear underlying storage
      const result = await this.storage.clear();
      
      this.updateMetrics(startTime);
      return result;

    } catch (error) {
      this.updateMetrics(startTime);
      return StorageResults.internalError(error instanceof Error ? error.message : 'Cache clear operation failed');
    }
  }

  async getInfo(): Promise<StorageResult<any>> {
    const storageInfo = await this.storage.getInfo();
    
    if (StorageResults.isError(storageInfo)) {
      return storageInfo;
    }

    return StorageResults.ok({
      ...storageInfo.value,
        tauriCache: {
          enabled: true,
          config: this.config,
          metrics: this.getTauriMetrics(),
          memoryUsage: this.calculateMemoryUsage(),
          entryCount: this.cache.size,
          pendingOperations: this.pendingOperations.size,
          backgroundTasks: this.backgroundTasks.size,
        },
      });
  }

  async test(): Promise<StorageResult<void>> {
    return this.storage.test();
  }

  /**
   * Add item to Tauri cache with optimizations
   */
  private async addToTauriCache(key: string, value: Buffer, ttl?: number): Promise<void> {
    const now = Date.now();
    const actualTTL = ttl ?? this.config.defaultTTL;
    
    // Optimize serialization format
    let cacheValue: Uint8Array;
    let serializationFormat: 'buffer' | 'array' | 'compressed' = 'buffer';
    let originalSize = value.length;
    
    if (this.config.optimizeSerialization) {
      // For larger values, use compression
      if (value.length > 1024) {
        cacheValue = this.compressValue(value);
        serializationFormat = 'compressed';
      } else {
        cacheValue = new Uint8Array(value);
      }
    } else {
      cacheValue = new Uint8Array(value);
    }
    
    // Encrypt if enabled
    let encrypted = false;
    if (this.encryption) {
      cacheValue = this.encryption.encrypt(Buffer.from(cacheValue));
      encrypted = true;
    }

    const entry: TauriCacheEntry = {
      key,
      value: Buffer.from(cacheValue),
      timestamp: now,
      expiresAt: now + actualTTL,
      accessCount: 1,
      lastAccessed: now,
      size: cacheValue.length,
      encrypted,
      operationId: this.generateOperationId(),
      serializationFormat,
      originalSize,
      accessPattern: [],
    };

    // Check if we need to evict items
    await this.ensureCapacity();

    this.cache.set(key, entry);
    this.updateAccessOrder(key);
    
    // Update memory usage and compression metrics
    this.metrics.memoryUsage += entry.size;
    if (serializationFormat === 'compressed') {
      this.updateCompressionRatio(originalSize, entry.size);
    }
  }

  /**
   * Get item from Tauri cache with optimizations
   */
  private getFromTauriCache(key: string): Buffer | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    
    // Check if expired
    if (entry.expiresAt <= now) {
      this.removeFromTauriCache(key);
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = now;

    // Decrypt and decompress if necessary
    let value = entry.value;
    
    if (entry.encrypted && this.encryption) {
      value = this.encryption.decrypt(new Uint8Array(entry.value));
    }
    
    if (entry.serializationFormat === 'compressed') {
      value = this.decompressValue(new Uint8Array(value));
    }

    return Buffer.from(value);
  }

  /**
   * Remove item from Tauri cache
   */
  private removeFromTauriCache(key: string): void {
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
   * Update access pattern for prefetching
   */
  private updateAccessPattern(key: string): void {
    if (!this.config.enablePrefetching) return;
    
    // Simple access pattern tracking
    const recentAccess = this.accessOrder.slice(-5);
    
    for (const [cacheKey, entry] of this.cache) {
      if (cacheKey !== key && recentAccess.includes(cacheKey)) {
        entry.accessPattern.push(key);
        // Keep only recent patterns
        if (entry.accessPattern.length > 10) {
          entry.accessPattern = entry.accessPattern.slice(-10);
        }
      }
    }
  }

  /**
   * Trigger prefetching based on access patterns
   */
  private triggerPrefetch(key: string): void {
    if (!this.config.enablePrefetching) return;
    
    const entry = this.cache.get(key);
    if (!entry || entry.accessPattern.length === 0) return;
    
    // Find frequently accessed together keys
    const candidates = entry.accessPattern
      .filter((k, i, arr) => arr.indexOf(k) === i) // unique
      .filter(k => !this.cache.has(k) && !this.prefetchQueue.has(k))
      .slice(0, 3); // limit prefetch count
    
    for (const candidate of candidates) {
      this.prefetchQueue.add(candidate);
      this.backgroundPrefetch(candidate);
    }
  }

  /**
   * Background prefetch operation
   */
  private async backgroundPrefetch(key: string): Promise<void> {
    try {
      const result = await this.storage.retrieve(key);
      if (StorageResults.isOk(result) && result.value) {
        await this.addToTauriCache(key, result.value);
        this.metrics.prefetchHitRate = 
          (this.metrics.prefetchHitRate * 0.9) + (1 * 0.1); // Exponential moving average
      }
    } catch (error) {
      // Ignore prefetch errors
    } finally {
      this.prefetchQueue.delete(key);
    }
  }

  /**
   * Simple compression using RLE (Run Length Encoding)
   */
  private compressValue(value: Buffer): Uint8Array {
    // Simple RLE compression for demonstration
    const compressed: number[] = [];
    let i = 0;
    
    while (i < value.length) {
      let count = 1;
      const current = value[i];
      
      while (i + count < value.length && value[i + count] === current && count < 255) {
        count++;
      }
      
      compressed.push(count, current);
      i += count;
    }
    
    return new Uint8Array(compressed);
  }

  /**
   * Decompress RLE compressed value
   */
  private decompressValue(compressed: Uint8Array): Buffer {
    const decompressed: number[] = [];
    
    for (let i = 0; i < compressed.length; i += 2) {
      const count = compressed[i];
      const value = compressed[i + 1];
      
      for (let j = 0; j < count; j++) {
        decompressed.push(value);
      }
    }
    
    return Buffer.from(decompressed);
  }

  /**
   * Update compression ratio metrics
   */
  private updateCompressionRatio(originalSize: number, compressedSize: number): void {
    const ratio = originalSize > 0 ? compressedSize / originalSize : 1;
    this.metrics.compressionRatio = 
      (this.metrics.compressionRatio * 0.9) + (ratio * 0.1); // Exponential moving average
  }

  /**
   * Start background warming process
   */
  private startBackgroundWarming(): void {
    if (!this.config.enableBackgroundWarming) return;
    
    const warmingTask = this.performBackgroundWarming();
    this.backgroundTasks.add(warmingTask);
    
    warmingTask.finally(() => {
      this.backgroundTasks.delete(warmingTask);
    });
  }

  /**
   * Background cache warming
   */
  private async performBackgroundWarming(): Promise<void> {
    try {
      // Get list of keys to warm
      const listResult = await this.storage.list();
      if (StorageResults.isError(listResult) || !listResult.value) return;
      
      // Warm most recently accessed keys
      const keysToWarm = listResult.value
        .slice(0, Math.min(10, this.config.maxSize / 4)); // Warm 25% of cache
      
      for (const key of keysToWarm) {
        if (this.cache.has(key)) continue;
        
        try {
          const result = await this.storage.retrieve(key);
          if (StorageResults.isOk(result) && result.value) {
            await this.addToTauriCache(key, result.value);
          }
        } catch (error) {
          // Ignore individual warming errors
        }
      }
    } catch (error) {
      // Ignore warming errors
    }
  }

  /**
   * Clear all cache entries
   */
  private clearTauriCache(): void {
    // Securely clear sensitive data
    for (const entry of this.cache.values()) {
      if (entry.encrypted) {
        entry.value.fill(0);
      }
    }
    
    this.cache.clear();
    this.accessOrder = [];
    this.metrics.memoryUsage = 0;
    this.pendingOperations.clear();
    this.prefetchQueue.clear();
  }

  /**
   * Generate operation ID
   */
  private generateOperationId(): string {
    return `tauri-cache-${Date.now()}-${++this.operationCounter}`;
  }

  /**
   * Update access order for LRU
   */
  private updateAccessOrder(key: string): void {
    if (!this.config.enableLRU) return;

    const index = this.accessOrder.indexOf(key);
    if (index >= 0) {
      this.accessOrder.splice(index, 1);
    }
    
    this.accessOrder.push(key);
  }

  /**
   * Ensure cache doesn't exceed capacity
   */
  private async ensureCapacity(): Promise<void> {
    if (this.cache.size < this.config.maxSize) {
      return;
    }

    // Evict LRU entries
    const evictCount = Math.floor(this.config.maxSize * 0.1); // Evict 10%
    const toEvict = this.accessOrder.slice(0, evictCount);
    
    for (const key of toEvict) {
      this.removeFromTauriCache(key);
      this.metrics.evictions++;
    }
  }

  /**
   * Calculate current memory usage
   */
  private calculateMemoryUsage(): number {
    let usage = 0;
    for (const entry of this.cache.values()) {
      usage += entry.size;
      usage += entry.key.length * 2;
      usage += 128; // Approximate object overhead
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
   * Get current Tauri cache metrics
   */
  getTauriMetrics(): TauriCacheMetrics {
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
      this.removeFromTauriCache(key);
    }
  }

  /**
   * Check if we should evict due to memory pressure
   */
  private shouldEvictForMemoryPressure(): boolean {
    try {
      if (typeof performance !== 'undefined' && (performance as any).memory) {
        const memory = (performance as any).memory;
        const usage = memory.usedJSHeapSize / memory.totalJSHeapSize;
        return usage > this.config.memoryPressureThreshold;
      }
    } catch (error) {
      // Ignore errors in memory pressure detection
    }
    return false;
  }

  /**
   * Evict least recently used items
   */
  private evictLeastRecentlyUsed(count: number): void {
    if (!this.config.enableLRU) return;

    const toEvict = this.accessOrder.slice(0, count);
    for (const key of toEvict) {
      this.removeFromTauriCache(key);
      this.metrics.evictions++;
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.clearTauriCache();
    
    if (this.encryption) {
      this.encryption.destroy();
    }

    // Cancel background tasks
    this.backgroundTasks.clear();
  }
}
