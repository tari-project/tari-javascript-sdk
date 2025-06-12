/**
 * @fileoverview Transaction State Management
 * 
 * Manages transaction state transitions, timeout tracking, and lifecycle events.
 * Provides centralized state tracking for transaction operations with automatic
 * timeout detection and state consistency verification.
 */

import { EventEmitter } from 'node:events';
import {
  WalletError,
  WalletErrorCode,
  ErrorSeverity,
  withErrorContext,
  type TransactionId,
  type UnixTimestamp
} from '@tari-project/tarijs-core';
import { TransactionStatus } from '@tari-project/tarijs-core';

/**
 * Configuration for the state manager
 */
export interface TransactionStateManagerConfig {
  /** Transaction timeout in seconds */
  timeoutSeconds: number;
  /** Cleanup interval for checking timeouts in milliseconds */
  cleanupIntervalMs?: number;
  /** Maximum number of transactions to track */
  maxTrackedTransactions?: number;
  /** Whether to automatically clean up completed transactions */
  autoCleanupCompleted?: boolean;
  /** How long to keep completed transactions in seconds */
  completedRetentionSeconds?: number;
}

/**
 * State manager events
 */
export interface TransactionStateManagerEvents {
  'transaction:timeout': (transactionId: TransactionId) => void;
  'transaction:stateChange': (transactionId: TransactionId, oldState: TransactionStatus, newState: TransactionStatus) => void;
  'transaction:expired': (transactionId: TransactionId) => void;
  'state:inconsistency': (transactionId: TransactionId, expectedState: TransactionStatus, actualState: TransactionStatus) => void;
}

/**
 * Transaction state tracking entry
 */
interface TransactionState {
  /** Transaction ID */
  id: TransactionId;
  /** Current status */
  status: TransactionStatus;
  /** When transaction was first created */
  createdAt: UnixTimestamp;
  /** When status was last updated */
  lastUpdated: UnixTimestamp;
  /** When transaction should timeout */
  timeoutAt: UnixTimestamp;
  /** Number of state updates */
  updateCount: number;
  /** Whether timeout checking is enabled for this transaction */
  timeoutEnabled: boolean;
  /** Custom timeout override in seconds */
  customTimeoutSeconds?: number;
}

/**
 * State transition rules
 */
interface StateTransition {
  from: TransactionStatus;
  to: TransactionStatus;
  allowed: boolean;
  reason?: string;
}

/**
 * Transaction state manager for lifecycle tracking
 */
export class TransactionStateManager extends EventEmitter<TransactionStateManagerEvents> {
  private readonly config: TransactionStateManagerConfig;
  private readonly states = new Map<TransactionId, TransactionState>();
  private readonly timeoutIndex = new Map<number, Set<TransactionId>>(); // bucket -> transaction IDs
  private isDisposed = false;
  private cleanupTimer?: NodeJS.Timeout;
  private nextTimeoutBucket = 0;

  constructor(config: TransactionStateManagerConfig) {
    super();
    this.config = {
      ...config,
      cleanupIntervalMs: config.cleanupIntervalMs || 30000, // 30 seconds
      maxTrackedTransactions: config.maxTrackedTransactions || 10000,
      autoCleanupCompleted: config.autoCleanupCompleted ?? true,
      completedRetentionSeconds: config.completedRetentionSeconds || 86400 // 24 hours
    };

    this.startCleanupTimer();
  }

  /**
   * Start tracking a transaction
   */
  @withErrorContext('track_transaction', 'transaction_state_manager')
  trackTransaction(
    transactionId: TransactionId, 
    status: TransactionStatus,
    customTimeoutSeconds?: number
  ): void {
    this.ensureNotDisposed();

    if (this.states.size >= this.config.maxTrackedTransactions!) {
      this.cleanupOldestTransactions();
    }

    const now = Date.now() as UnixTimestamp;
    const timeoutSeconds = customTimeoutSeconds || this.config.timeoutSeconds;
    const timeoutAt = (now + timeoutSeconds * 1000) as UnixTimestamp;

    const state: TransactionState = {
      id: transactionId,
      status,
      createdAt: now,
      lastUpdated: now,
      timeoutAt,
      updateCount: 0,
      timeoutEnabled: this.shouldEnableTimeout(status),
      customTimeoutSeconds
    };

    this.states.set(transactionId, state);

    if (state.timeoutEnabled) {
      this.addToTimeoutIndex(transactionId, timeoutAt);
    }
  }

