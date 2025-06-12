/**
 * @fileoverview Transaction API Integration
 * 
 * Provides a comprehensive transaction API that integrates all transaction
 * functionality into a cohesive interface for the TariWallet class.
 */

import { EventEmitter } from 'node:events';
import {
  getFFIBindings,
  WalletError,
  WalletErrorCode,
  withErrorContext,
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
  PendingTransactionManager,
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
export class TransactionAPI extends EventEmitter<TransactionAPIEvents> {
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
      // Initialize core services
      this.transactionService = new TransactionService(
        this.walletHandle,
        this.config.transactionService
      );
      
      this.pendingManager = new PendingTransactionManager(
        this.walletHandle,
        this.config.pendingManager
      );
      
      this.cancellationService = new CancellationService(
        this.walletHandle,
        this.config.cancellationService
      );
      
      this.detailService = new DetailService(
        this.walletHandle,
        this.config.detailService
      );
      
      this.historyService = new HistoryService(
        this.walletHandle,
        this.config.historyService
      );
      
      // Setup event forwarding if enabled
      if (this.config.enableEventForwarding) {
        this.setupEventForwarding();
      }
      
      // Start services that need to be started
      await this.pendingManager.start();
      
      this.isInitialized = true;
      this.emit('api:initialized');
      
    } catch (error) {
      this.emit('api:error', error instanceof Error ? error : new Error(String(error)));
      throw new WalletError(
        WalletErrorCode.InitializationFailed,
        `Failed to initialize transaction API: ${error}`,
        { cause: error }
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
      return await this.transactionService.sendOneSidedTransaction(
        address,
        amount,
        options.fee,
        options.message,
        options.lockHeight
      );
    } else {
      return await this.transactionService.sendTransaction(
        address,
        amount,
        options.fee,
        options.message,
        options.lockHeight
      );
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
    
    return await this.transactionService.sendOneSidedTransaction(
      address,
      amount,
      options.fee,
      options.message,
      options.lockHeight
    );
  }

  /**
   * Get transaction history
   */
  @withErrorContext('get_transaction_history', 'transaction_api')
  async getTransactionHistory(
    options: TransactionQueryOptions = {}
  ): Promise<HistoryEntry[]> {
    this.ensureInitialized();
    
    return await this.historyService.getTransactionHistory(
      options.filter,
      options.limit,
      options.offset,
      options.sortBy,
      options.sortDirection
    );
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
    
    return await this.pendingManager.getPendingTransactions(forceRefresh);
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
    
    return await this.historyService.searchTransactionHistory(
      searchText,
      options.filter,
      options.limit,
      options.offset
    );
  }

  /**
   * Export transaction history
   */
  @withErrorContext('export_transaction_history', 'transaction_api')
  async exportTransactionHistory(
    format: 'csv' | 'json' = 'csv',
    options: TransactionQueryOptions = {}
  ): Promise<string> {
    this.ensureInitialized();
    
    return await this.historyService.exportTransactionHistory(
      format,
      options.filter,
      options.limit,
      options.offset
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
    
    // Get individual service statistics
    const serviceStats = {
      transactionService: this.transactionService.getStatistics(),
      pendingManager: this.pendingManager.getStatistics(),
      cancellationService: this.cancellationService.getStatistics(),
      detailService: this.detailService.getStatistics(),
      historyService: this.historyService.getStatistics()
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
      if (entry.transaction.direction === 'Outbound') {
        totalSent++;
        totalValueSent += BigInt(entry.transaction.amount);
        if (entry.transaction.fee) {
          totalFees += BigInt(entry.transaction.fee);
          feeCount++;
        }
      } else {
        totalReceived++;
        totalValueReceived += BigInt(entry.transaction.amount);
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
   * Refresh all transaction data
   */
  @withErrorContext('refresh_all_data', 'transaction_api')
  async refreshAllData(): Promise<void> {
    this.ensureInitialized();
    
    // Refresh pending transactions
    await this.pendingManager.refreshPendingTransactions();
    
    // Clear detail cache to force refresh
    this.detailService.clearCache();
    
    // Refresh history cache
    await this.historyService.refreshCache();
  }

  /**
   * Setup event forwarding from all services
   */
  private setupEventForwarding(): void {
    // Forward transaction service events
    this.transactionService.on('transaction:sent', (...args) => 
      this.emit('transaction:sent', ...args));
    this.transactionService.on('transaction:received', (...args) => 
      this.emit('transaction:received', ...args));
    this.transactionService.on('transaction:confirmed', (...args) => 
      this.emit('transaction:confirmed', ...args));
    
    // Forward pending manager events
    this.pendingManager.on('pending:updated', (...args) => 
      this.emit('pending:updated', ...args));
    this.pendingManager.on('pending:timeout', (...args) => 
      this.emit('pending:timeout', ...args));
    
    // Forward cancellation service events
    this.cancellationService.on('cancellation:completed', (...args) => 
      this.emit('cancellation:completed', ...args));
    this.cancellationService.on('cancellation:failed', (...args) => 
      this.emit('cancellation:failed', ...args));
    
    // Forward detail service events
    this.detailService.on('details:enriched', (...args) => 
      this.emit('details:enriched', ...args));
    this.detailService.on('confirmations:changed', (...args) => 
      this.emit('confirmations:changed', ...args));
    this.detailService.on('transaction:finalized', (...args) => 
      this.emit('transaction:finalized', ...args));
    
    // Forward history service events
    this.historyService.on('history:updated', (...args) => 
      this.emit('history:updated', ...args));
    this.historyService.on('history:exported', (...args) => 
      this.emit('history:exported', ...args));
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
