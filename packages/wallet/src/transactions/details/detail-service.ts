/**
 * @fileoverview Transaction Detail Enrichment Service
 * 
 * Provides comprehensive transaction detail retrieval with confirmation tracking,
 * memo management, and rich metadata for complete transaction information.
 */

import { EventEmitter } from 'node:events';
import {
  getFFIBindings,
  WalletError,
  WalletErrorCode,
  withErrorContext,
  withRetry,
  RetryConfigs,
  type TransactionId,
  type WalletHandle,
  type TransactionInfo,
  type UnixTimestamp,
  type BlockHeight,
  type MicroTari
} from '@tari-project/tarijs-core';
import { ConfirmationTracker } from './confirmation-tracker.js';
import { MemoService } from './memo-service.js';

/**
 * Configuration for the detail service
 */
export interface DetailServiceConfig {
  /** Enable automatic confirmation tracking */
  enableConfirmationTracking: boolean;
  /** Confirmation tracking refresh interval (seconds) */
  confirmationRefreshIntervalSeconds: number;
  /** Enable memo management */
  enableMemoManagement: boolean;
  /** Enable rich metadata retrieval */
  enableRichMetadata: boolean;
  /** Cache enriched transaction details */
  enableDetailCaching: boolean;
  /** Cache TTL for transaction details (seconds) */
  detailCacheTtlSeconds: number;
  /** Maximum number of cached transaction details */
  maxCachedDetails: number;
  /** Enable event emission for detail updates */
  enableEventEmission: boolean;
}

/**
 * Default detail service configuration
 */
export const DEFAULT_DETAIL_SERVICE_CONFIG: DetailServiceConfig = {
  enableConfirmationTracking: true,
  confirmationRefreshIntervalSeconds: 30,
  enableMemoManagement: true,
  enableRichMetadata: true,
  enableDetailCaching: true,
  detailCacheTtlSeconds: 300, // 5 minutes
  maxCachedDetails: 100,
  enableEventEmission: true
};

/**
 * Transaction input details
 */
export interface TransactionInput {
  /** Input commitment */
  commitment: string;
  /** Input amount */
  amount: MicroTari;
  /** Script offset for this input */
  scriptOffset?: string;
  /** Features of the input */
  features?: {
    flags: number;
    maturity: BlockHeight;
    metadata?: string;
  };
  /** Source transaction hash */
  sourceTransactionId?: TransactionId;
  /** Input index in source transaction */
  sourceOutputIndex?: number;
}

/**
 * Transaction output details
 */
export interface TransactionOutput {
  /** Output commitment */
  commitment: string;
  /** Output amount */
  amount: MicroTari;
  /** Range proof for the output */
  rangeProof: string;
  /** Output script */
  script: string;
  /** Output features */
  features: {
    flags: number;
    maturity: BlockHeight;
    metadata?: string;
  };
  /** Sender offset public key */
  senderOffsetPublicKey?: string;
  /** Metadata signature */
  metadataSignature?: string;
}

/**
 * Transaction kernel details
 */
export interface TransactionKernel {
  /** Kernel excess */
  excess: string;
  /** Kernel excess signature */
  excessSignature: string;
  /** Kernel fee */
  fee: MicroTari;
  /** Lock height */
  lockHeight: BlockHeight;
  /** Kernel features */
  features: {
    kernelType: string;
    burnCommitment?: string;
  };
  /** Hash of the kernel */
  hash: string;
}

/**
 * Fee breakdown information
 */
export interface FeeBreakdown {
  /** Base transaction fee */
  baseFee: MicroTari;
  /** Fee per input */
  inputFee: MicroTari;
  /** Fee per output */
  outputFee: MicroTari;
  /** Fee per kernel */
  kernelFee: MicroTari;
  /** Total calculated fee */
  totalFee: MicroTari;
  /** Fee rate used (uT per byte) */
  feeRate: number;
  /** Transaction size in bytes */
  transactionSize: number;
}

/**
 * Block information for a transaction
 */
