/**
 * @fileoverview Transaction Service Core
 * 
 * Central service for managing all transaction operations including creation,
 * tracking, and lifecycle management. Provides high-level abstractions over
 * the FFI transaction functions.
 */

import {
  getFFIBindings,
  WalletError,
  WalletErrorCode,
  ErrorSeverity,
  withErrorContext,
  withRetry,
  withRecovery,
  TypedEventEmitter,
  microTariFromFFI,
  microTariToFFI,
  type WalletHandle,
  type MicroTari,
  type TransactionId,
  type TariAddressString
} from '@tari-project/tarijs-core';
import type {
  TransactionInfo,
  PendingInboundTransaction,
  PendingOutboundTransaction,
  CompletedTransaction,
  CancelledTransaction,
  Transaction,
  SendOneSidedParams,
  TransactionStatusUpdate,
  TransactionBuildResult,
  FeeEstimate,
  TransactionValidationResult,
  TransactionStatistics
} from '@tari-project/tarijs-core';
import type {
  TransactionFilter,
  TransactionQueryOptions,
  SendTransactionParams
} from '../types/transaction-extensions.js';
import { TransactionStatus, TransactionDirection } from '@tari-project/tarijs-core';
import { TariAddress } from '../models/index.js';
import { TransactionRepository } from './transaction-repository.js';
import { TransactionStateManager } from './transaction-state.js';
import { FeeEstimator } from './fees/index.js';
import { 
  StandardSender, 
  type StandardSendOptions,
  OneSidedSender,
  type OneSidedSendOptions
} from './send/index.js';
import { 
  HistoryService,
  type HistoryServiceConfig,
  DEFAULT_HISTORY_SERVICE_CONFIG
} from './history/index.js';

/**
 * Configuration for the transaction service
 */
export interface TransactionServiceConfig {
  /** Wallet handle for FFI operations */
  walletHandle: WalletHandle;
  /** Default fee per gram for transactions */
  defaultFeePerGram: MicroTari;
  /** Maximum transaction history to keep in memory */
  maxHistorySize: number;
  /** Transaction timeout in seconds */
  transactionTimeoutSeconds: number;
  /** Whether to automatically refresh pending transactions */
  autoRefreshPending: boolean;
  /** Refresh interval for pending transactions in milliseconds */
  refreshIntervalMs: number;
  /** Maximum number of concurrent transaction operations */
  maxConcurrentOperations: number;
}

/**
 * Transaction service events
 */
export interface TransactionServiceEvents extends Record<string, (...args: any[]) => void> {
  'transaction:created': (transaction: PendingOutboundTransaction) => void;
  'transaction:updated': (update: TransactionStatusUpdate) => void;
  'transaction:confirmed': (transaction: CompletedTransaction) => void;
  'transaction:cancelled': (transaction: CancelledTransaction) => void;
  'transaction:received': (transaction: PendingInboundTransaction) => void;
  'transaction:error': (error: WalletError, transactionId?: TransactionId) => void;
  'balance:changed': (newBalance: MicroTari, reason: string) => void;
}

/**
 * Core transaction service providing centralized transaction management
 */
export class TransactionService extends TypedEventEmitter<TransactionServiceEvents> {
  private readonly config: TransactionServiceConfig;
  private readonly repository: TransactionRepository;
  private readonly stateManager: TransactionStateManager;
  private readonly feeEstimator: FeeEstimator;
  private readonly standardSender: StandardSender;
  private readonly oneSidedSender: OneSidedSender;
  private readonly historyService: HistoryService;
  private readonly ffi = getFFIBindings();
  private isDisposed = false;
  private refreshTimer?: NodeJS.Timeout;
  private operationSemaphore: number = 0;

  constructor(config: TransactionServiceConfig) {
    super();
    
    this.config = config;
    this.repository = new TransactionRepository({
      maxHistorySize: config.maxHistorySize,
      walletHandle: config.walletHandle
    });
    this.stateManager = new TransactionStateManager({
      timeoutSeconds: config.transactionTimeoutSeconds
    });
    
    // Initialize fee estimator and senders
    this.feeEstimator = new FeeEstimator(config.walletHandle, {
      defaultFeePerGram: config.defaultFeePerGram
    });
    this.standardSender = new StandardSender(config.walletHandle, this.feeEstimator);
    this.oneSidedSender = new OneSidedSender(config.walletHandle, this.feeEstimator);
    
    // Initialize history service
    const historyConfig: HistoryServiceConfig = {
      walletHandle: config.walletHandle,
      ...DEFAULT_HISTORY_SERVICE_CONFIG
    };
    this.historyService = new HistoryService(historyConfig, this.repository);

    // Set up event forwarding
    this.repository.on('transaction:updated', (update) => {
      this.emit('transaction:updated', update);
    });

    this.stateManager.on('transaction:timeout', (transactionId) => {
      this.handleTransactionTimeout(transactionId);
    });

    // Start auto-refresh if enabled
    if (config.autoRefreshPending) {
      this.startPendingRefresh();
    }
  }

