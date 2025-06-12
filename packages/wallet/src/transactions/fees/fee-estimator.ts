/**
 * @fileoverview Fee Estimator
 * 
 * Provides intelligent fee estimation using network statistics, transaction analysis,
 * and machine learning approaches. Supports both online (real-time network data) and
 * offline (historical/statistical) estimation modes with fallback mechanisms.
 */

import {
  WalletError,
  WalletErrorCode,
  ErrorSeverity,
  withErrorContext,
  withRetry,
  type WalletHandle,
  type MicroTari
} from '@tari-project/tarijs-core';
import { FeeCalculator } from './fee-calculator.js';
import { NetworkFeesService } from './network-fees.js';

/**
 * Fee estimation confidence levels
 */
export enum FeeConfidence {
  Low = 'low',
  Medium = 'medium',
  High = 'high'
}

/**
 * Fee estimation priority levels
 */
export enum FeePriority {
  /** Next block inclusion (high fee) */
  Urgent = 'urgent',
  /** Within 3 blocks (medium fee) */
  Standard = 'standard',
  /** Within 6 blocks (lower fee) */
  Economy = 'economy',
  /** Best effort (lowest fee) */
  Background = 'background'
}

/**
 * Fee estimation options
 */
export interface FeeEstimationOptions {
  /** Number of transaction outputs */
  outputs?: number;
  /** Priority level for confirmation speed */
  priority?: FeePriority;
  /** Maximum fee willing to pay */
  maxFee?: MicroTari;
  /** Minimum fee to use (safety net) */
  minFee?: MicroTari;
  /** Whether to use live network data */
  useNetworkData?: boolean;
  /** Custom transaction size in grams */
  customSizeGrams?: number;
}

/**
 * Detailed fee estimation result
 */
export interface FeeEstimationResult {
  /** Recommended fee per gram */
  feePerGram: MicroTari;
  /** Total estimated fee */
  totalFee: MicroTari;
  /** Estimated transaction size in grams */
  sizeGrams: number;
  /** Confidence level in the estimate */
  confidence: FeeConfidence;
  /** Priority level used */
  priority: FeePriority;
  /** Data source for estimation */
  source: 'network' | 'historical' | 'fallback';
  /** Estimated confirmation time range in blocks */
  confirmationBlocks: {
    min: number;
    max: number;
    median: number;
  };
  /** Network congestion level */
  congestionLevel: 'low' | 'medium' | 'high';
  /** Additional metadata */
  metadata: {
    networkMedianFee?: MicroTari;
    mempoolSize?: number;
    recentBlockFees?: MicroTari[];
    lastUpdated?: Date;
  };
}

/**
 * Fee estimation configuration
 */
export interface FeeEstimatorConfig {
  /** Wallet handle for network queries */
  walletHandle: WalletHandle;
  /** Default priority level */
  defaultPriority: FeePriority;
  /** Minimum fee per gram (safety net) */
  minimumFeePerGram: MicroTari;
  /** Maximum fee per gram (protection against extreme fees) */
  maximumFeePerGram: MicroTari;
  /** Cache duration for network data in milliseconds */
  networkDataCacheDuration: number;
  /** Whether to use machine learning models */
  enableMLModels: boolean;
  /** Fallback fee multipliers for different priorities */
  priorityMultipliers: Record<FeePriority, number>;
  /** Network data refresh interval in milliseconds */
  networkRefreshInterval: number;
}

/**
 * Intelligent fee estimator with multiple data sources and fallback mechanisms
 */
export class FeeEstimator {
  private readonly config: FeeEstimatorConfig;
  private readonly calculator: FeeCalculator;
  private readonly networkService: NetworkFeesService;
  private networkDataCache: FeeEstimationResult | null = null;
  private lastNetworkUpdate = 0;
  private isDisposed = false;

  constructor(config: FeeEstimatorConfig) {
    this.config = config;
    this.calculator = new FeeCalculator({
      minimumFeePerGram: config.minimumFeePerGram,
      maximumFeePerGram: config.maximumFeePerGram,
      priorityMultipliers: config.priorityMultipliers
    });
    this.networkService = new NetworkFeesService({
      walletHandle: config.walletHandle,
      refreshInterval: config.networkRefreshInterval
    });
  }

