/**
 * @fileoverview Transaction Timeout Handler
 * 
 * Handles timeout detection and management for pending transactions
 * with configurable thresholds and automatic cleanup.
 */

import {
  WalletError,
  WalletErrorCode,
  withErrorContext,
  TypedEventEmitter,
  type TransactionId,
  type UnixTimestamp
} from '@tari-project/tarijs-core';
import type { PendingManagerConfig } from './pending-manager.js';

/**
 * Timeout monitoring information for a transaction
 */
interface TimeoutMonitorInfo {
  /** Transaction ID being monitored */
  transactionId: TransactionId;
  /** When monitoring started */
  startTime: UnixTimestamp;
  /** Timeout threshold in seconds */
  timeoutSeconds: number;
  /** Timer handle for timeout detection */
  timeoutTimer?: NodeJS.Timeout;
  /** Warning timer handle for approaching timeout */
  warningTimer?: NodeJS.Timeout;
  /** Whether timeout warning has been sent */
  warningSent: boolean;
  /** Custom timeout multiplier */
  customMultiplier?: number;
}

/**
 * Timeout handler events
 */
export interface TimeoutHandlerEvents {
  'transaction:timeout': (transactionId: TransactionId, timeoutSeconds: number) => void;
  'transaction:timeout_warning': (transactionId: TransactionId, timeRemaining: number) => void;
  'timeout:cleared': (transactionId: TransactionId) => void;
}

/**
 * Timeout statistics
 */
export interface TimeoutStatistics {
  /** Number of transactions being monitored */
  monitoredCount: number;
  /** Number of timeouts detected */
  timeoutsDetected: number;
  /** Number of warnings sent */
  warningsSent: number;
  /** Average monitoring duration */
  averageMonitoringDuration: number;
  /** Oldest monitored transaction */
  oldestMonitoredTransaction?: UnixTimestamp;
}

/**
 * Transaction timeout handler providing comprehensive timeout management
 * 
 * Features:
 * - Configurable timeout thresholds per transaction
 * - Early warning system for approaching timeouts
 * - Automatic cleanup of expired monitors
 * - Batch timeout detection for performance
 * - Custom timeout multipliers for different transaction types
 * - Detailed timeout statistics and reporting
 */
export class TimeoutHandler extends TypedEventEmitter {
  private readonly config: PendingManagerConfig;
  private readonly parentEmitter: TypedEventEmitter;
  private readonly monitoredTransactions = new Map<TransactionId, TimeoutMonitorInfo>();
  private batchCheckTimer?: NodeJS.Timeout;
  private isDisposed = false;
  private timeoutsDetected = 0;
  private warningsSent = 0;

  constructor(config: PendingManagerConfig, parentEmitter: TypedEventEmitter) {
    super();
    this.config = config;
    this.parentEmitter = parentEmitter;
    
    // Start batch timeout checking
    this.startBatchTimeoutCheck();
  }

  /**
   * Start monitoring a transaction for timeout
   */
  @withErrorContext('start_monitoring', 'timeout_handler')
  startMonitoring(
    transactionId: TransactionId,
    timeoutSeconds?: number,
    customMultiplier?: number
  ): void {
    this.ensureNotDisposed();

    // Stop existing monitoring if any
    this.stopMonitoring(transactionId);

    const effectiveTimeout = timeoutSeconds || this.config.transactionTimeoutSeconds;
    const finalTimeout = customMultiplier ? effectiveTimeout * customMultiplier : effectiveTimeout;

    const monitorInfo: TimeoutMonitorInfo = {
      transactionId,
      startTime: Date.now() as UnixTimestamp,
      timeoutSeconds: finalTimeout,
      warningSent: false,
      customMultiplier
    };

    // Set up individual timeout timer
    monitorInfo.timeoutTimer = setTimeout(() => {
      this.handleTimeout(transactionId, finalTimeout);
    }, finalTimeout * 1000);

    // Set up warning timer (at 80% of timeout period)
    const warningTime = finalTimeout * 0.8 * 1000;
    monitorInfo.warningTimer = setTimeout(() => {
      this.handleTimeoutWarning(transactionId, finalTimeout * 0.2);
    }, warningTime);

    this.monitoredTransactions.set(transactionId, monitorInfo);
  }