  /**
   * Get the wallet handle
   */
  get walletHandle(): WalletHandle {
    return this.config.walletHandle;
  }

  /**
   * Check if service is disposed
   */
  get disposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Send a standard transaction using the StandardSender
   */
  @withErrorContext('send_transaction', 'transaction_service')
  @withRetry({ maxAttempts: 3, baseDelay: 1000 })
  @withRecovery(2)
  async sendTransaction(params: SendTransactionParams): Promise<TransactionId> {
    this.ensureNotDisposed();
    await this.checkOperationLimit();

    try {
      this.operationSemaphore++;

      // Convert params to StandardSendOptions
      const sendOptions: StandardSendOptions = {
        feePerGram: params.feePerGram,
        message: params.message,
        lockHeight: params.lockHeight,
        allowSelfSend: false // Default to false for safety
      };

      // Use StandardSender for the actual sending
      const transactionId = await this.standardSender.sendTransaction(
        params.recipient,
        params.amount,
        sendOptions
      );

      // Create pending transaction record for repository tracking
      const pendingTx: PendingOutboundTransaction = {
        id: transactionId,
        amount: params.amount,
        fee: microTariFromFFI(microTariToFFI(params.feePerGram) * BigInt(250)), // Estimated size in grams
        status: TransactionStatus.Pending,
        direction: TransactionDirection.Outbound,
        message: params.message || '',
        timestamp: Date.now() as any,
        address: params.recipient,
        isOneSided: params.isOneSided || false,
        isCoinbase: false,
        pendingId: transactionId as any,
        cancellable: true
      };

      // Store in repository and state manager
      await this.repository.addTransaction(pendingTx);
      this.stateManager.trackTransaction(transactionId, TransactionStatus.Pending);

      // Emit events
      this.emit('transaction:created', pendingTx);
      this.emit('balance:changed', await this.getCurrentBalance(), 'transaction_sent');

      return transactionId;

    } finally {
      this.operationSemaphore--;
    }
  }

  /**
   * Send a one-sided transaction using the dedicated OneSidedSender
   */
  @withErrorContext('send_one_sided_transaction', 'transaction_service')
  @withRetry({ maxAttempts: 3, baseDelay: 1000 })
  @withRecovery(2)
  async sendOneSidedTransaction(params: SendOneSidedParams): Promise<TransactionId> {
    this.ensureNotDisposed();
    await this.checkOperationLimit();

    try {
      this.operationSemaphore++;

      // Convert params to OneSidedSendOptions
      const sendOptions: OneSidedSendOptions = {
        feePerGram: params.feePerGram,
        message: params.message,
        useStealth: params.useStealth || false,
        recoveryData: params.recoveryData
      };

      // Use OneSidedSender for the actual sending
      const transactionId = await this.oneSidedSender.sendOneSidedTransaction(
        params.recipient,
        params.amount,
        sendOptions
      );

      // Create pending transaction record for repository tracking
      const pendingTx: PendingOutboundTransaction = {
        id: transactionId,
        amount: params.amount,
        fee: params.feePerGram ? microTariFromFFI(microTariToFFI(params.feePerGram) * BigInt(300)) : microTariFromFFI(BigInt(Math.ceil(Number(params.amount) * 0.002))), // Higher estimated fee for one-sided
        status: TransactionStatus.Pending,
        direction: TransactionDirection.Outbound,
        message: params.message || '',
        timestamp: Date.now() as any,
        address: params.recipient,
        isOneSided: true,
        isCoinbase: false,
        pendingId: transactionId as any,
        cancellable: true
      };

      // Store in repository and state manager
      await this.repository.addTransaction(pendingTx);
      this.stateManager.trackTransaction(transactionId, TransactionStatus.Pending);

      // Emit events
      this.emit('transaction:created', pendingTx);
      this.emit('balance:changed', await this.getCurrentBalance(), 'one_sided_transaction_sent');

      return transactionId;

    } finally {
      this.operationSemaphore--;
    }
  }