  /**
   * Update transaction status
   */
  @withErrorContext('update_transaction_status', 'transaction_state_manager')
  updateTransactionStatus(transactionId: TransactionId, newStatus: TransactionStatus): void {
    this.ensureNotDisposed();

    const state = this.states.get(transactionId);
    if (!state) {
      throw new WalletError(
        WalletErrorCode.TransactionNotFound,
        `Transaction ${transactionId} is not being tracked`,
        { severity: ErrorSeverity.Warning }
      );
    }

    const oldStatus = state.status;

    // Validate state transition
    const transitionResult = this.validateStateTransition(oldStatus, newStatus);
    if (!transitionResult.allowed) {
      this.emit('state:inconsistency', transactionId, oldStatus, newStatus);
      throw new WalletError(
        WalletErrorCode.InvalidStateTransition,
        `Invalid state transition for transaction ${transactionId}: ${oldStatus} -> ${newStatus}. Reason: ${transitionResult.reason}`,
        { 
          severity: ErrorSeverity.Error,
          context: { transactionId: transactionId.toString(), oldStatus, newStatus, reason: transitionResult.reason }
        }
      );
    }

    // Update state
    state.status = newStatus;
    state.lastUpdated = Date.now() as UnixTimestamp;
    state.updateCount++;

    // Update timeout settings
    const shouldTimeout = this.shouldEnableTimeout(newStatus);
    if (state.timeoutEnabled !== shouldTimeout) {
      if (state.timeoutEnabled) {
        this.removeFromTimeoutIndex(transactionId, state.timeoutAt);
      }
      state.timeoutEnabled = shouldTimeout;
      if (shouldTimeout) {
        this.addToTimeoutIndex(transactionId, state.timeoutAt);
      }
    }

    // Emit state change event
    this.emit('transaction:stateChange', transactionId, oldStatus, newStatus);

    // Schedule cleanup for completed transactions
    if (this.config.autoCleanupCompleted && this.isCompletedStatus(newStatus)) {
      this.scheduleCompletedCleanup(transactionId);
    }
  }

  /**
   * Check if a transaction has timed out
   */
  @withErrorContext('check_transaction_timeout', 'transaction_state_manager')
  checkTransactionTimeout(transactionId: TransactionId): boolean {
    this.ensureNotDisposed();

    const state = this.states.get(transactionId);
    if (!state || !state.timeoutEnabled) {
      return false;
    }

    const now = Date.now();
    if (now >= state.timeoutAt) {
      this.handleTransactionTimeout(transactionId);
      return true;
    }

    return false;
  }

  /**
   * Get transaction state
   */
  getTransactionState(transactionId: TransactionId): TransactionState | null {
    this.ensureNotDisposed();
    return this.states.get(transactionId) || null;
  }

  /**
   * Get all tracked transactions by status
   */
  getTransactionsByStatus(status: TransactionStatus): TransactionId[] {
    this.ensureNotDisposed();
    
    const result: TransactionId[] = [];
    for (const state of this.states.values()) {
      if (state.status === status) {
        result.push(state.id);
      }
    }
    return result;
  }

  /**
   * Get transactions that are approaching timeout
   */
  getTransactionsNearTimeout(warningSeconds = 300): TransactionId[] {
    this.ensureNotDisposed();

    const now = Date.now();
    const warningThreshold = now + warningSeconds * 1000;
    const result: TransactionId[] = [];

    for (const state of this.states.values()) {
      if (state.timeoutEnabled && state.timeoutAt <= warningThreshold && state.timeoutAt > now) {
        result.push(state.id);
      }
    }

    return result;
  }

