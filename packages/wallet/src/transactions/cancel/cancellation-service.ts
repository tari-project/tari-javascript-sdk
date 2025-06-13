/**
 * @fileoverview Transaction Cancellation Service
 * 
 * Provides comprehensive transaction cancellation functionality with validation,
 * refund handling, and proper state management for the Tari wallet SDK.
 */

import {
  getFFIBindings,
  WalletError,
  WalletErrorCode,
  withErrorContext,
  withRetry,
  RetryConfigs,
  TypedEventEmitter,
  type TransactionId,
  type WalletHandle,
  type MicroTari,
  type UnixTimestamp,
  type PendingOutboundTransaction
} from '@tari-project/tarijs-core';
import { CancelValidator } from './cancel-validator.js';
import { RefundHandler } from './refund-handler.js';

/**
 * Configuration for the cancellation service
 */
export interface CancellationServiceConfig {
  /** Enable automatic refund processing */
  enableAutomaticRefunds: boolean;
  /** Maximum time to wait for cancellation confirmation (seconds) */
  cancellationTimeoutSeconds: number;
  /** Enable event emission for cancellation operations */
  enableEventEmission: boolean;
  /** Allow cancellation of older transactions */
  allowOlderTransactionCancellation: boolean;
  /** Maximum age of transactions that can be cancelled (hours) */
  maxCancellationAgeHours: number;
  /** Enable retry logic for failed cancellations */
  enableRetryOnFailure: boolean;
  /** Maximum retry attempts for cancellation */
  maxRetryAttempts: number;
}

/**
 * Default cancellation service configuration
 */
export const DEFAULT_CANCELLATION_CONFIG: CancellationServiceConfig = {
  enableAutomaticRefunds: true,
  cancellationTimeoutSeconds: 60,
  enableEventEmission: true,
  allowOlderTransactionCancellation: true,
  maxCancellationAgeHours: 24,
  enableRetryOnFailure: true,
  maxRetryAttempts: 3
};

/**
 * Events emitted by the cancellation service
 */
export interface CancellationServiceEvents {
  'cancellation:started': (transactionId: TransactionId) => void;
  'cancellation:completed': (transactionId: TransactionId, refundAmount: MicroTari) => void;
  'cancellation:failed': (transactionId: TransactionId, error: Error) => void;
  'refund:processed': (transactionId: TransactionId, amount: MicroTari) => void;
  'refund:failed': (transactionId: TransactionId, error: Error) => void;
}

/**
 * Result of a cancellation operation
 */
export interface CancellationResult {
  /** Whether the cancellation was successful */
  success: boolean;
  /** The cancelled transaction ID */
  transactionId: TransactionId;
  /** Amount refunded to the user */
  refundAmount: MicroTari;
  /** Fee that was refunded */
  refundedFee: MicroTari;
  /** Timestamp when cancellation completed */
  timestamp: UnixTimestamp;
  /** Additional details about the cancellation */
  details?: string;
  /** Error information if cancellation failed */
  error?: Error;
}

/**
 * Statistics for cancellation operations
 */
export interface CancellationStatistics {
  /** Total number of cancellations attempted */
  totalCancellations: number;
  /** Number of successful cancellations */
  successfulCancellations: number;
  /** Number of failed cancellations */
  failedCancellations: number;
  /** Total amount refunded across all cancellations */
  totalRefundAmount: MicroTari;
  /** Average time taken for cancellations (seconds) */
  averageCancellationTime: number;
  /** Most common failure reasons */
  commonFailureReasons: Array<{ reason: string; count: number }>;
  /** Last cancellation timestamp */
  lastCancellationTime?: UnixTimestamp;
}

/**
 * Comprehensive transaction cancellation service
 * 
 * Features:
 * - Validation of cancellation eligibility
 * - Automatic refund processing
 * - Event emission for UI updates
 * - Retry logic for failed operations
 * - Statistics and monitoring
 * - Proper error handling and recovery
 */
export class CancellationService extends TypedEventEmitter<CancellationServiceEvents> {
  private readonly walletHandle: WalletHandle;
  private readonly config: CancellationServiceConfig;
  private readonly validator: CancelValidator;
  private readonly refundHandler: RefundHandler;
  private readonly ffiBindings = getFFIBindings();
  
  private statistics: CancellationStatistics = {
    totalCancellations: 0,
    successfulCancellations: 0,
    failedCancellations: 0,
    totalRefundAmount: BigInt(0) as MicroTari,
    averageCancellationTime: 0,
    commonFailureReasons: []
  };
  
  private readonly cancellationTimes: number[] = [];
  private isDisposed = false;

  constructor(
    walletHandle: WalletHandle,
    config: Partial<CancellationServiceConfig> = {}
  ) {
    super();
    this.walletHandle = walletHandle;
    this.config = { ...DEFAULT_CANCELLATION_CONFIG, ...config };
    
    this.validator = new CancelValidator(this.config);
    this.refundHandler = new RefundHandler(walletHandle, this.config);
    
    this.validateConfig();
    this.setupEventHandlers();
  }

