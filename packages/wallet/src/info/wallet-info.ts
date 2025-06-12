/**
 * @fileoverview Wallet information service for metadata and configuration queries
 * 
 * Provides comprehensive wallet information including creation details,
 * synchronization status, transaction counts, and configuration metadata.
 */

import { EventEmitter } from 'node:events';
import {
  getFFIBindings,
  WalletError,
  WalletErrorCode,
  ErrorSeverity,
  type WalletHandle,
  type NetworkType,
  TariAddress as CoreTariAddress
} from '@tari-project/tarijs-core';
import type {
  WalletInfo,
  WalletInfoConfig,
  SyncStatus,
  WalletCapabilities,
  WalletMetrics
} from './types.js';

/**
 * Wallet information cache with TTL
 */
class WalletInfoCache {
  private cache = new Map<string, { data: any; timestamp: Date; ttl: number }>();

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp.getTime() > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: new Date(),
      ttl
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Wallet information service with caching and auto-refresh
 */
export class WalletInfoService extends EventEmitter {
  private readonly cache: WalletInfoCache;
  private readonly config: Required<WalletInfoConfig>;
  private refreshTimer?: NodeJS.Timeout;
  private isDestroyed = false;

  constructor(config: WalletInfoConfig = {}) {
    super();

    this.config = {
      includeSensitive: false,
      refreshInterval: 30 * 1000, // 30 seconds
      autoRefresh: true,
      networkTimeout: 10 * 1000, // 10 seconds
      ...config
    };

    this.cache = new WalletInfoCache();

    if (this.config.autoRefresh) {
      this.startAutoRefresh();
    }
  }