  /**
   * Stop tracking a transaction
   */
  @withErrorContext('stop_tracking', 'transaction_state_manager')
  stopTracking(transactionId: TransactionId): void {
    this.ensureNotDisposed();

    const state = this.states.get(transactionId);
    if (!state) {
      return; // Already not tracked
    }

    // Remove from timeout index
    if (state.timeoutEnabled) {
      this.removeFromTimeoutIndex(transactionId, state.timeoutAt);
    }

    // Remove from main tracking
    this.states.delete(transactionId);
  }

  /**
   * Update timeout for a transaction
   */
  @withErrorContext('update_timeout', 'transaction_state_manager')
  updateTimeout(transactionId: TransactionId, newTimeoutSeconds: number): void {
    this.ensureNotDisposed();

    const state = this.states.get(transactionId);
    if (!state) {
      throw new WalletError(
        WalletErrorCode.TransactionNotFound,
        `Transaction ${transactionId} is not being tracked`,
        { severity: ErrorSeverity.Warning }
      );
    }

    // Remove from old timeout index
    if (state.timeoutEnabled) {
      this.removeFromTimeoutIndex(transactionId, state.timeoutAt);
    }

    // Update timeout
    const now = Date.now() as UnixTimestamp;
    state.timeoutAt = (now + newTimeoutSeconds * 1000) as UnixTimestamp;
    state.customTimeoutSeconds = newTimeoutSeconds;

    // Add to new timeout index
    if (state.timeoutEnabled) {
      this.addToTimeoutIndex(transactionId, state.timeoutAt);
    }
  }

  /**
   * Get manager statistics
   */
  getStatistics(): {
    totalTracked: number;
    byStatus: Record<TransactionStatus, number>;
    timeoutEnabled: number;
    nearTimeout: number;
    memoryUsage: number;
  } {
    const stats = {
      totalTracked: this.states.size,
      byStatus: {} as Record<TransactionStatus, number>,
      timeoutEnabled: 0,
      nearTimeout: 0,
      memoryUsage: this.estimateMemoryUsage()
    };

    // Initialize status counters
    Object.values(TransactionStatus).forEach(status => {
      stats.byStatus[status] = 0;
    });

    // Count by status and timeout settings
    for (const state of this.states.values()) {
      stats.byStatus[state.status]++;
      if (state.timeoutEnabled) {
        stats.timeoutEnabled++;
      }
    }

    // Count near timeout
    stats.nearTimeout = this.getTransactionsNearTimeout(300).length;

    return stats;
  }

  /**
   * Validate state transition
   */
  private validateStateTransition(from: TransactionStatus, to: TransactionStatus): StateTransition {
    // Same status is always allowed
    if (from === to) {
      return { from, to, allowed: true };
    }

    // Define allowed transitions
    const allowedTransitions = new Map<TransactionStatus, TransactionStatus[]>([
      [TransactionStatus.Pending, [
        TransactionStatus.Broadcast,
        TransactionStatus.MinedUnconfirmed,
        TransactionStatus.MinedConfirmed,
        TransactionStatus.Cancelled,
        TransactionStatus.Unknown
      ]],
      [TransactionStatus.Broadcast, [
        TransactionStatus.MinedUnconfirmed,
        TransactionStatus.MinedConfirmed,
        TransactionStatus.Cancelled,
        TransactionStatus.Unknown
      ]],
      [TransactionStatus.MinedUnconfirmed, [
        TransactionStatus.MinedConfirmed,
        TransactionStatus.Unknown
      ]],
      [TransactionStatus.MinedConfirmed, [
        TransactionStatus.Unknown // Only in case of reorg
      ]],
      [TransactionStatus.Imported, [
        TransactionStatus.MinedConfirmed,
        TransactionStatus.Unknown
      ]],
      [TransactionStatus.Cancelled, [
        // Cancelled is generally final, but allow unknown for error cases
        TransactionStatus.Unknown
      ]],
      [TransactionStatus.Coinbase, [
        TransactionStatus.Unknown
      ]],
      [TransactionStatus.Unknown, [
        // Unknown can transition to any state (recovery scenarios)
        ...Object.values(TransactionStatus).filter(s => s !== TransactionStatus.Unknown)
      ]]
    ]);

    const allowed = allowedTransitions.get(from);
    if (!allowed || !allowed.includes(to)) {
      return {
        from,
        to,
        allowed: false,
        reason: `Transition from ${from} to ${to} is not permitted`
      };
    }

    return { from, to, allowed: true };
  }

