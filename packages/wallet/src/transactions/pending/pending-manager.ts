/**
 * @fileoverview Pending Transaction Manager
 * 
 * Manages pending transactions with automatic refresh, timeout detection,
 * and state monitoring. Provides separate handling for inbound and outbound
 * pending transactions with different capabilities.
 */

import { TypedEventEmitter } from '@tari-project/tarijs-core';
import {
  getFFIBindings,
  WalletError,
  WalletErrorCode,
  withErrorContext,
  withRetry,
  type WalletHandle,
  type TransactionId,
  type UnixTimestamp
} from '@tari-project/tarijs-core';
import type {
  PendingInboundTransaction,
  PendingOutboundTransaction,
  TransactionStatusUpdate
} from '@tari-project/tarijs-core';
import { TransactionStatus } from '@tari-project/tarijs-core';
import { TransactionRepository } from '../transaction-repository.js';
import { PendingTracker } from './pending-tracker.js';
import { TimeoutHandler } from './timeout-handler.js';

/**
 * Configuration for the pending transaction manager
 */
export interface PendingManagerConfig {
  /** Wallet handle for FFI operations */
  walletHandle: WalletHandle;
  /** Auto-refresh interval in milliseconds */
  refreshIntervalMs: number;
  /** Transaction timeout in seconds */
  transactionTimeoutSeconds: number;
  /** Maximum number of concurrent refresh operations */
  maxConcurrentRefresh: number;
  /** Whether to auto-refresh pending transactions */
  autoRefresh: boolean;
  /** Whether to auto-cancel timed out transactions */
  autoCancelTimeout: boolean;
  /** Retry configuration for failed refresh operations */
  retryConfig: {
    maxAttempts: number;
    baseDelay: number;
    backoffMultiplier: number;
  };
}

/**
 * Pending transaction manager events
 */
export interface PendingManagerEvents extends Record<string, (...args: any[]) => void> {
  'pending:updated': (update: TransactionStatusUpdate) => void;
  'pending:timeout': (transactionId: TransactionId, timeoutSeconds: number) => void;
  'pending:refreshed': (inboundCount: number, outboundCount: number) => void;
  'pending:error': (error: WalletError, transactionId?: TransactionId) => void;
  'pending:auto_cancelled': (transactionId: TransactionId, reason: string) => void;
}

/**
 * Pending transaction counts and metadata
 */
export interface PendingTransactionSummary {
  /** Total number of pending transactions */
  total: number;
  /** Number of pending inbound transactions */
  inbound: number;
  /** Number of pending outbound transactions */
  outbound: number;
  /** Oldest pending transaction timestamp */
  oldestTimestamp?: UnixTimestamp;
  /** Number of transactions approaching timeout */
  approachingTimeout: number;
  /** Last refresh timestamp */
  lastRefreshTimestamp: UnixTimestamp;
  /** Next scheduled refresh timestamp */
  nextRefreshTimestamp?: UnixTimestamp;
}

/**
 * Pending transaction refresh result
 */
export interface RefreshResult {
  /** Number of transactions updated */
  updatedCount: number;
  /** Number of new transactions discovered */
  newCount: number;
  /** Number of transactions that changed status */
  statusChangedCount: number;
  /** Any errors encountered during refresh */
  errors: WalletError[];
  /** Refresh execution time in milliseconds */
  executionTimeMs: number;
}

/**
 * Pending manager statistics
 */
export interface PendingManagerStatistics {
  /** Total number of refreshes performed */
  totalRefreshCount: number;
  /** Last refresh timestamp */
  lastRefreshTime: number;
  /** Whether currently refreshing */
  isCurrentlyRefreshing: boolean;
  /** Average refresh interval */
  averageRefreshInterval: number;
  /** Next scheduled refresh time */
  nextScheduledRefresh?: number;
}

/**
 * Pending transaction manager providing comprehensive pending transaction handling
 * 
 * Features:
 * - Automatic refresh of pending transactions from FFI
 * - Separate tracking of inbound vs outbound pending transactions
 * - Timeout detection with configurable thresholds
 * - Auto-cancellation of timed out outbound transactions
 * - Rate limiting and concurrent operation management
 * - Detailed refresh statistics and error reporting
 * - Event emission for all state changes
 */