  /**
   * Get comprehensive wallet information
   */
  async getWalletInfo(
    walletHandle: WalletHandle,
    network: NetworkType,
    forceRefresh = false
  ): Promise<WalletInfo> {
    this.ensureNotDestroyed();

    const cacheKey = `wallet_info:${walletHandle}`;
    
    if (!forceRefresh) {
      const cached = this.cache.get<WalletInfo>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const bindings = getFFIBindings();
      
      // Get basic wallet information
      const [address, transactionCount, isRecovering] = await Promise.all([
        bindings.getAddress(walletHandle),
        this.getTransactionCount(walletHandle),
        this.getRecoveryStatus(walletHandle)
      ]);

      // Get sync status
      const syncStatus = await this.getSyncStatus(walletHandle);

      const walletInfo: WalletInfo = {
        id: walletHandle.toString(),
        name: undefined, // Could be configured by user
        network,
        address: new CoreTariAddress(address),
        createdAt: new Date(), // This would need to be stored/retrieved
        lastActivity: new Date(),
        version: this.getSDKVersion(),
        isRecovering,
        isSynchronized: syncStatus.progress >= 100,
        syncProgress: syncStatus.progress / 100,
        transactionCount,
        dataPath: this.config.includeSensitive ? undefined : undefined, // Would need FFI support
        hasPassphrase: false // Would need FFI support to determine
      };

      // Cache the result
      this.cache.set(cacheKey, walletInfo, this.config.refreshInterval);
      
      this.emit('walletInfoUpdated', walletInfo);
      return walletInfo;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to retrieve wallet information',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          context: {
            operation: 'getWalletInfo',
            component: 'WalletInfoService',
            walletHandle: walletHandle.toString()
          }
        }
      );
    }
  }

  /**
   * Get wallet synchronization status
   */
  async getSyncStatus(walletHandle: WalletHandle): Promise<SyncStatus> {
    this.ensureNotDestroyed();

    const cacheKey = `sync_status:${walletHandle}`;
    const cached = this.cache.get<SyncStatus>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Note: These would need actual FFI bindings
      // For now, providing a mock implementation
      const syncStatus: SyncStatus = {
        isSyncing: false,
        progress: 100,
        currentHeight: 1000000, // Mock value
        targetHeight: 1000000, // Mock value
        blocksRemaining: 0,
        estimatedTimeRemaining: 0,
        stage: 'complete',
        lastError: undefined,
        syncStartedAt: undefined
      };

      this.cache.set(cacheKey, syncStatus, 5000); // 5 second cache
      return syncStatus;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to retrieve sync status',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          context: {
            operation: 'getSyncStatus',
            component: 'WalletInfoService'
          }
        }
      );
    }
  }

  /**
   * Get wallet capabilities
   */
  getWalletCapabilities(): WalletCapabilities {
    this.ensureNotDestroyed();

    return {
      supportedTransactionTypes: ['standard', 'coinbase'],
      hardwareWalletSupport: false, // Future feature
      multiSigSupport: false, // Future feature  
      stealthAddressSupport: false, // Future feature
      maxConcurrentTransactions: 10,
      supportedAddressFormats: ['emoji', 'base58', 'hex'],
      atomicSwapSupport: false // Future feature
    };
  }

  /**
   * Get wallet performance metrics
   */
  async getWalletMetrics(walletHandle: WalletHandle): Promise<WalletMetrics> {
    this.ensureNotDestroyed();

    const cacheKey = `metrics:${walletHandle}`;
    const cached = this.cache.get<WalletMetrics>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Mock implementation - would need actual FFI support
      const metrics: WalletMetrics = {
        memoryUsage: process.memoryUsage().heapUsed,
        activeHandles: 1, // Mock value
        databaseSize: 1024 * 1024, // Mock 1MB
        avgTransactionTime: 500, // Mock 500ms
        cacheHitRatio: 85, // Mock 85%
        networkLatency: 100, // Mock 100ms
        failedOperations: 0,
        uptime: Date.now() - 0 // Would track actual start time
      };

      this.cache.set(cacheKey, metrics, 10000); // 10 second cache
      return metrics;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to retrieve wallet metrics',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          context: {
            operation: 'getWalletMetrics',
            component: 'WalletInfoService'
          }
        }
      );
    }
  }

  /**
   * Check if wallet is fully synchronized
   */
  async isWalletSynchronized(walletHandle: WalletHandle): Promise<boolean> {
    this.ensureNotDestroyed();
    
    const syncStatus = await this.getSyncStatus(walletHandle);
    return syncStatus.progress >= 100 && !syncStatus.isSyncing;
  }

  /**
   * Get wallet creation date (if available)
   */
  async getWalletCreationDate(walletHandle: WalletHandle): Promise<Date | null> {
    this.ensureNotDestroyed();

    // This would require FFI support to read wallet metadata
    // For now, return null as it's not available
    return null;
  }

  /**
   * Clear cached information
   */
  clearCache(): void {
    this.ensureNotDestroyed();
    this.cache.clear();
    this.emit('cacheCleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number } {
    this.ensureNotDestroyed();
    return {
      size: this.cache.size()
    };
  }

  /**
   * Destroy the service and cleanup resources
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }

    this.cache.clear();
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

  // Private helper methods

  private async getTransactionCount(walletHandle: WalletHandle): Promise<number> {
    // Mock implementation - would need FFI support
    return 0;
  }

  private async getRecoveryStatus(walletHandle: WalletHandle): Promise<boolean> {
    // Mock implementation - would need FFI support
    return false;
  }

  private getSDKVersion(): string {
    // Return the actual SDK version
    return '0.0.1';
  }

  private startAutoRefresh(): void {
    this.refreshTimer = setInterval(() => {
      this.emit('autoRefreshTriggered');
      // Auto-refresh would trigger cache invalidation
      // Actual refresh happens on next request
    }, this.config.refreshInterval);
  }

  private ensureNotDestroyed(): void {
    if (this.isDestroyed) {
      throw new WalletError(
        WalletErrorCode.UseAfterFree,
        'Wallet info service has been destroyed',
        {
          severity: ErrorSeverity.Error,
          context: {
            operation: 'walletInfoService',
            component: 'WalletInfoService'
          }
        }
      );
    }
  }
}

export type { WalletInfoConfig };
