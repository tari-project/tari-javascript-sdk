/**
 * @fileoverview High-level address service for wallet operations
 * 
 * Provides cached address generation, validation, and management with
 * proper lifecycle integration and error handling.
 */

import { EventEmitter } from 'node:events';
import { 
  TariAddress as CoreTariAddress,
  getFFIBindings,
  WalletError,
  WalletErrorCode,
  ErrorSeverity,
  type WalletHandle,
  type NetworkType
} from '@tari-project/tarijs-core';
import type {
  AddressServiceConfig,
  AddressCacheEntry,
  AddressValidationContext,
  AddressServiceStats
} from './types.js';

/**
 * LRU cache for address entries with TTL support
 */
class AddressCache {
  private cache = new Map<string, AddressCacheEntry>();
  private readonly maxSize: number;
  private readonly ttl: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(maxSize = 100, ttl = 5 * 60 * 1000) { // 5 minutes default TTL
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.startCleanup();
  }

  get(key: string): CoreTariAddress | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check if entry is expired
    const now = Date.now();
    if (now - entry.cachedAt.getTime() > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = new Date();

    return entry.address;
  }

  set(key: string, address: CoreTariAddress): void {
    // Remove oldest entry if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.findOldestEntry();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    const entry: AddressCacheEntry = {
      address,
      cachedAt: new Date(),
      accessCount: 1,
      lastAccessed: new Date(),
      estimatedSize: this.estimateEntrySize(address)
    };

    this.cache.set(key, entry);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  getStats(): { hits: number; misses: number; size: number; memoryUsage: number } {
    let totalMemory = 0;
    for (const entry of this.cache.values()) {
      totalMemory += entry.estimatedSize;
    }

    return {
      hits: Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.accessCount, 0),
      misses: 0, // Will be tracked by the service
      size: this.cache.size,
      memoryUsage: totalMemory
    };
  }

  private findOldestEntry(): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed.getTime() < oldestTime) {
        oldestTime = entry.lastAccessed.getTime();
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  private estimateEntrySize(address: CoreTariAddress): number {
    // Estimate memory usage of cache entry
    return JSON.stringify(address).length * 2 + 200; // Rough estimate including overhead
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const expiredKeys: string[] = [];

      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.cachedAt.getTime() > this.ttl) {
          expiredKeys.push(key);
        }
      }

      for (const key of expiredKeys) {
        this.cache.delete(key);
      }
    }, this.ttl / 4); // Clean up every quarter of TTL period
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.cache.clear();
  }
}

/**
 * High-level address service with caching and lifecycle management
 */
export class AddressService extends EventEmitter {
  private readonly cache: AddressCache;
  private readonly config: Required<AddressServiceConfig>;
  private stats: AddressServiceStats;
  private isDestroyed = false;

  constructor(config: AddressServiceConfig) {
    super();
    
    this.config = {
      cacheSize: 100,
      cacheTtl: 5 * 60 * 1000, // 5 minutes
      autoCleanup: true,
      ...config
    };

    this.cache = new AddressCache(this.config.cacheSize, this.config.cacheTtl);
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      cacheSize: 0,
      hitRatio: 0,
      ffiCalls: 0,
      conversionErrors: 0,
      estimatedMemoryUsage: 0
    };
  }

  /**
   * Get wallet address with caching
   */
  async getWalletAddress(walletHandle: WalletHandle): Promise<CoreTariAddress> {
    this.ensureNotDestroyed();

    const cacheKey = `wallet:${walletHandle}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      this.stats.cacheHits++;
      this.updateStats();
      return cached;
    }

    try {
      this.stats.cacheMisses++;
      this.stats.ffiCalls++;

      const bindings = getFFIBindings();
      const addressStr = await bindings.getAddress(walletHandle);
      
      // Convert FFI address string to TariAddress object
      const address = new CoreTariAddress(addressStr);
      
      // Cache the result
      this.cache.set(cacheKey, address);
      
      this.updateStats();
      this.emit('addressGenerated', address);
      
      return address;
    } catch (error) {
      this.stats.conversionErrors++;
      this.updateStats();
      
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to retrieve wallet address',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          context: { 
            operation: 'getWalletAddress',
            component: 'AddressService',
            walletHandle: walletHandle.toString()
          }
        }
      );
    }
  }

  /**
   * Validate a Tari address
   */
  async validateAddress(
    address: string, 
    context: AddressValidationContext = { network: this.config.network }
  ): Promise<boolean> {
    this.ensureNotDestroyed();

    try {
      this.stats.ffiCalls++;
      
      const bindings = getFFIBindings();
      const isValid = await bindings.validateAddress(address, context.network);
      
      this.updateStats();
      return isValid;
    } catch (error) {
      this.stats.conversionErrors++;
      this.updateStats();
      
      throw new WalletError(
        WalletErrorCode.InvalidAddress,
        'Address validation failed',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          context: { 
            operation: 'validateAddress',
            component: 'AddressService',
            address: address.substring(0, 20) + '...',
            network: context.network
          }
        }
      );
    }
  }

  /**
   * Get cached address if available
   */
  getCachedAddress(cacheKey: string): CoreTariAddress | null {
    this.ensureNotDestroyed();
    return this.cache.get(cacheKey);
  }

  /**
   * Manually cache an address
   */
  cacheAddress(cacheKey: string, address: CoreTariAddress): void {
    this.ensureNotDestroyed();
    this.cache.set(cacheKey, address);
    this.updateStats();
  }

  /**
   * Clear all cached addresses
   */
  clearCache(): void {
    this.ensureNotDestroyed();
    this.cache.clear();
    this.updateStats();
    this.emit('cacheCleared');
  }

  /**
   * Get service statistics
   */
  getStats(): AddressServiceStats {
    this.ensureNotDestroyed();
    return { ...this.stats };
  }

  /**
   * Get configuration
   */
  getConfig(): AddressServiceConfig {
    this.ensureNotDestroyed();
    return { ...this.config };
  }

  /**
   * Update cache TTL
   */
  updateCacheTtl(newTtl: number): void {
    this.ensureNotDestroyed();
    // Note: This would require recreating the cache with new TTL
    // For now, we'll just update the config
    this.config.cacheTtl = newTtl;
  }

  /**
   * Cleanup resources and destroy the service
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.cache.destroy();
    this.removeAllListeners();
    this.isDestroyed = true;
    
    this.emit('destroyed');
  }

  /**
   * Check if the service has been destroyed
   */
  get destroyed(): boolean {
    return this.isDestroyed;
  }

  private ensureNotDestroyed(): void {
    if (this.isDestroyed) {
      throw new WalletError(
        WalletErrorCode.UseAfterFree,
        'Address service has been destroyed',
        {
          severity: ErrorSeverity.Error,
          context: {
            operation: 'addressService',
            component: 'AddressService'
          }
        }
      );
    }
  }

  private updateStats(): void {
    const cacheStats = this.cache.getStats();
    
    this.stats.cacheSize = cacheStats.size;
    this.stats.estimatedMemoryUsage = cacheStats.memoryUsage;
    
    const totalRequests = this.stats.cacheHits + this.stats.cacheMisses;
    this.stats.hitRatio = totalRequests > 0 ? this.stats.cacheHits / totalRequests : 0;
  }
}

export type { AddressServiceConfig };
