/**
 * @fileoverview Transaction Refund Handler
 * 
 * Handles refund processing for cancelled transactions including
 * balance updates, fee recovery, and event emission.
 */

import { EventEmitter } from 'node:events';
import {
  getFFIBindings,
  WalletError,
  WalletErrorCode,
  withErrorContext,
  withRetry,
  RetryConfigs,
  microTariFromFFI,
  type TransactionId,
  type WalletHandle,
  type MicroTari,
  type PendingOutboundTransaction,
  type UnixTimestamp,
  type Balance
} from '@tari-project/tarijs-core';
import type { CancellationServiceConfig } from './cancellation-service.js';

/**
 * Result of a refund operation
 */
export interface RefundResult {
  /** Whether the refund was successful */
  success: boolean;
  /** Transaction ID that was refunded */
  transactionId: TransactionId;
  /** Amount refunded to available balance */
  amount: MicroTari;
  /** Fee that was refunded */
  fee: MicroTari;
  /** Total refund amount (amount + fee) */
  totalRefund: MicroTari;
  /** Timestamp when refund was processed */
  timestamp: UnixTimestamp;
  /** Updated wallet balance after refund */
  newBalance?: Balance;
  /** Error details if refund failed */
  error?: Error;
}

/**
 * Events emitted by the refund handler
 */
export interface RefundHandlerEvents {
  'refund:started': (transactionId: TransactionId) => void;
  'refund:processed': (transactionId: TransactionId, amount: MicroTari) => void;
  'refund:failed': (transactionId: TransactionId, error: Error) => void;
  'balance:updated': (newBalance: Balance) => void;
}

/**
 * Statistics for refund operations
 */
export interface RefundStatistics {
  /** Total number of refunds processed */
  totalRefunds: number;
  /** Total amount refunded */
  totalAmountRefunded: MicroTari;
  /** Total fees refunded */
  totalFeesRefunded: MicroTari;
  /** Average refund amount */
  averageRefundAmount: MicroTari;
  /** Number of failed refunds */
  failedRefunds: number;
  /** Last refund timestamp */
  lastRefundTime?: UnixTimestamp;
}

/**
 * Transaction refund handler
 * 
 * Processes refunds for cancelled transactions by:
 * - Updating wallet balance to reflect returned funds
 * - Recovering transaction fees
 * - Emitting events for UI updates
 * - Providing detailed refund tracking
 */
export class RefundHandler extends EventEmitter<RefundHandlerEvents> {
  private readonly walletHandle: WalletHandle;
  private readonly config: CancellationServiceConfig;
  private readonly ffiBindings = getFFIBindings();
  
  private statistics: RefundStatistics = {
    totalRefunds: 0,
    totalAmountRefunded: BigInt(0) as MicroTari,
    totalFeesRefunded: BigInt(0) as MicroTari,
    averageRefundAmount: BigInt(0) as MicroTari,
    failedRefunds: 0
  };
  
  private isDisposed = false;

  constructor(walletHandle: WalletHandle, config: CancellationServiceConfig) {
    super();
    this.walletHandle = walletHandle;
    this.config = config;
  }

  /**
   * Process refund for a cancelled transaction
   */
  @withErrorContext('process_refund', 'refund_handler')
  @withRetry(() => RetryConfigs.database())
  async processRefund(
    transactionId: TransactionId,
    transaction: PendingOutboundTransaction
  ): Promise<RefundResult> {
    this.ensureNotDisposed();
    
    const startTime = Date.now();
    
    try {
      this.emit('refund:started', transactionId);
      
      // Get current balance before refund
      const currentBalance = await this.getCurrentBalance();
      
      // Calculate refund amounts
      const refundAmount = BigInt(transaction.amount) as MicroTari;
      const refundFee = BigInt(transaction.fee) as MicroTari;
      const totalRefund = (BigInt(refundAmount) + BigInt(refundFee)) as MicroTari;
      
      // Process the refund by updating wallet state
      const newBalance = await this.updateBalance(currentBalance, totalRefund);
      
      // Update statistics
      this.updateStatistics(refundAmount, refundFee);
      
      const result: RefundResult = {
        success: true,
        transactionId,
        amount: refundAmount,
        fee: refundFee,
        totalRefund,
        timestamp: Date.now() as UnixTimestamp,
        newBalance
      };
      
      // Emit success events
      this.emit('refund:processed', transactionId, totalRefund);
      this.emit('balance:updated', newBalance);
      
      this.statistics.lastRefundTime = Date.now() as UnixTimestamp;
      
      return result;
      
    } catch (error: unknown) {
      this.statistics.failedRefunds++;
      
      const result: RefundResult = {
        success: false,
        transactionId,
        amount: BigInt(0) as MicroTari,
        fee: BigInt(0) as MicroTari,
        totalRefund: BigInt(0) as MicroTari,
        timestamp: Date.now() as UnixTimestamp,
        error: error instanceof Error ? error : new Error(String(error))
      };
      
      this.emit('refund:failed', transactionId, result.error);
      
      throw error;
    }
  }