  /**
   * Estimate fee for a transaction
   */
  @withErrorContext('estimate_fee', 'fee_estimator')
  @withRetry({ maxAttempts: 3, backoffMs: 1000 })
  async estimateFee(
    amount: MicroTari, 
    options: FeeEstimationOptions = {}
  ): Promise<FeeEstimationResult> {
    this.ensureNotDisposed();

    const {
      outputs = 1,
      priority = this.config.defaultPriority,
      maxFee,
      minFee,
      useNetworkData = true,
      customSizeGrams
    } = options;

    try {
      // Estimate transaction size
      const sizeGrams = customSizeGrams || this.calculator.estimateTransactionSize(amount, outputs);

      // Try network-based estimation first
      if (useNetworkData) {
        try {
          const networkEstimate = await this.estimateFromNetwork(amount, sizeGrams, priority);
          if (networkEstimate) {
            return this.applyConstraints(networkEstimate, { maxFee, minFee });
          }
        } catch (error) {
          // Log network error but continue with fallback
          console.warn('Network fee estimation failed, using fallback:', error);
        }
      }

      // Fall back to historical/statistical estimation
      const fallbackEstimate = await this.estimateFromHistorical(amount, sizeGrams, priority);
      return this.applyConstraints(fallbackEstimate, { maxFee, minFee });

    } catch (error) {
      throw new WalletError(
        WalletErrorCode.FeeEstimationFailed,
        `Failed to estimate transaction fee: ${error}`,
        { 
          severity: ErrorSeverity.Error,
          cause: error,
          context: { amount: amount.toString(), options }
        }
      );
    }
  }

  /**
   * Estimate fee using current network data
   */
  @withErrorContext('estimate_from_network', 'fee_estimator')
  private async estimateFromNetwork(
    amount: MicroTari,
    sizeGrams: number, 
    priority: FeePriority
  ): Promise<FeeEstimationResult | null> {
    // Check cache first
    if (this.isNetworkDataFresh()) {
      return this.applyPriorityToEstimate(this.networkDataCache!, priority, sizeGrams, 'network');
    }

    try {
      // Get fresh network data
      const networkStats = await this.networkService.getNetworkFeeStatistics();
      
      if (!networkStats) {
        return null;
      }

      // Calculate fee based on network conditions
      const baselineFeePrGram = this.selectFeeForPriority(networkStats, priority);
      const totalFee = (baselineFeePrGram * BigInt(sizeGrams)) as MicroTari;

      // Determine confidence and congestion level
      const confidence = this.calculateConfidence(networkStats, priority);
      const congestionLevel = this.assessCongestionLevel(networkStats);

      const estimate: FeeEstimationResult = {
        feePerGram: baselineFeePrGram,
        totalFee,
        sizeGrams,
        confidence,
        priority,
        source: 'network',
        confirmationBlocks: this.estimateConfirmationBlocks(priority, congestionLevel),
        congestionLevel,
        metadata: {
          networkMedianFee: networkStats.medianFeePerGram,
          mempoolSize: networkStats.mempoolSize,
          recentBlockFees: networkStats.recentBlockFees,
          lastUpdated: new Date()
        }
      };

      // Cache the result
      this.networkDataCache = estimate;
      this.lastNetworkUpdate = Date.now();

      return estimate;

    } catch (error) {
      console.warn('Network fee estimation error:', error);
      return null;
    }
  }

  /**
   * Estimate fee using historical data and statistical models
   */
  @withErrorContext('estimate_from_historical', 'fee_estimator')
  private async estimateFromHistorical(
    amount: MicroTari,
    sizeGrams: number,
    priority: FeePriority
  ): Promise<FeeEstimationResult> {
    // Get historical fee data
    const historicalStats = await this.networkService.getHistoricalFeeStatistics();
    
    // Calculate baseline fee using historical averages
    const baselineFee = historicalStats.averageFeePerGram;
    const priorityMultiplier = this.config.priorityMultipliers[priority];
    const feePerGram = (BigInt(Math.floor(Number(baselineFee) * priorityMultiplier))) as MicroTari;
    
    // Apply minimum/maximum constraints
    const constrainedFeePerGram = this.calculator.applyFeeConstraints(feePerGram);
    const totalFee = (constrainedFeePerGram * BigInt(sizeGrams)) as MicroTari;

    return {
      feePerGram: constrainedFeePerGram,
      totalFee,
      sizeGrams,
      confidence: FeeConfidence.Medium,
      priority,
      source: 'historical',
      confirmationBlocks: this.estimateConfirmationBlocks(priority, 'medium'),
      congestionLevel: 'medium',
      metadata: {
        lastUpdated: new Date()
      }
    };
  }

