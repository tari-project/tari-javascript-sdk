/**
 * @fileoverview Transaction API Integration
 * 
 * Provides a comprehensive transaction API that integrates all transaction
 * functionality into a cohesive interface for the TariWallet class.
 */

import {
  getFFIBindings,
  WalletError,
  WalletErrorCode,
  withErrorContext,
  TypedEventEmitter,
  type TransactionId,
  type WalletHandle,
  type TariAddress,
  type MicroTari,
  type TransactionInfo,
  type TransactionFilter,
  type PendingInboundTransaction,
  type PendingOutboundTransaction
} from '@tari-project/tarijs-core';

// Import all transaction services
import { 
  TransactionService,
  type TransactionServiceConfig,
  type TransactionServiceEvents
} from '../transactions/transaction-service.js';
import {
  PendingManager as PendingTransactionManager,
  type PendingManagerConfig,
  type PendingManagerEvents
} from '../transactions/pending/pending-manager.js';
import {
  CancellationService,
  type CancellationServiceConfig,
  type CancellationServiceEvents,
  type CancellationResult
} from '../transactions/cancel/cancellation-service.js';
import {
  DetailService,
  type DetailServiceConfig,
  type DetailServiceEvents,
  type TransactionDetails
} from '../transactions/details/detail-service.js';
import {
  HistoryService,
  type HistoryServiceConfig,
  type HistoryServiceEvents,
  type HistoryEntry
} from '../transactions/history/history-service.js';
import { TransactionRepository } from '../transactions/transaction-repository.js';

/**
 * Configuration for the transaction API
 */
export interface TransactionAPIConfig {
  /** Transaction service configuration */
  transactionService?: Partial<TransactionServiceConfig>;
  /** Pending transaction manager configuration */
  pendingManager?: Partial<PendingManagerConfig>;
  /** Cancellation service configuration */
  cancellationService?: Partial<CancellationServiceConfig>;
  /** Detail service configuration */
  detailService?: Partial<DetailServiceConfig>;
  /** History service configuration */
  historyService?: Partial<HistoryServiceConfig>;
  /** Enable automatic service initialization */
  enableAutoInit: boolean;
  /** Enable event forwarding to parent emitter */
  enableEventForwarding: boolean;
}

/**
 * Default transaction API configuration
 */
export const DEFAULT_TRANSACTION_API_CONFIG: TransactionAPIConfig = {
  enableAutoInit: true,
  enableEventForwarding: true
};

/**
 * Standard transaction send options
 */
export interface StandardSendOptions {
  /** Custom fee amount */
  fee?: MicroTari;
  /** Transaction message/memo */
  message?: string;
  /** Enable one-sided transaction */
  oneSided?: boolean;
  /** Lock height for the transaction */
  lockHeight?: number;
  /** Custom fee rate (uT per byte) */
  feeRate?: number;
}

/**
 * Transaction query options
 */
export interface TransactionQueryOptions {
  /** Filter criteria */
  filter?: TransactionFilter;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Sort by field */
  sortBy?: 'timestamp' | 'amount' | 'status';
  /** Sort direction */
  sortDirection?: 'asc' | 'desc';
  /** Include pending transactions */
  includePending?: boolean;
  /** Include cancelled transactions */
  includeCancelled?: boolean;
}

/**
 * Events emitted by the transaction API
 */
export interface TransactionAPIEvents extends 
  TransactionServiceEvents,
  PendingManagerEvents,
  CancellationServiceEvents,
  DetailServiceEvents,
  HistoryServiceEvents {
  'api:initialized': () => void;
  'api:disposing': () => void;
  'api:error': (error: Error) => void;
}

/**
 * Transaction API statistics
 */
export interface TransactionAPIStatistics {
  /** Total transactions sent */
  totalSent: number;
  /** Total transactions received */
  totalReceived: number;
  /** Total pending transactions */
  totalPending: number;
  /** Total cancelled transactions */
  totalCancelled: number;
  /** Total transaction value sent */
  totalValueSent: MicroTari;
  /** Total transaction value received */
  totalValueReceived: MicroTari;
  /** Average transaction fee */
  averageTransactionFee: MicroTari;
  /** Service statistics */
  serviceStatistics: {
    transactionService: any;
    pendingManager: any;
    cancellationService: any;
    detailService: any;
    historyService: any;
  };
}