export interface BlockInfo {
  /** Block height */
  height: BlockHeight;
  /** Block hash */
  hash: string;
  /** Block timestamp */
  timestamp: UnixTimestamp;
  /** Previous block hash */
  previousBlockHash: string;
  /** Merkle root */
  merkleRoot: string;
  /** Total accumulated difficulty */
  totalAccumulatedDifficulty: string;
  /** Miner reward */
  reward: MicroTari;
  /** Total kernels in block */
  kernelCount: number;
  /** Total outputs in block */
  outputCount: number;
}

/**
 * Comprehensive transaction details
 */
export interface TransactionDetails {
  /** Basic transaction information */
  transaction: TransactionInfo;
  /** Transaction inputs */
  inputs: TransactionInput[];
  /** Transaction outputs */
  outputs: TransactionOutput[];
  /** Transaction kernels */
  kernels: TransactionKernel[];
  /** Fee breakdown */
  feeBreakdown: FeeBreakdown;
  /** Block information (if confirmed) */
  blockInfo?: BlockInfo;
  /** Current confirmation count */
  confirmations: number;
  /** Required confirmations for finality */
  requiredConfirmations: number;
  /** Whether transaction is considered final */
  isFinal: boolean;
  /** Transaction memo/message */
  memo?: string;
  /** Additional metadata */
  metadata: {
    /** Transaction size in bytes */
    size: number;
    /** Transaction weight */
    weight: number;
    /** Virtual size */
    virtualSize: number;
    /** Transaction version */
    version: number;
    /** Time transaction was first seen */
    firstSeenTime?: UnixTimestamp;
    /** Time transaction was confirmed */
    confirmedTime?: UnixTimestamp;
    /** Network the transaction was broadcast on */
    network: string;
  };
  /** Enrichment timestamp */
  enrichedAt: UnixTimestamp;
  /** Last updated timestamp */
  lastUpdated: UnixTimestamp;
}

/**
 * Events emitted by the detail service
 */
export interface DetailServiceEvents {
  'details:enriched': (transactionId: TransactionId, details: TransactionDetails) => void;
  'details:updated': (transactionId: TransactionId, details: TransactionDetails) => void;
  'confirmations:changed': (transactionId: TransactionId, newCount: number, oldCount: number) => void;
  'transaction:finalized': (transactionId: TransactionId, details: TransactionDetails) => void;
  'memo:updated': (transactionId: TransactionId, memo: string) => void;
}

/**
 * Statistics for detail enrichment operations
 */
export interface DetailStatistics {
  /** Total transactions enriched */
  totalEnriched: number;
  /** Number of transactions currently being tracked */
  currentlyTracked: number;
  /** Average enrichment time (ms) */
  averageEnrichmentTime: number;
  /** Cache hit rate */
  cacheHitRate: number;
  /** Total confirmation updates processed */
  confirmationUpdates: number;
  /** Number of finalized transactions */
  finalizedTransactions: number;
  /** Last enrichment timestamp */
  lastEnrichmentTime?: UnixTimestamp;
}

/**
 * Cached transaction detail entry
 */
interface CachedDetailEntry {
  details: TransactionDetails;
  cachedAt: UnixTimestamp;
  hitCount: number;
}

/**
 * Transaction detail enrichment service
 * 
 * Provides comprehensive transaction information including:
 * - Rich metadata (inputs, outputs, kernels)
 * - Real-time confirmation tracking
 * - Fee breakdown analysis
 * - Block information
 * - Memo management
 * - Intelligent caching
 */
export class DetailService extends EventEmitter<DetailServiceEvents> {
  private readonly walletHandle: WalletHandle;
  private readonly config: DetailServiceConfig;
  private readonly confirmationTracker: ConfirmationTracker;
  private readonly memoService: MemoService;
  private readonly ffiBindings = getFFIBindings();
  
  private readonly detailCache = new Map<TransactionId, CachedDetailEntry>();
  private readonly enrichmentTimes: number[] = [];
  private statistics: DetailStatistics = {
    totalEnriched: 0,
    currentlyTracked: 0,
    averageEnrichmentTime: 0,
    cacheHitRate: 0,
    confirmationUpdates: 0,
    finalizedTransactions: 0
  };
  
  private isDisposed = false;