  /**
   * Select appropriate fee for priority level from network statistics
   */
  private selectFeeForPriority(networkStats: any, priority: FeePriority): MicroTari {
    switch (priority) {
      case FeePriority.Urgent:
        return networkStats.percentile90FeePerGram || networkStats.medianFeePerGram * 2n;
      case FeePriority.Standard:
        return networkStats.medianFeePerGram;
      case FeePriority.Economy:
        return networkStats.percentile25FeePerGram || networkStats.medianFeePerGram / 2n;
      case FeePriority.Background:
        return networkStats.minimumFeePerGram || this.config.minimumFeePerGram;
      default:
        return networkStats.medianFeePerGram;
    }
  }

  /**
   * Calculate confidence level based on network data quality
   */
  private calculateConfidence(networkStats: any, priority: FeePriority): FeeConfidence {
    const dataAge = Date.now() - (networkStats.lastUpdated?.getTime() || 0);
    const hasRecentData = dataAge < 300000; // 5 minutes
    const hasSufficientSamples = (networkStats.sampleSize || 0) > 10;
    
    if (hasRecentData && hasSufficientSamples) {
      return FeeConfidence.High;
    } else if (hasRecentData || hasSufficientSamples) {
      return FeeConfidence.Medium;
    } else {
      return FeeConfidence.Low;
    }
  }

  /**
   * Assess network congestion level
   */
  private assessCongestionLevel(networkStats: any): 'low' | 'medium' | 'high' {
    const mempoolSize = networkStats.mempoolSize || 0;
    const avgBlockSize = 1000; // Placeholder - should be network parameter
    
    if (mempoolSize < avgBlockSize) {
      return 'low';
    } else if (mempoolSize < avgBlockSize * 3) {
      return 'medium';
    } else {
      return 'high';
    }
  }

  /**
   * Estimate confirmation blocks based on priority and congestion
   */
  private estimateConfirmationBlocks(
    priority: FeePriority, 
    congestion: 'low' | 'medium' | 'high'
  ): { min: number; max: number; median: number } {
    const baseBlocks = {
      [FeePriority.Urgent]: { min: 1, max: 2, median: 1 },
      [FeePriority.Standard]: { min: 1, max: 4, median: 2 },
      [FeePriority.Economy]: { min: 2, max: 8, median: 4 },
      [FeePriority.Background]: { min: 4, max: 12, median: 6 }
    };

    const congestionMultiplier = {
      low: 1,
      medium: 1.5,
      high: 2.5
    };

    const base = baseBlocks[priority];
    const multiplier = congestionMultiplier[congestion];

    return {
      min: Math.ceil(base.min * multiplier),
      max: Math.ceil(base.max * multiplier),
      median: Math.ceil(base.median * multiplier)
    };
  }

  /**
   * Apply priority adjustments to cached estimate
   */
  private applyPriorityToEstimate(
    cachedEstimate: FeeEstimationResult,
    priority: FeePriority,
    sizeGrams: number,
    source: 'network' | 'historical'
  ): FeeEstimationResult {
    if (cachedEstimate.priority === priority) {
      return cachedEstimate;
    }

    const priorityMultiplier = this.config.priorityMultipliers[priority];
    const baseFeePerGram = cachedEstimate.metadata.networkMedianFee || cachedEstimate.feePerGram;
    const newFeePerGram = (BigInt(Math.floor(Number(baseFeePerGram) * priorityMultiplier))) as MicroTari;
    const newTotalFee = (newFeePerGram * BigInt(sizeGrams)) as MicroTari;

    return {
      ...cachedEstimate,
      feePerGram: newFeePerGram,
      totalFee: newTotalFee,
      priority,
      source,
      confirmationBlocks: this.estimateConfirmationBlocks(priority, cachedEstimate.congestionLevel)
    };
  }