  /**
   * Check if timeout should be enabled for status
   */
  private shouldEnableTimeout(status: TransactionStatus): boolean {
    return status === TransactionStatus.Pending || status === TransactionStatus.Broadcast;
  }

  /**
   * Check if status represents a completed transaction
   */
  private isCompletedStatus(status: TransactionStatus): boolean {
    return status === TransactionStatus.MinedConfirmed ||
           status === TransactionStatus.Cancelled ||
           status === TransactionStatus.Imported;
  }

  /**
   * Handle transaction timeout
   */
  private handleTransactionTimeout(transactionId: TransactionId): void {
    const state = this.states.get(transactionId);
    if (state) {
      // Remove from timeout index
      this.removeFromTimeoutIndex(transactionId, state.timeoutAt);
      state.timeoutEnabled = false;
    }

    this.emit('transaction:timeout', transactionId);
  }

  /**
   * Add transaction to timeout index
   */
  private addToTimeoutIndex(transactionId: TransactionId, timeoutAt: UnixTimestamp): void {
    // Use minute-based buckets for efficient timeout checking
    const bucket = Math.floor(timeoutAt / 60000); // 1-minute buckets
    
    let bucketSet = this.timeoutIndex.get(bucket);
    if (!bucketSet) {
      bucketSet = new Set();
      this.timeoutIndex.set(bucket, bucketSet);
    }
    bucketSet.add(transactionId);
  }

  /**
   * Remove transaction from timeout index
   */
  private removeFromTimeoutIndex(transactionId: TransactionId, timeoutAt: UnixTimestamp): void {
    const bucket = Math.floor(timeoutAt / 60000);
    const bucketSet = this.timeoutIndex.get(bucket);
    if (bucketSet) {
      bucketSet.delete(transactionId);
      if (bucketSet.size === 0) {
        this.timeoutIndex.delete(bucket);
      }
    }
  }

  /**
   * Check for timed out transactions
   */
  private checkTimeouts(): void {
    if (this.isDisposed) return;

    const now = Date.now();
    const currentBucket = Math.floor(now / 60000);

    // Check current and past buckets
    for (const [bucket, transactionIds] of this.timeoutIndex.entries()) {
      if (bucket <= currentBucket) {
        for (const transactionId of transactionIds) {
          this.checkTransactionTimeout(transactionId);
        }
      }
    }
  }

  /**
   * Clean up oldest transactions when limit is reached
   */
  private cleanupOldestTransactions(): void {
    const entriesToRemove = Math.max(1, Math.floor(this.config.maxTrackedTransactions! * 0.1));
    const sortedStates = Array.from(this.states.values())
      .sort((a, b) => a.createdAt - b.createdAt);

    for (let i = 0; i < entriesToRemove && i < sortedStates.length; i++) {
      this.stopTracking(sortedStates[i].id);
    }
  }

  /**
   * Schedule cleanup for completed transaction
   */
  private scheduleCompletedCleanup(transactionId: TransactionId): void {
    setTimeout(() => {
      if (!this.isDisposed && this.states.has(transactionId)) {
        this.stopTracking(transactionId);
        this.emit('transaction:expired', transactionId);
      }
    }, this.config.completedRetentionSeconds! * 1000);
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.checkTimeouts();
    }, this.config.cleanupIntervalMs!);
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
   * Estimate memory usage
   */
  private estimateMemoryUsage(): number {
    // Rough estimate: each state entry ~200 bytes
    return this.states.size * 200;
  }

  /**
   * Ensure manager is not disposed
   */
  private ensureNotDisposed(): void {
    if (this.isDisposed) {
      throw new WalletError(
        WalletErrorCode.ResourceDisposed,
        'Transaction state manager has been disposed',
        { severity: ErrorSeverity.Error }
      );
    }
  }

  /**
   * Dispose of the state manager and clean up resources
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.stopCleanupTimer();
    
    this.states.clear();
    this.timeoutIndex.clear();
    this.removeAllListeners();
  }

  /**
   * AsyncDisposable implementation
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }
}