  /**
   * Validate transaction parameters without sending
   * 
   * Performs all validation that would be done during sending
   * but without actually submitting the transaction.
   */
  @withErrorContext('validate_transaction', 'transaction_service')
  async validateTransaction(
    recipient: string | TariAddress,
    amount: MicroTari,
    options: StandardSendOptions = {}
  ): Promise<{
    isValid: boolean;
    recipientAddress: TariAddress;
    estimatedFee: MicroTari;
    totalCost: MicroTari;
    errors: string[];
  }> {
    this.ensureNotDisposed();
    
    return await this.standardSender.validateTransactionParams(
      recipient,
      amount,
      options
    );
  }

  /**
   * Validate one-sided transaction parameters without sending
   * 
   * Performs all validation that would be done during one-sided sending
   * including stealth addressing and script complexity checks.
   */
  @withErrorContext('validate_one_sided_transaction', 'transaction_service')
  async validateOneSidedTransaction(
    recipient: string | TariAddress,
    amount: MicroTari,
    options: OneSidedSendOptions = {}
  ): Promise<{
    isValid: boolean;
    recipientAddress: TariAddress;
    estimatedFee: MicroTari;
    totalCost: MicroTari;
    utxoConsumption: {
      inputCount: number;
      outputCount: number;
      scriptComplexity: number;
    };
    errors: string[];
    warnings: string[];
  }> {
    this.ensureNotDisposed();
    
    return await this.oneSidedSender.validateOneSidedTransaction(
      recipient,
      amount,
      options
    );
  }

  /**
   * Get transaction cost breakdown for a potential transaction
   */
  @withErrorContext('get_transaction_cost', 'transaction_service')
  async getTransactionCost(
    amount: MicroTari,
    feePerGram?: MicroTari
  ): Promise<{
    amount: MicroTari;
    estimatedFee: MicroTari;
    totalCost: MicroTari;
    feeBreakdown: {
      baseAmount: MicroTari;
      feePerGram: MicroTari;
      estimatedSizeGrams: number;
    };
  }> {
    this.ensureNotDisposed();
    
    return await this.standardSender.getTransactionCost(amount, feePerGram);
  }

  /**
   * Estimate fee for a transaction
   */
  @withErrorContext('estimate_fee', 'transaction_service')
  async estimateFee(amount: MicroTari, outputCount = 1): Promise<MicroTari> {
    this.ensureNotDisposed();
    
    return await this.feeEstimator.estimateFeePerGram(amount, outputCount);
  }

  /**
   * Cancel a pending outbound transaction
   */
  @withErrorContext('cancel_transaction', 'transaction_service')
  @withRetry({ maxAttempts: 2, baseDelay: 500 })
  async cancelTransaction(transactionId: TransactionId): Promise<void> {
    this.ensureNotDisposed();

    const transaction = await this.repository.getTransaction(transactionId);
    if (!transaction) {
      throw new WalletError(
        WalletErrorCode.TransactionNotFound,
        `Transaction ${transactionId} not found`,
        { severity: ErrorSeverity.Error }
      );
    }

    // Validate transaction can be cancelled
    if (transaction.status !== TransactionStatus.Pending) {
      throw new WalletError(
        WalletErrorCode.TransactionNotCancellable,
        `Transaction ${transactionId} is not in pending state`,
        { 
          severity: ErrorSeverity.Error,
          context: { currentStatus: transaction.status }
        }
      );
    }

    if (transaction.direction !== TransactionDirection.Outbound) {
      throw new WalletError(
        WalletErrorCode.TransactionNotCancellable,
        `Cannot cancel inbound transaction ${transactionId}`,
        { severity: ErrorSeverity.Error }
      );
    }

    const pendingTx = transaction as PendingOutboundTransaction;
    if (!pendingTx.cancellable) {
      throw new WalletError(
        WalletErrorCode.TransactionNotCancellable,
        `Transaction ${transactionId} is not cancellable`,
        { severity: ErrorSeverity.Error }
      );
    }

    // Call FFI to cancel transaction (placeholder - will be implemented when FFI function exists)
    // await this.ffi.wallet_cancel_pending_transaction(this.config.walletHandle, transactionId);

    // Update transaction status
    const cancelledTx: CancelledTransaction = {
      ...transaction,
      status: TransactionStatus.Cancelled,
      cancellationReason: 'user_cancelled' as any,
      cancelledAt: Date.now() as any
    };

    await this.repository.updateTransaction(cancelledTx);
    this.stateManager.updateTransactionStatus(transactionId, TransactionStatus.Cancelled);

    // Emit events
    this.emit('transaction:cancelled', cancelledTx);
    this.emit('balance:changed', await this.getCurrentBalance(), 'transaction_cancelled');
  }