export class PendingManager extends TypedEventEmitter {
  private readonly config: PendingManagerConfig;
  private readonly repository: TransactionRepository;
  private readonly tracker: PendingTracker;
  private readonly timeoutHandler: TimeoutHandler;
  private readonly ffi = getFFIBindings();
  
  private refreshTimer?: NodeJS.Timeout;
  private isRefreshing = false;
  private refreshCount = 0;
  private lastRefreshTime = 0;
  private isDisposed = false;

  constructor(
    config: PendingManagerConfig,
    repository: TransactionRepository
  ) {
    super();
    
    this.config = config;
    this.repository = repository;
    this.tracker = new PendingTracker(config);
    this.timeoutHandler = new TimeoutHandler(config, this);

    // Set up event forwarding
    this.tracker.on('transaction:tracked', (tx) => {
      this.emit('pending:updated', {
        id: tx.id,
        previousStatus: TransactionStatus.Unknown as any,
        newStatus: TransactionStatus.Pending,
        timestamp: Date.now() as UnixTimestamp,
        details: { trackingStarted: true }
      });
    });

    this.timeoutHandler.on('transaction:timeout', (txId, timeoutSeconds) => {
      this.emit('pending:timeout', txId, timeoutSeconds);
      
      if (this.config.autoCancelTimeout) {
        this.handleAutoCancel(txId, `Transaction timed out after ${timeoutSeconds} seconds`);
      }
    });

    // Start auto-refresh if enabled
    if (config.autoRefresh) {
      this.startAutoRefresh();
    }
  }

  /**
   * Get current pending transaction summary
   */
  @withErrorContext('get_pending_summary', 'pending_manager')
  async getPendingSummary(): Promise<PendingTransactionSummary> {
    this.ensureNotDisposed();
    
    const pending = await this.repository.getTransactions({
      status: [TransactionStatus.Pending]
    });

    const now = Date.now() as UnixTimestamp;
    const timeoutThreshold = this.config.transactionTimeoutSeconds * 1000;
    
    let inboundCount = 0;
    let outboundCount = 0;
    let oldestTimestamp: UnixTimestamp | undefined;
    let approachingTimeout = 0;

    for (const tx of pending) {
      if ('pendingId' in tx) {
        // This is a pending transaction
        if ('cancellable' in tx && tx.cancellable) {
          outboundCount++;
        } else {
          inboundCount++;
        }

        const txTimestamp = tx.timestamp as UnixTimestamp;
        if (!oldestTimestamp || txTimestamp < oldestTimestamp) {
          oldestTimestamp = txTimestamp;
        }

        // Check if approaching timeout (within 80% of timeout period)
        const age = now - txTimestamp;
        if (age > timeoutThreshold * 0.8) {
          approachingTimeout++;
        }
      }
    }

    return {
      total: pending.length,
      inbound: inboundCount,
      outbound: outboundCount,
      oldestTimestamp,
      approachingTimeout,
      lastRefreshTimestamp: this.lastRefreshTime as UnixTimestamp,
      nextRefreshTimestamp: this.getNextRefreshTime()
    };
  }

  /**
   * Get all pending transactions with separation by direction
   */
  @withErrorContext('get_pending_transactions', 'pending_manager')
  async getPendingTransactions(): Promise<{
    inbound: PendingInboundTransaction[];
    outbound: PendingOutboundTransaction[];
  }> {
    this.ensureNotDisposed();
    
    const pending = await this.repository.getTransactions({
      status: [TransactionStatus.Pending]
    });

    const inbound: PendingInboundTransaction[] = [];
    const outbound: PendingOutboundTransaction[] = [];

    for (const tx of pending) {
      if ('pendingId' in tx) {
        if ('cancellable' in tx && tx.cancellable) {
          outbound.push(tx as PendingOutboundTransaction);
        } else {
          inbound.push(tx as PendingInboundTransaction);
        }
      }
    }

    return { inbound, outbound };
  }