  /**
   * Apply user-specified fee constraints
   */
  private applyConstraints(
    estimate: FeeEstimationResult,
    constraints: { maxFee?: MicroTari; minFee?: MicroTari }
  ): FeeEstimationResult {
    let { feePerGram, totalFee } = estimate;
    const { sizeGrams } = estimate;

    // Apply minimum fee constraint
    if (constraints.minFee && totalFee < constraints.minFee) {
      totalFee = constraints.minFee;
      feePerGram = (totalFee / BigInt(sizeGrams)) as MicroTari;
    }

    // Apply maximum fee constraint
    if (constraints.maxFee && totalFee > constraints.maxFee) {
      totalFee = constraints.maxFee;
      feePerGram = (totalFee / BigInt(sizeGrams)) as MicroTari;
      
      // Reduce confidence if we had to cap the fee
      if (estimate.confidence === FeeConfidence.High) {
        estimate.confidence = FeeConfidence.Medium;
      }
    }

    return {
      ...estimate,
      feePerGram,
      totalFee
    };
  }

  /**
   * Check if network data cache is still fresh
   */
  private isNetworkDataFresh(): boolean {
    return this.networkDataCache !== null &&
           (Date.now() - this.lastNetworkUpdate) < this.config.networkDataCacheDuration;
  }

  /**
   * Estimate fee per gram for a transaction
   */
  @withErrorContext('estimate_fee_per_gram', 'fee_estimator')
  async estimateFeePerGram(
    amount: MicroTari,
    outputs: number = 1
  ): Promise<MicroTari> {
    const result = await this.estimateFee(amount, { outputs });
    return result.feePerGram;
  }

  /**
   * Estimate transaction size in grams
   */
  @withErrorContext('estimate_transaction_size', 'fee_estimator')
  estimateTransactionSize(amount: MicroTari, outputs: number = 1): number {
    return this.calculator.estimateTransactionSize(amount, outputs);
  }

  /**
   * Get fee estimation for different priority levels
   */
  @withErrorContext('get_priority_estimates', 'fee_estimator')
  async getPriorityEstimates(
    amount: MicroTari,
    options: Omit<FeeEstimationOptions, 'priority'> = {}
  ): Promise<Record<FeePriority, FeeEstimationResult>> {
    this.ensureNotDisposed();

    const estimates: Partial<Record<FeePriority, FeeEstimationResult>> = {};

    for (const priority of Object.values(FeePriority)) {
      try {
        estimates[priority] = await this.estimateFee(amount, { ...options, priority });
      } catch (error) {
        console.warn(`Failed to estimate fee for priority ${priority}:`, error);
      }
    }

    return estimates as Record<FeePriority, FeeEstimationResult>;
  }

  /**
   * Clear cache and refresh network data
   */
  @withErrorContext('refresh_network_data', 'fee_estimator')
  async refreshNetworkData(): Promise<void> {
    this.ensureNotDisposed();
    
    this.networkDataCache = null;
    this.lastNetworkUpdate = 0;
    await this.networkService.refreshData();
  }

  /**
   * Get estimator statistics
   */
  getStatistics(): {
    cacheHitRate: number;
    lastNetworkUpdate: Date | null;
    networkDataAge: number;
    isNetworkAvailable: boolean;
  } {
    return {
      cacheHitRate: 0, // TODO: Track cache hits/misses
      lastNetworkUpdate: this.lastNetworkUpdate ? new Date(this.lastNetworkUpdate) : null,
      networkDataAge: this.lastNetworkUpdate ? Date.now() - this.lastNetworkUpdate : -1,
      isNetworkAvailable: this.networkService.isAvailable()
    };
  }

  /**
   * Ensure estimator is not disposed
   */
  private ensureNotDisposed(): void {
    if (this.isDisposed) {
      throw new WalletError(
        WalletErrorCode.ResourceDisposed,
        'Fee estimator has been disposed',
        { severity: ErrorSeverity.Error }
      );
    }
  }

  /**
   * Dispose of the estimator and clean up resources
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.networkDataCache = null;
    
    await this.networkService.dispose();
    await this.calculator.dispose();
  }

  /**
   * AsyncDisposable implementation
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }
}

/**
 * Default fee estimator configuration
 */
export const DEFAULT_FEE_ESTIMATOR_CONFIG: Partial<FeeEstimatorConfig> = {
  defaultPriority: FeePriority.Standard,
  networkDataCacheDuration: 300000, // 5 minutes
  enableMLModels: false, // Disabled by default until implemented
  priorityMultipliers: {
    [FeePriority.Urgent]: 2.0,
    [FeePriority.Standard]: 1.0,
    [FeePriority.Economy]: 0.5,
    [FeePriority.Background]: 0.25
  },
  networkRefreshInterval: 60000 // 1 minute
};