  /**
   * Stop monitoring a transaction for timeout
   */
  @withErrorContext('stop_monitoring', 'timeout_handler')
  stopMonitoring(transactionId: TransactionId): boolean {
    this.ensureNotDisposed();

    const monitorInfo = this.monitoredTransactions.get(transactionId);
    if (!monitorInfo) {
      return false;
    }

    // Clear timers
    if (monitorInfo.timeoutTimer) {
      clearTimeout(monitorInfo.timeoutTimer);
    }
    if (monitorInfo.warningTimer) {
      clearTimeout(monitorInfo.warningTimer);
    }

    this.monitoredTransactions.delete(transactionId);
    this.emit('timeout:cleared', transactionId);
    
    return true;
  }

  /**
   * Update timeout threshold for a monitored transaction
   */
  @withErrorContext('update_timeout', 'timeout_handler')
  updateTimeout(transactionId: TransactionId, newTimeoutSeconds: number): boolean {
    this.ensureNotDisposed();

    const monitorInfo = this.monitoredTransactions.get(transactionId);
    if (!monitorInfo) {
      return false;
    }

    // Restart monitoring with new timeout
    this.startMonitoring(transactionId, newTimeoutSeconds, monitorInfo.customMultiplier);
    return true;
  }

  /**
   * Get timeout information for a specific transaction
   */
  @withErrorContext('get_timeout_info', 'timeout_handler')
  getTimeoutInfo(transactionId: TransactionId): {
    timeoutSeconds: number;
    remainingSeconds: number;
    isApproachingTimeout: boolean;
    warningSent: boolean;
  } | null {
    this.ensureNotDisposed();

    const monitorInfo = this.monitoredTransactions.get(transactionId);
    if (!monitorInfo) {
      return null;
    }

    const now = Date.now();
    const elapsed = (now - monitorInfo.startTime) / 1000;
    const remaining = Math.max(0, monitorInfo.timeoutSeconds - elapsed);
    const isApproaching = remaining < (monitorInfo.timeoutSeconds * 0.2);

    return {
      timeoutSeconds: monitorInfo.timeoutSeconds,
      remainingSeconds: remaining,
      isApproachingTimeout: isApproaching,
      warningSent: monitorInfo.warningSent
    };
  }

  /**
   * Get all monitored transactions with their timeout status
   */
  @withErrorContext('get_all_monitored', 'timeout_handler')
  getAllMonitored(): Array<{
    transactionId: TransactionId;
    timeoutSeconds: number;
    remainingSeconds: number;
    isApproachingTimeout: boolean;
    warningSent: boolean;
  }> {
    this.ensureNotDisposed();

    const now = Date.now();
    const results: Array<{
      transactionId: TransactionId;
      timeoutSeconds: number;
      remainingSeconds: number;
      isApproachingTimeout: boolean;
      warningSent: boolean;
    }> = [];

    for (const [transactionId, monitorInfo] of this.monitoredTransactions.entries()) {
      const elapsed = (now - monitorInfo.startTime) / 1000;
      const remaining = Math.max(0, monitorInfo.timeoutSeconds - elapsed);
      const isApproaching = remaining < (monitorInfo.timeoutSeconds * 0.2);

      results.push({
        transactionId,
        timeoutSeconds: monitorInfo.timeoutSeconds,
        remainingSeconds: remaining,
        isApproachingTimeout: isApproaching,
        warningSent: monitorInfo.warningSent
      });
    }

    return results.sort((a, b) => a.remainingSeconds - b.remainingSeconds);
  }

  /**
   * Get transactions that are approaching timeout
   */
  @withErrorContext('get_approaching_timeout', 'timeout_handler')
  getApproachingTimeout(thresholdPercentage: number = 0.2): TransactionId[] {
    this.ensureNotDisposed();

    const now = Date.now();
    const approaching: TransactionId[] = [];

    for (const [transactionId, monitorInfo] of this.monitoredTransactions.entries()) {
      const elapsed = (now - monitorInfo.startTime) / 1000;
      const remaining = Math.max(0, monitorInfo.timeoutSeconds - elapsed);
      const threshold = monitorInfo.timeoutSeconds * thresholdPercentage;

      if (remaining < threshold) {
        approaching.push(transactionId);
      }
    }

    return approaching;
  }

  /**
   * Manually check for timeouts (batch operation)
   */
  @withErrorContext('check_timeouts', 'timeout_handler')
  checkTimeouts(): {
    timedOut: TransactionId[];
    warnings: TransactionId[];
  } {
    this.ensureNotDisposed();

    const now = Date.now();
    const timedOut: TransactionId[] = [];
    const warnings: TransactionId[] = [];

    for (const [transactionId, monitorInfo] of this.monitoredTransactions.entries()) {
      const elapsed = (now - monitorInfo.startTime) / 1000;
      
      // Check for timeout
      if (elapsed >= monitorInfo.timeoutSeconds) {
        timedOut.push(transactionId);
        this.handleTimeout(transactionId, monitorInfo.timeoutSeconds);
      } 
      // Check for warning threshold
      else if (elapsed >= monitorInfo.timeoutSeconds * 0.8 && !monitorInfo.warningSent) {
        warnings.push(transactionId);
        this.handleTimeoutWarning(transactionId, monitorInfo.timeoutSeconds - elapsed);
      }
    }

    return { timedOut, warnings };
  }