  /**
   * Calculate potential refund for a transaction
   */
  @withErrorContext('calculate_refund', 'refund_handler')
  calculatePotentialRefund(transaction: PendingOutboundTransaction): {
    amount: MicroTari;
    fee: MicroTari;
    total: MicroTari;
  } {
    this.ensureNotDisposed();
    
    const amount = BigInt(transaction.amount) as MicroTari;
    const fee = BigInt(transaction.fee) as MicroTari;
    const total = (BigInt(amount) + BigInt(fee)) as MicroTari;
    
    return { amount, fee, total };
  }

  /**
   * Get refund statistics
   */
  @withErrorContext('get_refund_statistics', 'refund_handler')
  getStatistics(): RefundStatistics {
    this.ensureNotDisposed();
    return { ...this.statistics };
  }

  /**
   * Reset refund statistics
   */
  @withErrorContext('reset_refund_statistics', 'refund_handler')
  resetStatistics(): void {
    this.ensureNotDisposed();
    
    this.statistics = {
      totalRefunds: 0,
      totalAmountRefunded: BigInt(0) as MicroTari,
      totalFeesRefunded: BigInt(0) as MicroTari,
      averageRefundAmount: BigInt(0) as MicroTari,
      failedRefunds: 0
    };
  }

  /**
   * Validate that a refund can be processed
   */
  @withErrorContext('validate_refund', 'refund_handler')
  validateRefund(transaction: PendingOutboundTransaction): void {
    this.ensureNotDisposed();
    
    if (!transaction) {
      throw new WalletError(
        WalletErrorCode.InvalidArgument,
        'Transaction is required for refund processing'
      );
    }
    
    if (transaction.status !== 'pending') {
      throw new WalletError(
        WalletErrorCode.TransactionCancellationNotAllowed,
        `Cannot refund transaction in ${transaction.status} state`
      );
    }
    
    if (BigInt(transaction.amount) <= 0) {
      throw new WalletError(
        WalletErrorCode.InvalidAmount,
        'Transaction amount must be positive for refund'
      );
    }
    
    if (BigInt(transaction.fee) < 0) {
      throw new WalletError(
        WalletErrorCode.InvalidAmount,
        'Transaction fee cannot be negative'
      );
    }
  }