  /**
   * Get all transactions with optional filtering
   */
  @withErrorContext('get_transactions', 'transaction_service')
  async getTransactions(
    filter?: TransactionFilter,
    options?: TransactionQueryOptions
  ): Promise<TransactionInfo[]> {
    this.ensureNotDisposed();

    return await this.repository.getTransactions(filter, options);
  }

  /**
   * Get a specific transaction by ID
   */
  @withErrorContext('get_transaction', 'transaction_service')
  async getTransaction(transactionId: TransactionId): Promise<TransactionInfo | null> {
    this.ensureNotDisposed();

    return await this.repository.getTransaction(transactionId);
  }

  /**
   * Get pending transactions (both inbound and outbound)
   */
  @withErrorContext('get_pending_transactions', 'transaction_service')
  async getPendingTransactions(): Promise<{
    inbound: PendingInboundTransaction[];
    outbound: PendingOutboundTransaction[];
  }> {
    this.ensureNotDisposed();

    const allPending = await this.repository.getTransactions({
      status: [TransactionStatus.Pending]
    });

    const inbound: PendingInboundTransaction[] = [];
    const outbound: PendingOutboundTransaction[] = [];

    for (const tx of allPending) {
      if (tx.direction === TransactionDirection.Inbound) {
        inbound.push(tx as PendingInboundTransaction);
      } else {
        outbound.push(tx as PendingOutboundTransaction);
      }
    }

    return { inbound, outbound };
  }

  /**
   * Get transaction statistics
   */
  @withErrorContext('get_transaction_statistics', 'transaction_service')
  async getTransactionStatistics(filter?: TransactionFilter): Promise<TransactionStatistics> {
    this.ensureNotDisposed();

    return await this.historyService.getTransactionStatistics(filter);
  }

  /**
   * Get transaction history with advanced filtering and pagination
   */
  @withErrorContext('get_transaction_history', 'transaction_service')
  async getTransactionHistory(
    filter?: TransactionFilter,
    options?: TransactionQueryOptions
  ) {
    this.ensureNotDisposed();
    
    return await this.historyService.getTransactionHistory(filter, options);
  }

  /**
   * Search transaction history with full-text search
   */
  @withErrorContext('search_transaction_history', 'transaction_service')
  async searchTransactionHistory(
    query: string,
    filter?: TransactionFilter,
    options?: TransactionQueryOptions
  ) {
    this.ensureNotDisposed();
    
    return await this.historyService.searchTransactionHistory(query, filter, options);
  }

  /**
   * Get recent transaction activity
   */
  @withErrorContext('get_recent_activity', 'transaction_service')
  async getRecentActivity(timeWindowMs?: number, limit?: number) {
    this.ensureNotDisposed();
    
    return await this.historyService.getRecentActivity(timeWindowMs, limit);
  }

  /**
   * Export transaction history
   */
  @withErrorContext('export_transaction_history', 'transaction_service')
  async exportTransactionHistory(
    filter?: TransactionFilter,
    format: 'csv' | 'json' | 'xlsx' = 'csv'
  ) {
    this.ensureNotDisposed();
    
    return await this.historyService.exportTransactionHistory(filter, format);
  }

  /**
   * Refresh pending transactions from the FFI
   */
  @withErrorContext('refresh_pending_transactions', 'transaction_service')
  async refreshPendingTransactions(): Promise<void> {
    this.ensureNotDisposed();

    try {
      // Get current pending transactions from FFI
      // Note: These FFI functions will need to be implemented
      // const [inboundFFI, outboundFFI] = await Promise.all([
      //   this.ffi.wallet_get_pending_inbound_transactions(this.config.walletHandle),
      //   this.ffi.wallet_get_pending_outbound_transactions(this.config.walletHandle)
      // ]);

      // For now, just refresh our internal state
      const pending = await this.getPendingTransactions();
      
      // Check for status updates (placeholder logic)
      for (const tx of [...pending.inbound, ...pending.outbound]) {
        // In real implementation, we'd compare with FFI results
        // and update status if changed
        this.stateManager.checkTransactionTimeout(tx.id);
      }

    } catch (error: unknown) {
      this.emit('transaction:error', 
        error instanceof WalletError ? error : new WalletError(
          WalletErrorCode.UnknownError,
          `Failed to refresh pending transactions: ${error}`,
          { severity: ErrorSeverity.Warning }
        )
      );
    }
  }