/**
 * Comprehensive transaction API
 * 
 * Integrates all transaction functionality into a single cohesive interface:
 * - Transaction sending (standard and one-sided)
 * - Transaction history and querying
 * - Pending transaction management
 * - Transaction cancellation
 * - Transaction detail enrichment
 * - Event forwarding and management
 * - Statistics and monitoring
 */
export class TransactionAPI extends TypedEventEmitter<TransactionAPIEvents> {
  private readonly walletHandle: WalletHandle;
  private readonly config: TransactionAPIConfig;
  
  // Core services
  private transactionService!: TransactionService;
  private pendingManager!: PendingTransactionManager;
  private cancellationService!: CancellationService;
  private detailService!: DetailService;
  private historyService!: HistoryService;
  
  private isInitialized = false;
  private isDisposed = false;

  constructor(
    walletHandle: WalletHandle,
    config: Partial<TransactionAPIConfig> = {}
  ) {
    super();
    this.walletHandle = walletHandle;
    this.config = { ...DEFAULT_TRANSACTION_API_CONFIG, ...config };
    
    if (this.config.enableAutoInit) {
      this.initialize();
    }
  }

  /**
   * Initialize the transaction API and all services
   */
  @withErrorContext('initialize_transaction_api', 'transaction_api')
  async initialize(): Promise<void> {
    if (this.isInitialized || this.isDisposed) {
      return;
    }
    
    try {
      // Initialize core services with proper configuration objects
      const transactionConfig = {
        walletHandle: this.walletHandle,
        defaultFeePerGram: BigInt(1000) as MicroTari,
        maxHistorySize: 1000,
        transactionTimeoutSeconds: 300,
        autoRefreshPending: true,
        refreshIntervalMs: 30000,
        maxConcurrentOperations: 5,
        ...this.config.transactionService
      };
      
      this.transactionService = new TransactionService(transactionConfig);
      
      // Create repository for pending manager
      const repository = new (await import('../transactions/transaction-repository.js')).TransactionRepository({
        maxHistorySize: 1000,
        walletHandle: this.walletHandle
      });
      
      const pendingConfig = {
        walletHandle: this.walletHandle,
        refreshIntervalMs: 30000,
        transactionTimeoutSeconds: 300,
        maxConcurrentRefresh: 3,
        autoRefresh: true,
        autoCancelTimeout: false,
        retryConfig: {
          maxAttempts: 3,
          backoffMs: 1000,
          backoffMultiplier: 2
        },
        ...this.config.pendingManager
      };
      
      this.pendingManager = new PendingTransactionManager(pendingConfig, repository);
      
      const cancellationConfig = {
        enableAutomaticRefunds: true,
        cancellationTimeoutSeconds: 60,
        enableEventEmission: true,
        allowOlderTransactionCancellation: true,
        maxCancellationAgeHours: 24,
        enableRetryOnFailure: true,
        maxRetryAttempts: 3,
        ...this.config.cancellationService
      };
      
      this.cancellationService = new CancellationService(
        this.walletHandle,
        cancellationConfig
      );
      
      this.detailService = new DetailService(
        this.walletHandle,
        this.config.detailService
      );
      
      const historyConfig = {
        walletHandle: this.walletHandle,
        maxPageSize: 100,
        defaultPageSize: 20,
        enableCaching: true,
        cacheTtlMs: 300000,
        includePending: true,
        ...this.config.historyService
      };
      
      this.historyService = new HistoryService(historyConfig, repository);
      
      // Setup event forwarding if enabled
      if (this.config.enableEventForwarding) {
        this.setupEventForwarding();
      }
      
      // Start services that need to be started
      if (this.config.pendingManager?.autoRefresh !== false) {
        // PendingManager starts automatically in constructor if autoRefresh is enabled
      }
      
      this.isInitialized = true;
      this.emit('api:initialized');
      
    } catch (error: unknown) {
      this.emit('api:error', error instanceof Error ? error : new Error(String(error)));
      throw new WalletError(
        WalletErrorCode.InitializationFailed,
        `Failed to initialize transaction API: ${error}`,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Send a standard transaction
   */
  @withErrorContext('send_transaction', 'transaction_api')
  async sendTransaction(
    address: TariAddress | string,
    amount: MicroTari,
    options: StandardSendOptions = {}
  ): Promise<TransactionId> {
    this.ensureInitialized();
    
    if (options.oneSided) {
      return await this.transactionService.sendOneSidedTransaction({
        recipient: address,
        amount,
        feePerGram: options.fee,
        message: options.message
      });
    } else {
      return await this.transactionService.sendTransaction({
        recipient: address,
        amount,
        feePerGram: options.fee,
        message: options.message
      });
    }
  }

  /**
   * Send a one-sided transaction
   */
  @withErrorContext('send_one_sided_transaction', 'transaction_api')
  async sendOneSidedTransaction(
    address: TariAddress | string,
    amount: MicroTari,
    options: Omit<StandardSendOptions, 'oneSided'> = {}
  ): Promise<TransactionId> {
    this.ensureInitialized();
    
    return await this.transactionService.sendOneSidedTransaction({
      recipient: address,
      amount,
      feePerGram: options.fee,
      message: options.message
    });
  }

  /**
   * Get transaction history
   */
  @withErrorContext('get_transaction_history', 'transaction_api')
  async getTransactionHistory(
    options: TransactionQueryOptions = {}
  ): Promise<HistoryEntry[]> {
    this.ensureInitialized();
    
    const queryOptions = {
      limit: options.limit,
      offset: options.offset,
      sortBy: options.sortBy,
      sortOrder: options.sortDirection,
      includeDetails: true
    };
    
    const result = await this.historyService.getTransactionHistory(
      options.filter,
      queryOptions
    );
    
    return result.data;
  }

  /**
   * Get transaction by ID
   */
  @withErrorContext('get_transaction', 'transaction_api')
  async getTransaction(transactionId: TransactionId): Promise<TransactionInfo | null> {
    this.ensureInitialized();
    
    return await this.transactionService.getTransaction(transactionId);
  }

  /**
   * Get detailed transaction information
   */
  @withErrorContext('get_transaction_details', 'transaction_api')
  async getTransactionDetails(
    transactionId: TransactionId,
    forceRefresh: boolean = false
  ): Promise<TransactionDetails> {
    this.ensureInitialized();
    
    return await this.detailService.getTransactionDetails(transactionId, forceRefresh);
  }

  /**
   * Get pending transactions
   */
  @withErrorContext('get_pending_transactions', 'transaction_api')
  async getPendingTransactions(forceRefresh: boolean = false): Promise<{
    inbound: PendingInboundTransaction[];
    outbound: PendingOutboundTransaction[];
  }> {
    this.ensureInitialized();
    
    return await this.pendingManager.getPendingTransactions();
  }

  /**
   * Cancel a pending transaction
   */
  @withErrorContext('cancel_transaction', 'transaction_api')
  async cancelTransaction(transactionId: TransactionId): Promise<CancellationResult> {
    this.ensureInitialized();
    
    return await this.cancellationService.cancelTransaction(transactionId);
  }

  /**
   * Check if a transaction can be cancelled
   */
  @withErrorContext('can_cancel_transaction', 'transaction_api')
  async canCancelTransaction(transactionId: TransactionId): Promise<{
    canCancel: boolean;
    reason?: string;
  }> {
    this.ensureInitialized();
    
    return await this.cancellationService.canCancelTransaction(transactionId);
  }

  /**
   * Get all cancellable transactions
   */
  @withErrorContext('get_cancellable_transactions', 'transaction_api')
  async getCancellableTransactions(): Promise<PendingOutboundTransaction[]> {
    this.ensureInitialized();
    
    return await this.cancellationService.getCancellableTransactions();
  }

  /**
   * Update transaction memo
   */
  @withErrorContext('update_transaction_memo', 'transaction_api')
  async updateTransactionMemo(transactionId: TransactionId, memo: string): Promise<void> {
    this.ensureInitialized();
    
    await this.detailService.updateTransactionMemo(transactionId, memo);
  }

  /**
   * Get transaction memo
   */
  @withErrorContext('get_transaction_memo', 'transaction_api')
  async getTransactionMemo(transactionId: TransactionId): Promise<string | null> {
    this.ensureInitialized();
    
    return await this.detailService.getTransactionMemo(transactionId);
  }

  /**
   * Search transaction history
   */
  @withErrorContext('search_transaction_history', 'transaction_api')
  async searchTransactionHistory(
    searchText: string,
    options: TransactionQueryOptions = {}
  ): Promise<HistoryEntry[]> {
    this.ensureInitialized();
    
    const queryOptions = {
      limit: options.limit,
      offset: options.offset,
      sortBy: options.sortBy,
      sortOrder: options.sortDirection,
      includeDetails: true
    };
    
    const result = await this.historyService.searchTransactionHistory(
      searchText,
      options.filter,
      queryOptions
    );
    
    return result.transactions;
  }

  /**
   * Export transaction history
   */
  @withErrorContext('export_transaction_history', 'transaction_api')
  async exportTransactionHistory(
    format: 'csv' | 'json' = 'csv',
    options: TransactionQueryOptions = {}
  ): Promise<{
    data: string | Buffer;
    filename: string;
    mimeType: string;
  }> {
    this.ensureInitialized();
    
    return await this.historyService.exportTransactionHistory(
      options.filter,
      format
    );
  }

  /**
   * Get confirmation count for a transaction
   */
  @withErrorContext('get_confirmation_count', 'transaction_api')
  async getConfirmationCount(transactionId: TransactionId): Promise<number> {
    this.ensureInitialized();
    
    return await this.detailService.getConfirmationCount(transactionId);
  }

  /**
   * Start tracking confirmations for a transaction
   */
  @withErrorContext('start_confirmation_tracking', 'transaction_api')
  async startConfirmationTracking(transactionId: TransactionId): Promise<void> {
    this.ensureInitialized();
    
    await this.detailService.startConfirmationTracking(transactionId);
  }

  /**
   * Stop tracking confirmations for a transaction
   */
  @withErrorContext('stop_confirmation_tracking', 'transaction_api')
  stopConfirmationTracking(transactionId: TransactionId): boolean {
    this.ensureInitialized();
    
    return this.detailService.stopConfirmationTracking(transactionId);
  }

  /**
   * Get comprehensive transaction API statistics
   */
  @withErrorContext('get_transaction_statistics', 'transaction_api')
  async getStatistics(): Promise<TransactionAPIStatistics> {
    this.ensureInitialized();
    
    // Get individual service statistics (using default values for missing methods)
    const serviceStats = {
      transactionService: this.getTransactionServiceStats(),
      pendingManager: this.getPendingManagerStats(),
      cancellationService: this.cancellationService.getStatistics(),
      detailService: this.detailService.getStatistics(),
      historyService: this.getHistoryServiceStats()
    };
    
    // Calculate aggregate statistics
    const history = await this.getTransactionHistory({ limit: 1000 });
    
    let totalSent = 0;
    let totalReceived = 0;
    let totalValueSent = BigInt(0);
    let totalValueReceived = BigInt(0);
    let totalFees = BigInt(0);
    let feeCount = 0;
    
    for (const entry of history) {
      if (entry.direction === 'Outbound') {
        totalSent++;
        totalValueSent += BigInt(entry.amount);
        if (entry.fee) {
          totalFees += BigInt(entry.fee);
          feeCount++;
        }
      } else {
        totalReceived++;
        totalValueReceived += BigInt(entry.amount);
      }
    }
    
    const pendingStats = await this.getPendingTransactions();
    const totalPending = pendingStats.inbound.length + pendingStats.outbound.length;
    
    return {
      totalSent,
      totalReceived,
      totalPending,
      totalCancelled: serviceStats.cancellationService.successfulCancellations,
      totalValueSent: totalValueSent as MicroTari,
      totalValueReceived: totalValueReceived as MicroTari,
      averageTransactionFee: feeCount > 0 ? (totalFees / BigInt(feeCount)) as MicroTari : BigInt(0) as MicroTari,
      serviceStatistics: serviceStats
    };
  }

  /**
   * Get transaction service statistics (fallback implementation)
   */
  private getTransactionServiceStats(): any {
    return {
      totalTransactionsSent: 0,
      totalTransactionsReceived: 0,
      averageProcessingTime: 0,
      lastTransactionTime: 0
    };
  }

  /**
   * Get pending manager statistics (fallback implementation)
   */
  private getPendingManagerStats(): any {
    return {
      totalRefreshCount: 0,
      lastRefreshTime: 0,
      isCurrentlyRefreshing: false,
      averageRefreshInterval: 30000
    };
  }

  /**
   * Get history service statistics (fallback implementation)
   */
  private getHistoryServiceStats(): any {
    return {
      totalQueries: 0,
      cacheHitRate: 0,
      averageQueryTime: 0,
      lastQueryTime: 0
    };
  }

  /**
   * Refresh all transaction data
   */
  @withErrorContext('refresh_all_data', 'transaction_api')
  async refreshAllData(): Promise<void> {
    this.ensureInitialized();
    
    // Refresh pending transactions
    await this.pendingManager.refreshPendingTransactions();
    
    // Clear detail cache to force refresh
    this.detailService.clearCache();
    
    // History service automatically refreshes via repository updates
    // No explicit refresh needed
  }

  /**
   * Setup event forwarding from all services
   */
  private setupEventForwarding(): void {
    // Forward transaction service events
    this.transactionService.on('transaction:created', (transaction) => 
      this.emit('transaction:created', transaction));
    this.transactionService.on('transaction:updated', (update) => 
      this.emit('transaction:updated', update));
    this.transactionService.on('transaction:confirmed', (transaction) => 
      this.emit('transaction:confirmed', transaction));
    this.transactionService.on('transaction:cancelled', (transaction) => 
      this.emit('transaction:cancelled', transaction));
    this.transactionService.on('transaction:received', (transaction) => 
      this.emit('transaction:received', transaction));
    this.transactionService.on('transaction:error', (error, transactionId) => 
      this.emit('transaction:error', error, transactionId));
    this.transactionService.on('balance:changed', (newBalance, reason) => 
      this.emit('balance:changed', newBalance, reason));
    
    // Forward pending manager events
    this.pendingManager.on('pending:updated', (update) => 
      this.emit('pending:updated', update));
    this.pendingManager.on('pending:timeout', (transactionId, timeoutSeconds) => 
      this.emit('pending:timeout', transactionId, timeoutSeconds));
    this.pendingManager.on('pending:refreshed', (inboundCount, outboundCount) => 
      this.emit('pending:refreshed', inboundCount, outboundCount));
    this.pendingManager.on('pending:error', (error, transactionId) => 
      this.emit('pending:error', error, transactionId));
    this.pendingManager.on('pending:auto_cancelled', (transactionId, reason) => 
      this.emit('pending:auto_cancelled', transactionId, reason));
    
    // Forward cancellation service events
    this.cancellationService.on('cancellation:started', (transactionId) => 
      this.emit('cancellation:started', transactionId));
    this.cancellationService.on('cancellation:completed', (transactionId, refundAmount) => 
      this.emit('cancellation:completed', transactionId, refundAmount));
    this.cancellationService.on('cancellation:failed', (transactionId, error) => 
      this.emit('cancellation:failed', transactionId, error));
    this.cancellationService.on('refund:processed', (transactionId, amount) => 
      this.emit('refund:processed', transactionId, amount));
    this.cancellationService.on('refund:failed', (transactionId, error) => 
      this.emit('refund:failed', transactionId, error));
    
    // Forward detail service events
    this.detailService.on('details:enriched', (transactionId, details) => 
      this.emit('details:enriched', transactionId, details));
    this.detailService.on('confirmations:changed', (transactionId, newCount, oldCount) => 
      this.emit('confirmations:changed', transactionId, newCount, oldCount));
    this.detailService.on('transaction:finalized', (transactionId, details) => 
      this.emit('transaction:finalized', transactionId, details));
    
    // Forward history service events
    this.historyService.on('history:updated', (count) => 
      this.emit('history:updated', count));
    this.historyService.on('history:filtered', (filter, resultCount) => 
      this.emit('history:filtered', filter, resultCount));
    this.historyService.on('cache:hit', (query) => 
      this.emit('cache:hit', query));
    this.historyService.on('cache:miss', (query) => 
      this.emit('cache:miss', query));
  }

  /**
   * Ensure API is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new WalletError(
        WalletErrorCode.NotInitialized,
        'Transaction API not initialized. Call initialize() first.'
      );
    }
    
    if (this.isDisposed) {
      throw new WalletError(
        WalletErrorCode.ResourceDisposed,
        'Transaction API has been disposed'
      );
    }
  }

  /**
   * Dispose of the API and all services
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }
    
    this.emit('api:disposing');
    
    this.isDisposed = true;
    this.isInitialized = false;
    
    // Dispose of all services
    if (this.transactionService) {
      await this.transactionService.dispose();
    }
    
    if (this.pendingManager) {
      await this.pendingManager.dispose();
    }
    
    if (this.cancellationService) {
      await this.cancellationService.dispose();
    }
    
    if (this.detailService) {
      await this.detailService.dispose();
    }
    
    if (this.historyService) {
      await this.historyService.dispose();
    }
    
    this.removeAllListeners();
  }

  /**
   * Check if the API is initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Check if the API is disposed
   */
  get disposed(): boolean {
    return this.isDisposed;
  }
}