  /**
   * Process batch refunds for multiple transactions
   */
  @withErrorContext('process_batch_refunds', 'refund_handler')
  async processBatchRefunds(
    transactions: Array<{ transactionId: TransactionId; transaction: PendingOutboundTransaction }>
  ): Promise<RefundResult[]> {
    this.ensureNotDisposed();
    
    if (transactions.length === 0) {
      return [];
    }
    
    const results: RefundResult[] = [];
    let totalRefundAmount = BigInt(0);
    
    // Calculate total refund first
    for (const { transaction } of transactions) {
      this.validateRefund(transaction);
      totalRefundAmount += BigInt(transaction.amount) + BigInt(transaction.fee);
    }
    
    try {
      // Get current balance
      const currentBalance = await this.getCurrentBalance();
      
      // Update balance with total refund
      const newBalance = await this.updateBalance(
        currentBalance, 
        totalRefundAmount as MicroTari
      );
      
      // Process individual refund results
      for (const { transactionId, transaction } of transactions) {
        const refundAmount = BigInt(transaction.amount) as MicroTari;
        const refundFee = BigInt(transaction.fee) as MicroTari;
        const totalRefund = (BigInt(refundAmount) + BigInt(refundFee)) as MicroTari;
        
        results.push({
          success: true,
          transactionId,
          amount: refundAmount,
          fee: refundFee,
          totalRefund,
          timestamp: Date.now() as UnixTimestamp,
          newBalance: results.length === transactions.length - 1 ? newBalance : undefined
        });
        
        this.updateStatistics(refundAmount, refundFee);
        this.emit('refund:processed', transactionId, totalRefund);
      }
      
      // Emit final balance update
      this.emit('balance:updated', newBalance);
      
      this.statistics.lastRefundTime = Date.now() as UnixTimestamp;
      
    } catch (error: unknown) {
      // If batch processing fails, return error for all transactions
      for (const { transactionId } of transactions) {
        this.statistics.failedRefunds++;
        
        results.push({
          success: false,
          transactionId,
          amount: BigInt(0) as MicroTari,
          fee: BigInt(0) as MicroTari,
          totalRefund: BigInt(0) as MicroTari,
          timestamp: Date.now() as UnixTimestamp,
          error: error instanceof Error ? error : new Error(String(error))
        });
        
        this.emit('refund:failed', transactionId, results[results.length - 1].error!);
      }
    }
    
    return results;
  }

  /**
   * Get current wallet balance
   */
  private async getCurrentBalance(): Promise<Balance> {
    try {
      const balanceJson = await this.ffiBindings.walletGetBalance(this.walletHandle);
      return JSON.parse(balanceJson);
    } catch (error: unknown) {
      throw new WalletError(
        WalletErrorCode.BalanceQueryFailed,
        `Failed to get current balance: ${error}`,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Update wallet balance with refund amount
   */
  private async updateBalance(
    currentBalance: Balance,
    refundAmount: MicroTari
  ): Promise<Balance> {
    // In a real implementation, this would call FFI to update the balance
    // For now, we calculate the new balance locally
    
    const newAvailable = (BigInt(currentBalance.available) + BigInt(refundAmount)) as MicroTari;
    const newPendingIncoming = currentBalance.pendingIncoming;
    const newPendingOutgoing = (BigInt(currentBalance.pendingOutgoing) - BigInt(refundAmount)) as MicroTari;
    
    const newBalance: Balance = {
      available: newAvailable,
      pendingIncoming: newPendingIncoming,
      pendingOutgoing: microTariFromFFI(BigInt(Math.max(0, Number(newPendingOutgoing)))),
      timelocked: currentBalance.timelocked
    };
    
    // Note: In a real implementation, you would likely need to call an FFI function
    // to properly update the wallet's internal state, such as:
    // await this.ffiBindings.wallet_update_balance(this.walletHandle, newBalance);
    
    return newBalance;
  }

  /**
   * Update refund statistics
   */
  private updateStatistics(amount: MicroTari, fee: MicroTari): void {
    this.statistics.totalRefunds++;
    this.statistics.totalAmountRefunded = 
      (BigInt(this.statistics.totalAmountRefunded) + BigInt(amount)) as MicroTari;
    this.statistics.totalFeesRefunded = 
      (BigInt(this.statistics.totalFeesRefunded) + BigInt(fee)) as MicroTari;
    
    // Calculate new average
    const totalRefunded = BigInt(this.statistics.totalAmountRefunded) + BigInt(this.statistics.totalFeesRefunded);
    this.statistics.averageRefundAmount = 
      (totalRefunded / BigInt(this.statistics.totalRefunds)) as MicroTari;
  }

  /**
   * Ensure handler is not disposed
   */
  private ensureNotDisposed(): void {
    if (this.isDisposed) {
      throw new WalletError(
        WalletErrorCode.ResourceDisposed,
        'Refund handler has been disposed'
      );
    }
  }

  /**
   * Dispose of the handler
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }
    
    this.isDisposed = true;
    this.removeAllListeners();
  }
}
