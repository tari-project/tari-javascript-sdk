/**
 * @fileoverview Balance service with caching and change detection
 * 
 * This module provides balance query operations with optional caching
 * for performance optimization and change detection for events.
 */

import {
  getFFIBindings,
  WalletError,
  WalletErrorCode,
  ErrorSeverity,
  type WalletHandle
} from '@tari-project/tarijs-core';
import { BalanceMapper } from './balance-mapper.js';
import { BalanceCache } from './balance-cache.js';
import type { Balance, BalanceInfo, BalanceChangeEvent } from '../types/index.js';

/**
 * Configuration for balance service
 */
export interface BalanceServiceConfig {
  /** Enable balance caching */
  enableCaching?: boolean;
  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
  /** Enable change detection */
  enableChangeDetection?: boolean;
  /** Change detection threshold (in microTari) */
  changeThreshold?: bigint;
}

/**
 * Default balance service configuration
 */
const DEFAULT_CONFIG: Required<BalanceServiceConfig> = {
  enableCaching: true,
  cacheTtlMs: 5000, // 5 seconds
  enableChangeDetection: true,
  changeThreshold: 1000000n, // 1 mT minimum change to trigger event
};

/**
 * Balance change listener function
 */
export type BalanceChangeListener = (event: BalanceChangeEvent) => void;

/**
 * Balance service for wallet balance operations
 */
export class BalanceService {
  private readonly config: Required<BalanceServiceConfig>;
  private readonly cache: BalanceCache;
  private readonly mapper: BalanceMapper;
  private changeListeners: Set<BalanceChangeListener> = new Set();
  private lastBalance: Balance | null = null;

  constructor(
    private readonly walletHandle: WalletHandle,
    config: BalanceServiceConfig = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new BalanceCache(this.config.cacheTtlMs);
    this.mapper = new BalanceMapper();
  }