  /**
   * Cancel a pending transaction
   */
  @withErrorContext('cancel_transaction', 'cancellation_service')
  @withRetry(RetryConfigs.transaction())
  async cancelTransaction(transactionId: TransactionId): Promise<CancellationResult> {
    this.ensureNotDisposed();
    
    const startTime = Date.now();
    this.statistics.totalCancellations++;
    
    try {
      // Emit start event
      if (this.config.enableEventEmission) {
        this.emit('cancellation:started', transactionId);
      }
      
      // Get the pending transaction for validation
      const pendingTransaction = await this.getPendingTransaction(transactionId);
      
      // Validate cancellation eligibility
      await this.validator.validateCancellation(transactionId, pendingTransaction);
      
      // Perform the actual cancellation via FFI
      const cancellationSuccess = await this.performCancellation(transactionId);
      
      if (!cancellationSuccess) {
        throw new WalletError(
          WalletErrorCode.TransactionCancellationFailed,
          `Failed to cancel transaction ${transactionId}`
        );
      }
      
      // Process refund if enabled and applicable
      let refundAmount: MicroTari = BigInt(0) as MicroTari;
      let refundedFee: MicroTari = BigInt(0) as MicroTari;
      
      if (this.config.enableAutomaticRefunds && pendingTransaction) {
        const refundResult = await this.refundHandler.processRefund(
          transactionId,
          pendingTransaction
        );
        refundAmount = refundResult.amount;
        refundedFee = refundResult.fee;
      }
      
      // Update statistics
      this.statistics.successfulCancellations++;
      this.statistics.totalRefundAmount = 
        (BigInt(this.statistics.totalRefundAmount) + BigInt(refundAmount)) as MicroTari;
      
      const cancellationTime = (Date.now() - startTime) / 1000;
      this.cancellationTimes.push(cancellationTime);
      this.updateAverageCancellationTime();
      
      const result: CancellationResult = {
        success: true,
        transactionId,
        refundAmount,
        refundedFee,
        timestamp: Date.now() as UnixTimestamp,
        details: 'Transaction cancelled successfully'
      };
      
      // Emit completion event
      if (this.config.enableEventEmission) {
        this.emit('cancellation:completed', transactionId, refundAmount);
      }
      
      this.statistics.lastCancellationTime = Date.now() as UnixTimestamp;
      
      return result;
      
    } catch (error: unknown) {
      this.statistics.failedCancellations++;
      this.trackFailureReason(error);
      
      const result: CancellationResult = {
        success: false,
        transactionId,
        refundAmount: BigInt(0) as MicroTari,
        refundedFee: BigInt(0) as MicroTari,
        timestamp: Date.now() as UnixTimestamp,
        error: error instanceof Error ? error : new Error(String(error))
      };
      
      // Emit failure event
      if (this.config.enableEventEmission) {
        this.emit('cancellation:failed', transactionId, result.error!);
      }
      
      throw error;
    }
  }

  /**
   * Check if a transaction can be cancelled
   */
  @withErrorContext('can_cancel_transaction', 'cancellation_service')
  async canCancelTransaction(transactionId: TransactionId): Promise<{
    canCancel: boolean;
    reason?: string;
  }> {
    this.ensureNotDisposed();
    
    try {
      const pendingTransaction = await this.getPendingTransaction(transactionId);
      await this.validator.validateCancellation(transactionId, pendingTransaction);
      
      return { canCancel: true };
    } catch (error: unknown) {
      const reason = error instanceof WalletError ? 
        error.message : 
        'Unknown validation error';
      
      return { canCancel: false, reason };
    }
  }

