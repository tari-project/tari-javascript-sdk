/**
 * @fileoverview Network information service for blockchain status and connectivity
 * 
 * Provides network status information including block height, peer connections,
 * synchronization progress, and base node connectivity details.
 */

import { EventEmitter } from 'node:events';
import {
  getFFIBindings,
  WalletError,
  WalletErrorCode,
  ErrorSeverity,
  type WalletHandle,
  type NetworkType
} from '@tari-project/tarijs-core';
import type {
  NetworkInfo,
  NetworkInfoOptions,
  BaseNodeInfo,
  BaseNodeConnectionStatus
} from './types.js';

/**
 * Network information service with real-time updates
 */
export class NetworkInfoService extends EventEmitter {
  private networkInfoCache?: { data: NetworkInfo; timestamp: Date };
  private baseNodeCache?: { data: BaseNodeInfo; timestamp: Date };
  private readonly cacheTtl = 5000; // 5 seconds
  private isDestroyed = false;
  private updateTimer?: NodeJS.Timeout;

  constructor() {
    super();
  }

  /**
   * Get current network information
   */
  async getNetworkInfo(
    walletHandle: WalletHandle,
    network: NetworkType,
    options: NetworkInfoOptions = {}
  ): Promise<NetworkInfo> {
    this.ensureNotDestroyed();

    // Check cache first unless force refresh is requested
    if (!options.forceRefresh && this.networkInfoCache) {
      const age = Date.now() - this.networkInfoCache.timestamp.getTime();
      if (age < this.cacheTtl) {
        return this.networkInfoCache.data;
      }
    }

    try {
      const bindings = getFFIBindings();
      
      // Note: These FFI calls would need to be implemented in the core
      // For now, providing mock implementation based on network type
      const networkInfo = await this.fetchNetworkInfo(network, options);
      
      // Cache the result
      this.networkInfoCache = {
        data: networkInfo,
        timestamp: new Date()
      };

      this.emit('networkInfoUpdated', networkInfo);
      return networkInfo;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to retrieve network information',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          context: {
            operation: 'getNetworkInfo',
            component: 'NetworkInfoService',
            network,
            walletHandle: walletHandle.toString()
          }
        }
      );
    }
  }

  /**
   * Get base node connection information
   */
  async getBaseNodeInfo(walletHandle: WalletHandle): Promise<BaseNodeInfo> {
    this.ensureNotDestroyed();

    // Check cache first
    if (this.baseNodeCache) {
      const age = Date.now() - this.baseNodeCache.timestamp.getTime();
      if (age < this.cacheTtl) {
        return this.baseNodeCache.data;
      }
    }

    try {
      const bindings = getFFIBindings();
      
      // Mock implementation - would need actual FFI support
      const baseNodeInfo: BaseNodeInfo = {
        publicKey: 'mock_public_key_' + Math.random().toString(36).substr(2, 9),
        address: '127.0.0.1:18142', // Mock testnet address
        status: 'connected',
        latency: 50 + Math.floor(Math.random() * 100), // Mock 50-150ms
        lastPing: new Date(),
        connectedAt: new Date(Date.now() - 60000), // Connected 1 minute ago
        version: '1.0.0',
        userAgent: 'tari/base_node/1.0.0'
      };

      // Cache the result
      this.baseNodeCache = {
        data: baseNodeInfo,
        timestamp: new Date()
      };

      this.emit('baseNodeInfoUpdated', baseNodeInfo);
      return baseNodeInfo;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to retrieve base node information',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          context: {
            operation: 'getBaseNodeInfo',
            component: 'NetworkInfoService',
            walletHandle: walletHandle.toString()
          }
        }
      );
    }
  }

  /**
   * Check if wallet is connected to the network
   */
  async isNetworkConnected(walletHandle: WalletHandle): Promise<boolean> {
    this.ensureNotDestroyed();

    try {
      const baseNodeInfo = await this.getBaseNodeInfo(walletHandle);
      return baseNodeInfo.status === 'connected';
    } catch (error) {
      return false;
    }
  }

  /**
   * Get network connectivity status
   */
  async getConnectivityStatus(walletHandle: WalletHandle): Promise<{
    isConnected: boolean;
    peerCount: number;
    latency?: number;
    lastConnected?: Date;
  }> {
    this.ensureNotDestroyed();

    try {
      const [networkInfo, baseNodeInfo] = await Promise.all([
        this.getNetworkInfo(walletHandle, 'testnet'), // Default to testnet
        this.getBaseNodeInfo(walletHandle)
      ]);

      return {
        isConnected: baseNodeInfo.status === 'connected',
        peerCount: networkInfo.connectedPeers,
        latency: baseNodeInfo.latency,
        lastConnected: baseNodeInfo.connectedAt
      };
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to retrieve connectivity status',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          context: {
            operation: 'getConnectivityStatus',
            component: 'NetworkInfoService'
          }
        }
      );
    }
  }

  /**
   * Get estimated time to sync completion
   */
  async getEstimatedSyncTime(walletHandle: WalletHandle, network: NetworkType): Promise<number | null> {
    this.ensureNotDestroyed();

    try {
      const networkInfo = await this.getNetworkInfo(walletHandle, network);
      
      if (networkInfo.isSynced) {
        return 0; // Already synced
      }

      // Calculate based on sync progress and average block time
      const blocksRemaining = networkInfo.blockHeight * (1 - networkInfo.syncProgress / 100);
      const estimatedTime = blocksRemaining * networkInfo.averageBlockTime;
      
      return Math.max(0, estimatedTime);
    } catch (error) {
      return null; // Return null if estimation fails
    }
  }

  /**
   * Start real-time network monitoring
   */
  startMonitoring(walletHandle: WalletHandle, network: NetworkType, intervalMs = 10000): void {
    this.ensureNotDestroyed();

    this.stopMonitoring(); // Stop any existing monitoring

    this.updateTimer = setInterval(async () => {
      try {
        await this.getNetworkInfo(walletHandle, network, { forceRefresh: true });
        await this.getBaseNodeInfo(walletHandle);
      } catch (error) {
        this.emit('monitoringError', error);
      }
    }, intervalMs);

    this.emit('monitoringStarted', { intervalMs });
  }

  /**
   * Stop real-time network monitoring
   */
  stopMonitoring(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
      this.emit('monitoringStopped');
    }
  }

  /**
   * Clear cached network information
   */
  clearCache(): void {
    this.ensureNotDestroyed();
    this.networkInfoCache = undefined;
    this.baseNodeCache = undefined;
    this.emit('cacheCleared');
  }

  /**
   * Destroy the service and cleanup resources
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.stopMonitoring();
    this.clearCache();
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

  private async fetchNetworkInfo(network: NetworkType, options: NetworkInfoOptions): Promise<NetworkInfo> {
    // Mock implementation - would use actual FFI calls
    const baseHeight = this.getBaseHeight(network);
    const currentTime = Date.now();
    
    return {
      network,
      blockHeight: baseHeight + Math.floor((currentTime - 1640995200000) / 120000), // ~2 min blocks
      bestBlockHash: 'mock_hash_' + Math.random().toString(36).substr(2, 16),
      bestBlockTimestamp: new Date(currentTime - 60000), // 1 minute ago
      connectedPeers: 3 + Math.floor(Math.random() * 5), // 3-7 peers
      isSynced: true,
      syncProgress: 100,
      difficulty: BigInt('1000000000'), // Mock difficulty
      hashrate: BigInt('500000000'), // Mock hashrate
      timeToNextDifficultyAdjustment: 3600, // 1 hour
      averageBlockTime: 120 // 2 minutes
    };
  }

  private getBaseHeight(network: NetworkType): number {
    switch (network) {
      case 'mainnet':
        return 1000000; // Mock mainnet height
      case 'testnet':
        return 800000; // Mock testnet height
      case 'nextnet':
        return 500000; // Mock nextnet height
      default:
        return 100000; // Default height
    }
  }

  private ensureNotDestroyed(): void {
    if (this.isDestroyed) {
      throw new WalletError(
        WalletErrorCode.UseAfterFree,
        'Network info service has been destroyed',
        {
          severity: ErrorSeverity.Error,
          context: {
            operation: 'networkInfoService',
            component: 'NetworkInfoService'
          }
        }
      );
    }
  }
}

export type { NetworkInfoOptions };