  /**
   * Get current wallet balance with optional caching
   */
  async getBalance(force: boolean = false): Promise<Balance> {
    try {
      // Check cache first if not forcing refresh
      if (!force && this.config.enableCaching) {
        const cached = this.cache.get<Balance>('balance');
        if (cached) {
          return cached;
        }
      }

      // Fetch balance from FFI
      const bindings = getFFIBindings();
      const ffiBalance = await bindings.getBalance(this.walletHandle);

      // Map FFI balance to our Balance type
      const balance = this.mapper.mapFromFFI(ffiBalance);

      // Cache the result if caching is enabled
      if (this.config.enableCaching) {
        this.cache.set('balance', balance);
      }

      // Check for changes and emit events
      if (this.config.enableChangeDetection) {
        this.checkForBalanceChange(balance);
      }

      return balance;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to retrieve wallet balance',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error
        }
      );
    }
  }

  /**
   * Get detailed balance information including pending transactions
   */
  async getDetailedBalance(force: boolean = false): Promise<BalanceInfo> {
    try {
      // Check cache first if not forcing refresh
      const cacheKey = 'detailed_balance';
      if (!force && this.config.enableCaching) {
        const cached = this.cache.get<BalanceInfo>(cacheKey);
        if (cached) {
          return cached;
        }
      }

      // Fetch detailed balance from FFI
      const bindings = getFFIBindings();
      const ffiBalance = await bindings.getBalance(this.walletHandle);

      // Map to detailed balance info
      const balanceInfo = this.mapper.mapToDetailedBalance(ffiBalance);

      // Cache the result if caching is enabled
      if (this.config.enableCaching) {
        this.cache.set(cacheKey, balanceInfo);
      }

      return balanceInfo;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to retrieve detailed wallet balance',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error
        }
      );
    }
  }

  /**
   * Get available balance (spendable amount)
   */
  async getAvailableBalance(): Promise<bigint> {
    const balance = await this.getBalance();
    return balance.available;
  }

  /**
   * Get pending incoming balance
   */
  async getPendingIncomingBalance(): Promise<bigint> {
    const balance = await this.getBalance();
    return balance.pendingIncoming;
  }

  /**
   * Get pending outgoing balance
   */
  async getPendingOutgoingBalance(): Promise<bigint> {
    const balance = await this.getBalance();
    return balance.pendingOutgoing;
  }

  /**
   * Get time-locked balance
   */
  async getTimeLockedBalance(): Promise<bigint> {
    const detailedBalance = await this.getDetailedBalance();
    return detailedBalance.timeLocked;
  }

  /**
   * Check if wallet has sufficient balance for a transaction
   */
  async hasSufficientBalance(amount: bigint, includeFee: bigint = 0n): Promise<boolean> {
    try {
      const available = await this.getAvailableBalance();
      const required = amount + includeFee;
      return available >= required;
    } catch {
      return false;
    }
  }

  /**
   * Calculate maximum spendable amount (available minus estimated fee)
   */
  async getMaxSpendableAmount(estimatedFee: bigint = 1000000n): Promise<bigint> {
    const available = await this.getAvailableBalance();
    const maxSpendable = available - estimatedFee;
    return maxSpendable > 0n ? maxSpendable : 0n;
  }

  /**
   * Add a balance change listener
   */
  addChangeListener(listener: BalanceChangeListener): void {
    this.changeListeners.add(listener);
  }

  /**
   * Remove a balance change listener
   */
  removeChangeListener(listener: BalanceChangeListener): void {
    this.changeListeners.delete(listener);
  }

  /**
   * Clear all balance change listeners
   */
  clearChangeListeners(): void {
    this.changeListeners.clear();
  }

  /**
   * Clear the balance cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Update service configuration
   */
  updateConfig(config: Partial<BalanceServiceConfig>): void {
    Object.assign(this.config, config);
    
    // Update cache TTL if changed
    if (config.cacheTtlMs !== undefined) {
      this.cache.updateTtl(config.cacheTtlMs);
    }
  }

  /**
   * Check for balance changes and emit events
   */
  private checkForBalanceChange(newBalance: Balance): void {
    if (!this.lastBalance) {
      this.lastBalance = newBalance;
      return;
    }

    const changes = this.detectBalanceChanges(this.lastBalance, newBalance);
    if (changes.length > 0) {
      const event: BalanceChangeEvent = {
        timestamp: new Date(),
        previousBalance: this.lastBalance,
        currentBalance: newBalance,
        changes
      };

      // Emit to all listeners
      for (const listener of this.changeListeners) {
        try {
          listener(event);
        } catch (error) {
          // Log error but don't break other listeners
          console.warn('Balance change listener error:', error);
        }
      }

      this.lastBalance = newBalance;
    }
  }

  /**
   * Detect specific balance changes
   */
  private detectBalanceChanges(oldBalance: Balance, newBalance: Balance): Array<{
    field: keyof Balance;
    oldValue: bigint;
    newValue: bigint;
    change: bigint;
  }> {
    const changes: Array<{
      field: keyof Balance;
      oldValue: bigint;
      newValue: bigint;
      change: bigint;
    }> = [];

    // Only check numeric balance fields
    const numericFields: Array<keyof Balance> = [
      'available', 
      'pendingIncoming', 
      'pendingOutgoing', 
      'total'
    ];

    for (const field of numericFields) {
      const oldValue = oldBalance[field] as bigint;
      const newValue = newBalance[field] as bigint;
      const change = newValue - oldValue;

      if (change !== 0n && (change > this.config.changeThreshold || change < -this.config.changeThreshold)) {
        changes.push({
          field,
          oldValue,
          newValue,
          change
        });
      }
    }

    return changes;
  }

  /**
   * Start periodic balance monitoring
   */
  startMonitoring(intervalMs: number = 10000): () => void {
    const interval = setInterval(async () => {
      try {
        await this.getBalance(true); // Force refresh to detect changes
      } catch (error) {
        console.warn('Balance monitoring error:', error);
      }
    }, intervalMs);

    // Return cleanup function
    return () => clearInterval(interval);
  }

  /**
   * Dispose of the service and clean up resources
   */
  dispose(): void {
    this.clearChangeListeners();
    this.clearCache();
    this.lastBalance = null;
  }
}