  /**
   * Get all pending transactions that can be cancelled
   */
  @withErrorContext('get_cancellable_transactions', 'cancellation_service')
  async getCancellableTransactions(): Promise<PendingOutboundTransaction[]> {
    this.ensureNotDisposed();
    
    try {
      // Get all pending outbound transactions
      const pendingOutboundJson = await this.ffiBindings.wallet_get_pending_outbound_transactions(
        this.walletHandle
      );
      
      const pendingTransactions: PendingOutboundTransaction[] = JSON.parse(pendingOutboundJson as string) as PendingOutboundTransaction[];
      
      // Filter for cancellable transactions
      const cancellable: PendingOutboundTransaction[] = [];
      
      for (const transaction of pendingTransactions) {
        const canCancel = await this.canCancelTransaction(transaction.id);
        if (canCancel.canCancel) {
          cancellable.push(transaction);
        }
      }
      
      return cancellable;
    } catch (error: unknown) {
      throw new WalletError(
        WalletErrorCode.TransactionQueryFailed,
        `Failed to get cancellable transactions: ${error}`,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Cancel multiple transactions in batch
   */
  @withErrorContext('cancel_multiple_transactions', 'cancellation_service')
  async cancelMultipleTransactions(
    transactionIds: TransactionId[]
  ): Promise<CancellationResult[]> {
    this.ensureNotDisposed();
    
    if (transactionIds.length === 0) {
      return [];
    }
    
    const results: CancellationResult[] = [];
    
    // Process cancellations sequentially to avoid overwhelming the system
    for (const transactionId of transactionIds) {
      try {
        const result = await this.cancelTransaction(transactionId);
        results.push(result);
      } catch (error: unknown) {
        results.push({
          success: false,
          transactionId,
          refundAmount: BigInt(0) as MicroTari,
          refundedFee: BigInt(0) as MicroTari,
          timestamp: Date.now() as UnixTimestamp,
          error: error instanceof Error ? error : new Error(String(error))
        });
      }
    }
    
    return results;
  }

  /**
   * Get cancellation statistics
   */
  @withErrorContext('get_cancellation_statistics', 'cancellation_service')
  getStatistics(): CancellationStatistics {
    this.ensureNotDisposed();
    return { ...this.statistics };
  }

  /**
   * Reset cancellation statistics
   */
  @withErrorContext('reset_statistics', 'cancellation_service')
  resetStatistics(): void {
    this.ensureNotDisposed();
    
    this.statistics = {
      totalCancellations: 0,
      successfulCancellations: 0,
      failedCancellations: 0,
      totalRefundAmount: BigInt(0) as MicroTari,
      averageCancellationTime: 0,
      commonFailureReasons: []
    };
    
    this.cancellationTimes.length = 0;
  }

  /**
   * Get a pending transaction by ID
   */
  private async getPendingTransaction(transactionId: TransactionId): Promise<PendingOutboundTransaction | null> {
    try {
      const transactionJson = await this.ffiBindings.wallet_get_pending_outbound_transaction(
        this.walletHandle,
        transactionId.toString()
      );
      
      if (!transactionJson) {
        return null;
      }
      
      return JSON.parse(transactionJson);
    } catch (error: unknown) {
      // Transaction not found is not an error in this context
      return null;
    }
  }

  /**
   * Perform the actual cancellation via FFI
   */
  private async performCancellation(transactionId: TransactionId): Promise<boolean> {
    try {
      const result = await this.ffiBindings.wallet_cancel_pending_transaction(
        this.walletHandle,
        transactionId.toString()
      );
      
      return Boolean(result);
    } catch (error: unknown) {
      throw new WalletError(
        WalletErrorCode.FFIOperationFailed,
        `FFI cancellation failed: ${error}`,
        { 
          cause: error instanceof Error ? error : undefined,
          context: { transactionId: transactionId.toString() }
        }
      );
    }
  }

  /**
   * Track failure reasons for statistics
   */
  private trackFailureReason(error: unknown): void {
    const reason = error instanceof WalletError ? 
      error.code.toString() : 
      'Unknown Error';
    
    const existingReason = this.statistics.commonFailureReasons.find(r => r.reason === reason);
    if (existingReason) {
      existingReason.count++;
    } else {
      this.statistics.commonFailureReasons.push({ reason, count: 1 });
    }
    
    // Keep only top 10 failure reasons
    this.statistics.commonFailureReasons.sort((a, b) => b.count - a.count);
    this.statistics.commonFailureReasons = this.statistics.commonFailureReasons.slice(0, 10);
  }

  /**
   * Update average cancellation time
   */
  private updateAverageCancellationTime(): void {
    if (this.cancellationTimes.length === 0) {
      this.statistics.averageCancellationTime = 0;
      return;
    }
    
    const sum = this.cancellationTimes.reduce((acc, time) => acc + time, 0);
    this.statistics.averageCancellationTime = sum / this.cancellationTimes.length;
    
    // Keep only the last 100 times for rolling average
    if (this.cancellationTimes.length > 100) {
      this.cancellationTimes.splice(0, this.cancellationTimes.length - 100);
    }
  }

  /**
   * Validate configuration parameters
   */
  private validateConfig(): void {
    if (this.config.cancellationTimeoutSeconds <= 0) {
      throw new WalletError(
        WalletErrorCode.InvalidConfiguration,
        'Cancellation timeout must be positive'
      );
    }
    
    if (this.config.maxCancellationAgeHours <= 0) {
      throw new WalletError(
        WalletErrorCode.InvalidConfiguration,
        'Max cancellation age must be positive'
      );
    }
    
    if (this.config.maxRetryAttempts < 0) {
      throw new WalletError(
        WalletErrorCode.InvalidConfiguration,
        'Max retry attempts cannot be negative'
      );
    }
  }

  /**
   * Setup event handlers for refund processing
   */
  private setupEventHandlers(): void {
    this.refundHandler.on('refund:processed', (transactionId, amount) => {
      if (this.config.enableEventEmission) {
        this.emit('refund:processed', transactionId, amount);
      }
    });
    
    this.refundHandler.on('refund:failed', (transactionId, error) => {
      if (this.config.enableEventEmission) {
        this.emit('refund:failed', transactionId, error);
      }
    });
  }

  /**
   * Ensure service is not disposed
   */
  private ensureNotDisposed(): void {
    if (this.isDisposed) {
      throw new WalletError(
        WalletErrorCode.ResourceDisposed,
        'Cancellation service has been disposed'
      );
    }
  }

  /**
   * Dispose of the service and clean up resources
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }
    
    this.isDisposed = true;
    
    // Clean up validator and refund handler
    await this.validator.dispose();
    await this.refundHandler.dispose();
    
    this.removeAllListeners();
  }
}