  /**
   * Get timeout statistics
   */
  @withErrorContext('get_timeout_statistics', 'timeout_handler')
  getTimeoutStatistics(): TimeoutStatistics {
    this.ensureNotDisposed();

    const now = Date.now();
    let totalMonitoringDuration = 0;
    let oldestTimestamp: UnixTimestamp | undefined;

    for (const monitorInfo of this.monitoredTransactions.values()) {
      totalMonitoringDuration += now - monitorInfo.startTime;
      
      if (!oldestTimestamp || monitorInfo.startTime < oldestTimestamp) {
        oldestTimestamp = monitorInfo.startTime;
      }
    }

    const averageMonitoringDuration = this.monitoredTransactions.size > 0 ?
      totalMonitoringDuration / this.monitoredTransactions.size : 0;

    return {
      monitoredCount: this.monitoredTransactions.size,
      timeoutsDetected: this.timeoutsDetected,
      warningsSent: this.warningsSent,
      averageMonitoringDuration,
      oldestMonitoredTransaction: oldestTimestamp
    };
  }

  /**
   * Clean up expired monitors
   */
  @withErrorContext('cleanup_expired', 'timeout_handler')
  cleanupExpired(): number {
    this.ensureNotDisposed();

    const now = Date.now();
    const toRemove: TransactionId[] = [];
    
    // Consider monitors expired if they've been running for more than 2x their timeout
    for (const [transactionId, monitorInfo] of this.monitoredTransactions.entries()) {
      const elapsed = (now - monitorInfo.startTime) / 1000;
      if (elapsed > monitorInfo.timeoutSeconds * 2) {
        toRemove.push(transactionId);
      }
    }

    for (const transactionId of toRemove) {
      this.stopMonitoring(transactionId);
    }

    return toRemove.length;
  }

  /**
   * Handle transaction timeout
   */
  private handleTimeout(transactionId: TransactionId, timeoutSeconds: number): void {
    this.timeoutsDetected++;
    this.stopMonitoring(transactionId);
    this.emit('transaction:timeout', transactionId, timeoutSeconds);
  }

  /**
   * Handle timeout warning
   */
  private handleTimeoutWarning(transactionId: TransactionId, timeRemaining: number): void {
    const monitorInfo = this.monitoredTransactions.get(transactionId);
    if (monitorInfo && !monitorInfo.warningSent) {
      monitorInfo.warningSent = true;
      this.warningsSent++;
      this.emit('transaction:timeout_warning', transactionId, timeRemaining);
    }
  }

  /**
   * Start batch timeout checking timer
   */
  private startBatchTimeoutCheck(): void {
    // Check every 30 seconds for timeouts (in addition to individual timers)
    this.batchCheckTimer = setInterval(() => {
      if (!this.isDisposed) {
        this.checkTimeouts();
      }
    }, 30000);
  }

  /**
   * Stop batch timeout checking timer
   */
  private stopBatchTimeoutCheck(): void {
    if (this.batchCheckTimer) {
      clearInterval(this.batchCheckTimer);
      this.batchCheckTimer = undefined;
    }
  }

  /**
   * Ensure handler is not disposed
   */
  private ensureNotDisposed(): void {
    if (this.isDisposed) {
      throw new WalletError(
        WalletErrorCode.ResourceDisposed,
        'Timeout handler has been disposed'
      );
    }
  }

  /**
   * Dispose of the handler and clean up resources
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.stopBatchTimeoutCheck();

    // Clear all individual timers
    for (const monitorInfo of this.monitoredTransactions.values()) {
      if (monitorInfo.timeoutTimer) {
        clearTimeout(monitorInfo.timeoutTimer);
      }
      if (monitorInfo.warningTimer) {
        clearTimeout(monitorInfo.warningTimer);
      }
    }

    this.monitoredTransactions.clear();
    this.removeAllListeners();
  }

  /**
   * Get the number of monitored transactions
   */
  get monitoredCount(): number {
    return this.monitoredTransactions.size;
  }

  /**
   * Check if a transaction is being monitored
   */
  isMonitoring(transactionId: TransactionId): boolean {
    return this.monitoredTransactions.has(transactionId);
  }
}