  constructor(
    walletHandle: WalletHandle,
    config: Partial<DetailServiceConfig> = {}
  ) {
    super();
    this.walletHandle = walletHandle;
    this.config = { ...DEFAULT_DETAIL_SERVICE_CONFIG, ...config };
    
    this.confirmationTracker = new ConfirmationTracker(walletHandle, this.config);
    this.memoService = new MemoService(walletHandle, this.config);
    
    this.validateConfig();
    this.setupEventHandlers();
  }

  /**
   * Get enriched transaction details
   */
  @withErrorContext('get_transaction_details', 'detail_service')
  @withRetry(() => RetryConfigs.query())
  async getTransactionDetails(
    transactionId: TransactionId,
    forceRefresh: boolean = false
  ): Promise<TransactionDetails> {
    this.ensureNotDisposed();
    
    const startTime = Date.now();
    
    // Check cache first (unless forced refresh)
    if (!forceRefresh && this.config.enableDetailCaching) {
      const cached = this.getCachedDetails(transactionId);
      if (cached) {
        cached.hitCount++;
        this.updateCacheHitRate();
        return cached.details;
      }
    }
    
    try {
      // Get basic transaction info
      const basicTransaction = await this.getBasicTransactionInfo(transactionId);
      
      // Enrich with detailed information
      const enrichedDetails = await this.enrichTransactionDetails(basicTransaction);
      
      // Cache the results
      if (this.config.enableDetailCaching) {
        this.cacheDetails(transactionId, enrichedDetails);
      }
      
      // Start tracking confirmations if enabled
      if (this.config.enableConfirmationTracking && !enrichedDetails.isFinal) {
        this.confirmationTracker.startTracking(transactionId);
      }
      
      // Update statistics
      this.updateStatistics(startTime);
      
      // Emit enrichment event
      if (this.config.enableEventEmission) {
        this.emit('details:enriched', transactionId, enrichedDetails);
      }
      
      return enrichedDetails;
      
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.TransactionDetailRetrievalFailed,
        `Failed to get transaction details for ${transactionId}: ${error}`,
        { originalError: error, transactionId }
      );
    }
  }

  /**
   * Update memo for a transaction
   */
  @withErrorContext('update_transaction_memo', 'detail_service')
  async updateTransactionMemo(transactionId: TransactionId, memo: string): Promise<void> {
    this.ensureNotDisposed();
    
    if (!this.config.enableMemoManagement) {
      throw new WalletError(
        WalletErrorCode.FeatureNotEnabled,
        'Memo management is not enabled'
      );
    }
    
    await this.memoService.setMemo(transactionId, memo);
    
    // Update cached details if present
    const cached = this.detailCache.get(transactionId);
    if (cached) {
      cached.details.memo = memo;
      cached.details.lastUpdated = Date.now() as UnixTimestamp;
    }
    
    // Emit memo update event
    if (this.config.enableEventEmission) {
      this.emit('memo:updated', transactionId, memo);
    }
  }

  /**
   * Get transaction memo
   */
  @withErrorContext('get_transaction_memo', 'detail_service')
  async getTransactionMemo(transactionId: TransactionId): Promise<string | null> {
    this.ensureNotDisposed();
    
    if (!this.config.enableMemoManagement) {
      return null;
    }
    
    return await this.memoService.getMemo(transactionId);
  }

  /**
   * Get confirmation count for a transaction
   */
  @withErrorContext('get_confirmation_count', 'detail_service')
  async getConfirmationCount(transactionId: TransactionId): Promise<number> {
    this.ensureNotDisposed();
    
    if (!this.config.enableConfirmationTracking) {
      throw new WalletError(
        WalletErrorCode.FeatureNotEnabled,
        'Confirmation tracking is not enabled'
      );
    }
    
    return await this.confirmationTracker.getConfirmationCount(transactionId);
  }

  /**
   * Start tracking confirmations for a transaction
   */
  @withErrorContext('start_confirmation_tracking', 'detail_service')
  async startConfirmationTracking(transactionId: TransactionId): Promise<void> {
    this.ensureNotDisposed();
    
    if (!this.config.enableConfirmationTracking) {
      throw new WalletError(
        WalletErrorCode.FeatureNotEnabled,
        'Confirmation tracking is not enabled'
      );
    }
    
    this.confirmationTracker.startTracking(transactionId);
  }

  /**
   * Stop tracking confirmations for a transaction
   */
  @withErrorContext('stop_confirmation_tracking', 'detail_service')
  stopConfirmationTracking(transactionId: TransactionId): boolean {
    this.ensureNotDisposed();
    
    if (!this.config.enableConfirmationTracking) {
      return false;
    }
    
    return this.confirmationTracker.stopTracking(transactionId);
  }

  /**
   * Get enrichment statistics
   */
  @withErrorContext('get_detail_statistics', 'detail_service')
  getStatistics(): DetailStatistics {
    this.ensureNotDisposed();
    
    const confirmationStats = this.config.enableConfirmationTracking ?
      this.confirmationTracker.getStatistics() : null;
    
    return {
      ...this.statistics,
      currentlyTracked: confirmationStats?.trackedTransactions || 0,
      confirmationUpdates: confirmationStats?.totalUpdates || 0,
      finalizedTransactions: confirmationStats?.finalizedTransactions || 0
    };
  }

  /**
   * Clear detail cache
   */
  @withErrorContext('clear_detail_cache', 'detail_service')
  clearCache(): number {
    this.ensureNotDisposed();
    
    const count = this.detailCache.size;
    this.detailCache.clear();
    return count;
  }

  /**
   * Get basic transaction information from FFI
   */
  private async getBasicTransactionInfo(transactionId: TransactionId): Promise<TransactionInfo> {
    try {
      const transactionJson = await this.ffiBindings.wallet_get_transaction(
        this.walletHandle.handle,
        transactionId
      );
      
      if (!transactionJson) {
        throw new WalletError(
          WalletErrorCode.TransactionNotFound,
          `Transaction ${transactionId} not found`
        );
      }
      
      return JSON.parse(transactionJson);
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.FFIOperationFailed,
        `Failed to get basic transaction info: ${error}`,
        { originalError: error, transactionId }
      );
    }
  }

  /**
   * Enrich transaction with detailed information
   */
  private async enrichTransactionDetails(transaction: TransactionInfo): Promise<TransactionDetails> {
    const enrichedAt = Date.now() as UnixTimestamp;
    
    // Get detailed components if enabled
    let inputs: TransactionInput[] = [];
    let outputs: TransactionOutput[] = [];
    let kernels: TransactionKernel[] = [];
    let feeBreakdown: FeeBreakdown | null = null;
    let blockInfo: BlockInfo | undefined;
    
    if (this.config.enableRichMetadata) {
      // Get transaction inputs, outputs, and kernels
      [inputs, outputs, kernels] = await Promise.all([
        this.getTransactionInputs(transaction.txId),
        this.getTransactionOutputs(transaction.txId),
        this.getTransactionKernels(transaction.txId)
      ]);
      
      // Calculate fee breakdown
      feeBreakdown = this.calculateFeeBreakdown(transaction, inputs, outputs, kernels);
      
      // Get block info if transaction is confirmed
      if (transaction.status === 'Confirmed' && transaction.blockHeight) {
        blockInfo = await this.getBlockInfo(transaction.blockHeight);
      }
    }
    
    // Get confirmation count
    const confirmations = this.config.enableConfirmationTracking ?
      await this.confirmationTracker.getConfirmationCount(transaction.txId) : 0;
    
    // Get memo if enabled
    const memo = this.config.enableMemoManagement ?
      await this.memoService.getMemo(transaction.txId) : undefined;
    
    // Calculate metadata
    const metadata = this.calculateTransactionMetadata(transaction, inputs, outputs, kernels);
    
    const details: TransactionDetails = {
      transaction,
      inputs,
      outputs,
      kernels,
      feeBreakdown: feeBreakdown || {
        baseFee: BigInt(0) as MicroTari,
        inputFee: BigInt(0) as MicroTari,
        outputFee: BigInt(0) as MicroTari,
        kernelFee: BigInt(0) as MicroTari,
        totalFee: BigInt(transaction.fee || 0) as MicroTari,
        feeRate: 0,
        transactionSize: 0
      },
      blockInfo,
      confirmations,
      requiredConfirmations: 3, // Configurable based on network
      isFinal: confirmations >= 3,
      memo: memo || undefined,
      metadata,
      enrichedAt,
      lastUpdated: enrichedAt
    };
    
    return details;
  }

  /**
   * Get transaction inputs from FFI
   */
  private async getTransactionInputs(transactionId: TransactionId): Promise<TransactionInput[]> {
    try {
      const inputsJson = await this.ffiBindings.wallet_get_transaction_inputs?.(
        this.walletHandle.handle,
        transactionId
      );
      
      return inputsJson ? JSON.parse(inputsJson) : [];
    } catch (error) {
      // Return empty array if inputs not available
      return [];
    }
  }

  /**
   * Get transaction outputs from FFI
   */
  private async getTransactionOutputs(transactionId: TransactionId): Promise<TransactionOutput[]> {
    try {
      const outputsJson = await this.ffiBindings.wallet_get_transaction_outputs?.(
        this.walletHandle.handle,
        transactionId
      );
      
      return outputsJson ? JSON.parse(outputsJson) : [];
    } catch (error) {
      // Return empty array if outputs not available
      return [];
    }
  }

  /**
   * Get transaction kernels from FFI
   */
  private async getTransactionKernels(transactionId: TransactionId): Promise<TransactionKernel[]> {
    try {
      const kernelsJson = await this.ffiBindings.wallet_get_transaction_kernels?.(
        this.walletHandle.handle,
        transactionId
      );
      
      return kernelsJson ? JSON.parse(kernelsJson) : [];
    } catch (error) {
      // Return empty array if kernels not available
      return [];
    }
  }

  /**
   * Get block information from FFI
   */
  private async getBlockInfo(blockHeight: BlockHeight): Promise<BlockInfo | undefined> {
    try {
      const blockJson = await this.ffiBindings.wallet_get_block_info?.(
        this.walletHandle.handle,
        blockHeight
      );
      
      return blockJson ? JSON.parse(blockJson) : undefined;
    } catch (error) {
      // Return undefined if block info not available
      return undefined;
    }
  }

  /**
   * Calculate fee breakdown for a transaction
   */
  private calculateFeeBreakdown(
    transaction: TransactionInfo,
    inputs: TransactionInput[],
    outputs: TransactionOutput[],
    kernels: TransactionKernel[]
  ): FeeBreakdown {
    // Base fee calculations (simplified)
    const baseFee = BigInt(1000) as MicroTari; // 1000 uT base fee
    const inputFee = BigInt(inputs.length * 50) as MicroTari; // 50 uT per input
    const outputFee = BigInt(outputs.length * 100) as MicroTari; // 100 uT per output
    const kernelFee = BigInt(kernels.length * 200) as MicroTari; // 200 uT per kernel
    
    const calculatedTotal = BigInt(baseFee) + BigInt(inputFee) + BigInt(outputFee) + BigInt(kernelFee);
    const actualFee = BigInt(transaction.fee || 0);
    
    // Estimate transaction size (simplified)
    const inputSize = inputs.length * 32; // 32 bytes per input (simplified)
    const outputSize = outputs.length * 64; // 64 bytes per output (simplified)
    const kernelSize = kernels.length * 96; // 96 bytes per kernel (simplified)
    const transactionSize = 100 + inputSize + outputSize + kernelSize; // 100 bytes overhead
    
    const feeRate = transactionSize > 0 ? Number(actualFee) / transactionSize : 0;
    
    return {
      baseFee,
      inputFee,
      outputFee,
      kernelFee,
      totalFee: actualFee as MicroTari,
      feeRate,
      transactionSize
    };
  }

  /**
   * Calculate transaction metadata
   */
  private calculateTransactionMetadata(
    transaction: TransactionInfo,
    inputs: TransactionInput[],
    outputs: TransactionOutput[],
    kernels: TransactionKernel[]
  ): TransactionDetails['metadata'] {
    const inputSize = inputs.length * 32;
    const outputSize = outputs.length * 64;
    const kernelSize = kernels.length * 96;
    const size = 100 + inputSize + outputSize + kernelSize;
    
    return {
      size,
      weight: size, // Simplified weight calculation
      virtualSize: size,
      version: 1,
      firstSeenTime: transaction.timestamp,
      confirmedTime: transaction.status === 'Confirmed' ? transaction.timestamp : undefined,
      network: 'testnet' // This would come from wallet configuration
    };
  }

  /**
   * Get cached transaction details
   */
  private getCachedDetails(transactionId: TransactionId): CachedDetailEntry | null {
    const cached = this.detailCache.get(transactionId);
    if (!cached) {
      return null;
    }
    
    // Check if cache entry is still valid
    const now = Date.now();
    const cacheAge = (now - cached.cachedAt) / 1000;
    
    if (cacheAge > this.config.detailCacheTtlSeconds) {
      this.detailCache.delete(transactionId);
      return null;
    }
    
    return cached;
  }

  /**
   * Cache transaction details
   */
  private cacheDetails(transactionId: TransactionId, details: TransactionDetails): void {
    // Remove oldest entries if cache is full
    if (this.detailCache.size >= this.config.maxCachedDetails) {
      const oldestEntry = Array.from(this.detailCache.entries())
        .sort(([, a], [, b]) => a.cachedAt - b.cachedAt)[0];
      
      if (oldestEntry) {
        this.detailCache.delete(oldestEntry[0]);
      }
    }
    
    this.detailCache.set(transactionId, {
      details,
      cachedAt: Date.now() as UnixTimestamp,
      hitCount: 0
    });
  }

  /**
   * Update cache hit rate
   */
  private updateCacheHitRate(): void {
    const totalRequests = this.statistics.totalEnriched;
    const cacheHits = Array.from(this.detailCache.values())
      .reduce((sum, entry) => sum + entry.hitCount, 0);
    
    this.statistics.cacheHitRate = totalRequests > 0 ? cacheHits / totalRequests : 0;
  }

  /**
   * Update enrichment statistics
   */
  private updateStatistics(startTime: number): void {
    const enrichmentTime = Date.now() - startTime;
    this.enrichmentTimes.push(enrichmentTime);
    
    // Keep only the last 100 times for rolling average
    if (this.enrichmentTimes.length > 100) {
      this.enrichmentTimes.splice(0, this.enrichmentTimes.length - 100);
    }
    
    this.statistics.totalEnriched++;
    this.statistics.averageEnrichmentTime = 
      this.enrichmentTimes.reduce((sum, time) => sum + time, 0) / this.enrichmentTimes.length;
    this.statistics.lastEnrichmentTime = Date.now() as UnixTimestamp;
  }

  /**
   * Setup event handlers for sub-services
   */
  private setupEventHandlers(): void {
    if (this.config.enableConfirmationTracking) {
      this.confirmationTracker.on('confirmations:changed', (txId, newCount, oldCount) => {
        // Update cached details if present
        const cached = this.detailCache.get(txId);
        if (cached) {
          cached.details.confirmations = newCount;
          cached.details.isFinal = newCount >= cached.details.requiredConfirmations;
          cached.details.lastUpdated = Date.now() as UnixTimestamp;
          
          if (this.config.enableEventEmission) {
            this.emit('details:updated', txId, cached.details);
          }
          
          if (cached.details.isFinal && oldCount < cached.details.requiredConfirmations) {
            this.emit('transaction:finalized', txId, cached.details);
          }
        }
        
        if (this.config.enableEventEmission) {
          this.emit('confirmations:changed', txId, newCount, oldCount);
        }
      });
    }
  }

  /**
   * Validate configuration parameters
   */
  private validateConfig(): void {
    if (this.config.confirmationRefreshIntervalSeconds <= 0) {
      throw new WalletError(
        WalletErrorCode.InvalidConfiguration,
        'Confirmation refresh interval must be positive'
      );
    }
    
    if (this.config.detailCacheTtlSeconds <= 0) {
      throw new WalletError(
        WalletErrorCode.InvalidConfiguration,
        'Detail cache TTL must be positive'
      );
    }
    
    if (this.config.maxCachedDetails <= 0) {
      throw new WalletError(
        WalletErrorCode.InvalidConfiguration,
        'Max cached details must be positive'
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
        'Detail service has been disposed'
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
    
    // Clean up sub-services
    await this.confirmationTracker.dispose();
    await this.memoService.dispose();
    
    // Clear cache
    this.detailCache.clear();
    
    this.removeAllListeners();
  }
}