  /**
   * Start automatic refresh of pending transactions
   */
  private startPendingRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(() => {
      if (!this.isDisposed) {
        this.refreshPendingTransactions().catch(() => {
          // Error already handled in refreshPendingTransactions
        });
      }
    }, this.config.refreshIntervalMs);
  }

  /**
   * Stop automatic refresh
   */
  private stopPendingRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  /**
   * Handle transaction timeout
   */
  private async handleTransactionTimeout(transactionId: TransactionId): Promise<void> {
    try {
      const transaction = await this.repository.getTransaction(transactionId);
      if (transaction && transaction.status === TransactionStatus.Pending) {
        this.emit('transaction:error', 
          new WalletError(
            WalletErrorCode.TransactionTimeout,
            `Transaction ${transactionId} has timed out`,
            { 
              severity: ErrorSeverity.Warning,
              context: { transactionId: transactionId.toString() }
            }
          ),
          transactionId
        );
      }
    } catch (error: unknown) {
      // Ignore errors in timeout handling
    }
  }

  /**
   * Validate send transaction parameters
   */
  private validateSendParams(params: SendTransactionParams): TransactionValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];

    // Validate amount
    if (params.amount <= 0n) {
      errors.push({
        code: 'INVALID_AMOUNT',
        message: 'Transaction amount must be positive',
        field: 'amount'
      });
    }

    // Validate fee
    if (params.feePerGram <= 0n) {
      errors.push({
        code: 'INVALID_FEE',
        message: 'Fee per gram must be positive',
        field: 'feePerGram'
      });
    }

    // Check for dust amount
    if (params.amount > 0n && params.amount < 100n) {
      warnings.push({
        code: 'DUST_AMOUNT',
        message: 'Transaction amount is below dust threshold',
        field: 'amount',
        recommendation: 'Consider using at least 100 MicroTari'
      });
    }

    // Validate message length
    if (params.message && params.message.length > 512) {
      errors.push({
        code: 'MESSAGE_TOO_LONG',
        message: 'Transaction message exceeds maximum length of 512 characters',
        field: 'message'
      });
    }

    // Validate recipient address format
    if (!params.recipient || params.recipient.length === 0) {
      errors.push({
        code: 'INVALID_RECIPIENT',
        message: 'Recipient address is required',
        field: 'recipient'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Resolve address string to TariAddress
   */
  private async resolveAddress(address: TariAddressString): Promise<TariAddress> {
    try {
      return await TariAddress.fromString(address);
    } catch (error: unknown) {
      throw new WalletError(
        WalletErrorCode.InvalidAddress,
        `Invalid recipient address: ${address}`,
        { 
          severity: ErrorSeverity.Error,
          cause: error,
          context: { address }
        }
      );
    }
  }

  /**
   * Get current wallet balance
   */
  private async getCurrentBalance(): Promise<MicroTari> {
    // This would typically call the balance service
    // For now, return a placeholder
    return BigInt(0) as MicroTari;
  }

  /**
   * Calculate transaction statistics
   */
  private calculateStatistics(transactions: TransactionInfo[]): TransactionStatistics {
    // Implementation will use the TransactionUtils.calculateStatistics method
    return {
      total: transactions.length,
      byStatus: {} as any,
      byDirection: {} as any,
      totalSent: BigInt(0) as MicroTari,
      totalReceived: BigInt(0) as MicroTari,
      totalFees: BigInt(0) as MicroTari,
      averageAmount: BigInt(0) as MicroTari,
      averageFee: BigInt(0) as MicroTari,
      dateRange: {
        earliest: Date.now() as any,
        latest: Date.now() as any
      }
    };
  }

  /**
   * Check operation limit to prevent resource exhaustion
   */
  private async checkOperationLimit(): Promise<void> {
    if (this.operationSemaphore >= this.config.maxConcurrentOperations) {
      throw new WalletError(
        WalletErrorCode.ResourceExhausted,
        'Too many concurrent transaction operations',
        { 
          severity: ErrorSeverity.Error,
          context: { currentOperations: this.operationSemaphore, limit: this.config.maxConcurrentOperations }
        }
      );
    }
  }

  /**
   * Ensure service is not disposed
   */
  private ensureNotDisposed(): void {
    if (this.isDisposed) {
      throw new WalletError(
        WalletErrorCode.ResourceDisposed,
        'Transaction service has been disposed',
        { severity: ErrorSeverity.Error }
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
    this.stopPendingRefresh();
    
    await this.repository.dispose();
    await this.stateManager.dispose();
    await this.historyService.dispose();
    
    this.removeAllListeners();
  }

  /**
   * AsyncDisposable implementation
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }
}

/**
 * Default configuration for transaction service
 */
export const DEFAULT_TRANSACTION_SERVICE_CONFIG: Partial<TransactionServiceConfig> = {
  maxHistorySize: 10000,
  transactionTimeoutSeconds: 3600, // 1 hour
  autoRefreshPending: true,
  refreshIntervalMs: 30000, // 30 seconds
  maxConcurrentOperations: 10
};