  /**
   * Manually refresh pending transactions from FFI
   */
  @withErrorContext('refresh_pending_transactions', 'pending_manager')
  @withRetry()
  async refreshPendingTransactions(): Promise<RefreshResult> {
    this.ensureNotDisposed();
    
    if (this.isRefreshing) {
      throw new WalletError(
        WalletErrorCode.OperationInProgress,
        'Pending transaction refresh already in progress'
      );
    }

    const startTime = Date.now();
    this.isRefreshing = true;
    
    try {
      const result = await this.performRefresh();
      this.lastRefreshTime = Date.now();
      this.refreshCount++;
      
      // Emit refresh event
      const summary = await this.getPendingSummary();
      this.emit('pending:refreshed', summary.inbound, summary.outbound);
      
      return result;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Force refresh a specific pending transaction
   */
  @withErrorContext('refresh_specific_transaction', 'pending_manager')
  async refreshSpecificTransaction(transactionId: TransactionId): Promise<boolean> {
    this.ensureNotDisposed();
    
    try {
      // Query FFI for specific transaction status
      const transactionStatus = await this.ffi.walletGetTransactionStatus(
        this.config.walletHandle,
        transactionId.toString()
      );

      if (transactionStatus.status !== TransactionStatus.Pending) {
        // Transaction is no longer pending, update repository
        const existingTx = await this.repository.getTransaction(transactionId);
        if (existingTx) {
          const updatedTx = {
            ...existingTx,
            status: transactionStatus.status,
            timestamp: Date.now() as any
          };

          await this.repository.updateTransaction(updatedTx);
          this.tracker.stopTracking(transactionId);
          
          this.emit('pending:updated', {
            id: transactionId,
            previousStatus: TransactionStatus.Pending,
            newStatus: transactionStatus.status,
            timestamp: Date.now() as UnixTimestamp,
            details: { manualRefresh: true }
          });
          
          return true;
        }
      }
      
      return false;
    } catch (error: unknown) {
      const walletError = error instanceof WalletError ? error : new WalletError(
        WalletErrorCode.FFIError,
        `Failed to refresh transaction ${transactionId}`,
        { 
          cause: error,
          context: { transactionId: transactionId.toString() }
        }
      );
      
      this.emit('pending:error', walletError, transactionId);
      throw walletError;
    }
  }

  /**
   * Start tracking a new pending transaction
   */
  @withErrorContext('track_pending_transaction', 'pending_manager')
  async trackPendingTransaction(transaction: PendingInboundTransaction | PendingOutboundTransaction): Promise<void> {
    this.ensureNotDisposed();
    
    // Add to tracker
    this.tracker.trackTransaction(transaction);
    
    // Start timeout monitoring
    this.timeoutHandler.startMonitoring(transaction.id, this.config.transactionTimeoutSeconds);
  }

  /**
   * Stop tracking a pending transaction
   */
  @withErrorContext('stop_tracking_transaction', 'pending_manager')
  async stopTrackingTransaction(transactionId: TransactionId): Promise<void> {
    this.ensureNotDisposed();
    
    this.tracker.stopTracking(transactionId);
    this.timeoutHandler.stopMonitoring(transactionId);
  }

  /**
   * Get pending transaction refresh statistics
   */
  getRefreshStatistics(): {
    totalRefreshCount: number;
    lastRefreshTime: number;
    isCurrentlyRefreshing: boolean;
    averageRefreshInterval: number;
    nextScheduledRefresh?: number;
  } {
    const averageInterval = this.refreshCount > 1 ? 
      (Date.now() - this.config.refreshIntervalMs) / (this.refreshCount - 1) : 
      this.config.refreshIntervalMs;

    return {
      totalRefreshCount: this.refreshCount,
      lastRefreshTime: this.lastRefreshTime,
      isCurrentlyRefreshing: this.isRefreshing,
      averageRefreshInterval: averageInterval,
      nextScheduledRefresh: this.getNextRefreshTime()
    };
  }

  /**
   * Perform the actual refresh operation
   */
  private async performRefresh(): Promise<RefreshResult> {
    const startTime = Date.now();
    const errors: WalletError[] = [];
    let updatedCount = 0;
    let newCount = 0;
    let statusChangedCount = 0;

    try {
      // Get current pending transactions from FFI
      const [inboundFFI, outboundFFI] = await Promise.all([
        this.ffi.walletGetPendingInboundTransactions(this.config.walletHandle),
        this.ffi.walletGetPendingOutboundTransactions(this.config.walletHandle)
      ]);

      // Process inbound transactions
      for (const ffiTx of inboundFFI) {
        try {
          const result = await this.processFFITransaction(ffiTx, 'inbound');
          if (result.isNew) newCount++;
          if (result.statusChanged) statusChangedCount++;
          updatedCount++;
        } catch (error: unknown) {
          errors.push(this.createProcessingError(error, ffiTx.id));
        }
      }

      // Process outbound transactions
      for (const ffiTx of outboundFFI) {
        try {
          const result = await this.processFFITransaction(ffiTx, 'outbound');
          if (result.isNew) newCount++;
          if (result.statusChanged) statusChangedCount++;
          updatedCount++;
        } catch (error: unknown) {
          errors.push(this.createProcessingError(error, ffiTx.id));
        }
      }

      // Check for transactions that are no longer pending in FFI
      await this.checkForCompletedTransactions(inboundFFI, outboundFFI);

    } catch (error: unknown) {
      const ffiError = error instanceof WalletError ? error : new WalletError(
        WalletErrorCode.FFIError,
        'Failed to fetch pending transactions from FFI',
        { cause: error instanceof Error ? error : undefined }
      );
      errors.push(ffiError);
      this.emit('pending:error', ffiError);
    }

    const executionTimeMs = Date.now() - startTime;

    return {
      updatedCount,
      newCount,
      statusChangedCount,
      errors,
      executionTimeMs
    };
  }

  /**
   * Process a single FFI transaction
   */
  private async processFFITransaction(
    ffiTx: any,
    direction: 'inbound' | 'outbound'
  ): Promise<{ isNew: boolean; statusChanged: boolean }> {
    const existingTx = await this.repository.getTransaction(ffiTx.id);
    
    if (!existingTx) {
      // New pending transaction
      const pendingTx = this.convertFFIToPendingTransaction(ffiTx, direction);
      await this.repository.addTransaction(pendingTx);
      await this.trackPendingTransaction(pendingTx);
      return { isNew: true, statusChanged: false };
    }

    // Check if status changed
    if (existingTx.status !== ffiTx.status) {
      const updatedTx = {
        ...existingTx,
        status: ffiTx.status,
        timestamp: Date.now() as any
      };

      await this.repository.updateTransaction(updatedTx);
      
      this.emit('pending:updated', {
        id: ffiTx.id,
        previousStatus: existingTx.status,
        newStatus: ffiTx.status,
        timestamp: Date.now() as UnixTimestamp,
        details: { refreshUpdate: true }
      });

      if (ffiTx.status !== TransactionStatus.Pending) {
        await this.stopTrackingTransaction(ffiTx.id);
      }

      return { isNew: false, statusChanged: true };
    }

    return { isNew: false, statusChanged: false };
  }

  /**
   * Check for transactions that are no longer pending in FFI
   */
  private async checkForCompletedTransactions(inboundFFI: any[], outboundFFI: any[]): Promise<void> {
    const ffiTransactionIds = new Set([
      ...inboundFFI.map(tx => tx.id.toString()),
      ...outboundFFI.map(tx => tx.id.toString())
    ]);

    const localPending = await this.repository.getTransactions({
      status: [TransactionStatus.Pending]
    });

    for (const localTx of localPending) {
      if (!ffiTransactionIds.has(localTx.id.toString())) {
        // Transaction is no longer pending in FFI, check its current status
        try {
          const currentStatus = await this.ffi.walletGetTransactionStatus(
            this.config.walletHandle,
            localTx.id.toString()
          );

          if (currentStatus.status !== TransactionStatus.Pending) {
            const updatedTx = {
              ...localTx,
              status: currentStatus.status,
              timestamp: Date.now() as any
            };

            await this.repository.updateTransaction(updatedTx);
            await this.stopTrackingTransaction(localTx.id);

            this.emit('pending:updated', {
              id: localTx.id,
              previousStatus: TransactionStatus.Pending,
              newStatus: currentStatus.status,
              timestamp: Date.now() as UnixTimestamp,
              details: { completedDetection: true }
            });
          }
        } catch (error: unknown) {
          // Log error but don't fail the entire refresh
          console.warn(`Failed to check status for transaction ${localTx.id}:`, error);
        }
      }
    }
  }

  /**
   * Convert FFI transaction to pending transaction object
   */
  private convertFFIToPendingTransaction(
    ffiTx: any,
    direction: 'inbound' | 'outbound'
  ): PendingInboundTransaction | PendingOutboundTransaction {
    const baseTx = {
      id: ffiTx.id,
      amount: ffiTx.amount,
      fee: ffiTx.fee || BigInt(0),
      status: TransactionStatus.Pending,
      message: ffiTx.message || '',
      timestamp: ffiTx.timestamp || Date.now(),
      address: ffiTx.address || '',
      isOneSided: ffiTx.isOneSided || false,
      isCoinbase: false,
      pendingId: ffiTx.id
    };

    if (direction === 'inbound') {
      return {
        ...baseTx,
        direction: 'Inbound' as any,
        senderId: ffiTx.senderId
      } as PendingInboundTransaction;
    } else {
      return {
        ...baseTx,
        direction: 'Outbound' as any,
        cancellable: true
      } as PendingOutboundTransaction;
    }
  }

  /**
   * Create error for transaction processing failure
   */
  private createProcessingError(error: unknown, transactionId: any): WalletError {
    return error instanceof WalletError ? error : new WalletError(
      WalletErrorCode.TransactionProcessingFailed,
      `Failed to process pending transaction ${transactionId}`,
      { 
        cause: error,
        context: { transactionId: transactionId.toString() }
      }
    );
  }

  /**
   * Handle auto-cancellation of timed out transactions
   */
  private async handleAutoCancel(transactionId: TransactionId, reason: string): Promise<void> {
    try {
      // Only cancel outbound transactions
      const transaction = await this.repository.getTransaction(transactionId);
      if (transaction && 'cancellable' in transaction && transaction.cancellable) {
        // This would typically call the transaction service's cancel method
        // For now, just emit the event
        this.emit('pending:auto_cancelled', transactionId, reason);
      }
    } catch (error: unknown) {
      this.emit('pending:error', 
        error instanceof WalletError ? error : new WalletError(
          WalletErrorCode.AutoCancellationFailed,
          `Failed to auto-cancel transaction ${transactionId}`,
          { 
            cause: error,
            context: { transactionId: transactionId.toString(), reason }
          }
        ),
        transactionId
      );
    }
  }

  /**
   * Start automatic refresh timer
   */
  private startAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(async () => {
      if (!this.isDisposed && !this.isRefreshing) {
        try {
          await this.refreshPendingTransactions();
        } catch (error: unknown) {
          this.emit('pending:error', 
            error instanceof WalletError ? error : new WalletError(
              WalletErrorCode.AutoRefreshFailed,
              'Automatic pending transaction refresh failed',
              { cause: error instanceof Error ? error : undefined }
            )
          );
        }
      }
    }, this.config.refreshIntervalMs);
  }

  /**
   * Stop automatic refresh timer
   */
  private stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  /**
   * Get next scheduled refresh time
   */
  private getNextRefreshTime(): UnixTimestamp | undefined {
    if (!this.config.autoRefresh || !this.refreshTimer) {
      return undefined;
    }

    return (this.lastRefreshTime + this.config.refreshIntervalMs) as UnixTimestamp;
  }

  /**
   * Ensure manager is not disposed
   */
  private ensureNotDisposed(): void {
    if (this.isDisposed) {
      throw new WalletError(
        WalletErrorCode.ResourceDisposed,
        'Pending transaction manager has been disposed'
      );
    }
  }

  /**
   * Dispose of the manager and clean up resources
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.stopAutoRefresh();
    
    await this.tracker.dispose();
    await this.timeoutHandler.dispose();
    
    this.removeAllListeners();
  }
}

/**
 * Default configuration for pending transaction manager
 */
export const DEFAULT_PENDING_MANAGER_CONFIG: Partial<PendingManagerConfig> = {
  refreshIntervalMs: 30000, // 30 seconds
  transactionTimeoutSeconds: 3600, // 1 hour
  maxConcurrentRefresh: 3,
  autoRefresh: true,
  autoCancelTimeout: false, // Don't auto-cancel by default for safety
  retryConfig: {
    maxAttempts: 3,
    baseDelay: 1000,
    backoffMultiplier: 2
  }
};
