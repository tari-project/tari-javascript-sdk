/**
 * @fileoverview Transaction Build Options
 * 
 * Defines configuration options for transaction building including validation
 * settings, fee preferences, and build behavior customizations.
 */

import type { MicroTari } from '@tari-project/tarijs-core';
import { FeePriority } from '../fees/index.js';

/**
 * Transaction build options
 */
export interface TransactionBuildOptions {
  /** Whether to use live network data for fee estimation */
  useNetworkData: boolean;
  
  /** Whether to validate recipient address */
  validateRecipient: boolean;
  
  /** Whether to check balance before building */
  checkBalance: boolean;
  
  /** Whether to warn about dust amounts */
  warnOnDust: boolean;
  
  /** Whether to warn about high fees */
  warnOnHighFees: boolean;
  
  /** Whether to optimize for confirmation speed */
  optimizeForSpeed: boolean;
  
  /** Whether to optimize for low fees */
  optimizeForCost: boolean;
  
  /** Maximum number of inputs to use */
  maxInputs?: number;
  
  /** Preferred UTXO selection strategy */
  utxoSelectionStrategy: UtxoSelectionStrategy;
  
  /** Whether to create change output */
  createChange: boolean;
  
  /** Minimum change amount to create change output */
  minChangeAmount: MicroTari;
  
  /** Whether to consolidate small UTXOs */
  consolidateUtxos: boolean;
  
  /** Custom fee calculation options */
  feeCalculation: FeeCalculationOptions;
  
  /** Privacy settings */
  privacy: PrivacyOptions;
  
  /** Retry settings */
  retry: RetryOptions;
  
  /** Timeout settings */
  timeout: TimeoutOptions;
}

/**
 * UTXO selection strategies
 */
export enum UtxoSelectionStrategy {
  /** Use smallest UTXOs first (consolidation-friendly) */
  SmallestFirst = 'smallest_first',
  
  /** Use largest UTXOs first (privacy-friendly) */
  LargestFirst = 'largest_first',
  
  /** Use oldest UTXOs first (age-based) */
  OldestFirst = 'oldest_first',
  
  /** Use newest UTXOs first */
  NewestFirst = 'newest_first',
  
  /** Random selection for privacy */
  Random = 'random',
  
  /** Optimal selection for minimizing fees */
  Optimal = 'optimal'
}

/**
 * Fee calculation options
 */
export interface FeeCalculationOptions {
  /** Base fee calculation method */
  method: FeeCalculationMethod;
  
  /** Fee bump percentage for urgent transactions */
  urgentBumpPercent: number;
  
  /** Fee reduction percentage for economy transactions */
  economyReductionPercent: number;
  
  /** Whether to round fees to nice numbers */
  roundFees: boolean;
  
  /** Minimum fee increment for adjustments */
  minFeeIncrement: MicroTari;
  
  /** Maximum fee to pay regardless of priority */
  absoluteMaxFee?: MicroTari;
}

/**
 * Fee calculation methods
 */
export enum FeeCalculationMethod {
  /** Use network median fee */
  NetworkMedian = 'network_median',
  
  /** Use network percentile (configurable) */
  NetworkPercentile = 'network_percentile',
  
  /** Use fixed fee per gram */
  Fixed = 'fixed',
  
  /** Use dynamic calculation based on congestion */
  Dynamic = 'dynamic',
  
  /** Use machine learning model (if available) */
  MachineLearning = 'ml'
}

/**
 * Privacy options
 */
export interface PrivacyOptions {
  /** Whether to randomize transaction timing */
  randomizeDelay: boolean;
  
  /** Maximum delay in seconds for randomization */
  maxDelaySeconds: number;
  
  /** Whether to use decoy UTXOs */
  useDecoys: boolean;
  
  /** Number of decoy UTXOs to include */
  decoyCount: number;
  
  /** Whether to split large amounts into multiple outputs */
  splitLargeAmounts: boolean;
  
  /** Threshold for splitting amounts */
  splitThreshold: MicroTari;
  
  /** Whether to randomize change output position */
  randomizeChangePosition: boolean;
}

/**
 * Retry options
 */
export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  
  /** Base delay between retries in milliseconds */
  baseDelayMs: number;
  
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: number;
  
  /** Maximum delay between retries in milliseconds */
  maxDelayMs: number;
  
  /** Whether to retry on network errors */
  retryOnNetworkError: boolean;
  
  /** Whether to retry on validation errors */
  retryOnValidationError: boolean;
  
  /** Whether to increase fee on retry */
  increaseFeeOnRetry: boolean;
  
  /** Fee increase percentage per retry */
  feeIncreasePercent: number;
}

/**
 * Timeout options
 */
export interface TimeoutOptions {
  /** Total transaction build timeout in milliseconds */
  buildTimeoutMs: number;
  
  /** Network data fetch timeout in milliseconds */
  networkTimeoutMs: number;
  
  /** Address validation timeout in milliseconds */
  validationTimeoutMs: number;
  
  /** Fee estimation timeout in milliseconds */
  feeEstimationTimeoutMs: number;
  
  /** UTXO selection timeout in milliseconds */
  utxoSelectionTimeoutMs: number;
}

/**
 * Build options factory
 */
export class BuildOptions {
  /**
   * Create default build options
   */
  static default(): TransactionBuildOptions {
    return {
      useNetworkData: true,
      validateRecipient: true,
      checkBalance: true,
      warnOnDust: true,
      warnOnHighFees: true,
      optimizeForSpeed: false,
      optimizeForCost: false,
      maxInputs: 100,
      utxoSelectionStrategy: UtxoSelectionStrategy.Optimal,
      createChange: true,
      minChangeAmount: BigInt(100) as MicroTari,
      consolidateUtxos: false,
      feeCalculation: this.defaultFeeCalculation(),
      privacy: this.defaultPrivacy(),
      retry: this.defaultRetry(),
      timeout: this.defaultTimeout()
    };
  }

  /**
   * Create options optimized for speed
   */
  static forSpeed(): TransactionBuildOptions {
    return {
      ...this.default(),
      optimizeForSpeed: true,
      optimizeForCost: false,
      useNetworkData: true,
      feeCalculation: {
        ...this.defaultFeeCalculation(),
        method: FeeCalculationMethod.NetworkPercentile,
        urgentBumpPercent: 50
      }
    };
  }

  /**
   * Create options optimized for cost
   */
  static forCost(): TransactionBuildOptions {
    return {
      ...this.default(),
      optimizeForSpeed: false,
      optimizeForCost: true,
      utxoSelectionStrategy: UtxoSelectionStrategy.SmallestFirst,
      consolidateUtxos: true,
      feeCalculation: {
        ...this.defaultFeeCalculation(),
        method: FeeCalculationMethod.NetworkMedian,
        economyReductionPercent: 25
      }
    };
  }

  /**
   * Create options optimized for privacy
   */
  static forPrivacy(): TransactionBuildOptions {
    return {
      ...this.default(),
      utxoSelectionStrategy: UtxoSelectionStrategy.Random,
      privacy: {
        randomizeDelay: true,
        maxDelaySeconds: 300,
        useDecoys: false, // Not implemented yet
        decoyCount: 0,
        splitLargeAmounts: true,
        splitThreshold: BigInt(1000000) as MicroTari, // 1 Tari
        randomizeChangePosition: true
      }
    };
  }

  /**
   * Create options for one-sided transactions
   */
  static forOneSided(): TransactionBuildOptions {
    return {
      ...this.default(),
      createChange: false, // One-sided transactions typically don't create change
      utxoSelectionStrategy: UtxoSelectionStrategy.LargestFirst,
      privacy: {
        ...this.defaultPrivacy(),
        randomizeDelay: false // No need for delay in one-sided
      }
    };
  }

  /**
   * Create options for testing/development
   */
  static forTesting(): TransactionBuildOptions {
    return {
      ...this.default(),
      useNetworkData: false,
      validateRecipient: false,
      checkBalance: false,
      warnOnDust: false,
      warnOnHighFees: false,
      timeout: {
        buildTimeoutMs: 5000,
        networkTimeoutMs: 1000,
        validationTimeoutMs: 1000,
        feeEstimationTimeoutMs: 1000,
        utxoSelectionTimeoutMs: 1000
      }
    };
  }

  /**
   * Default fee calculation options
   */
  private static defaultFeeCalculation(): FeeCalculationOptions {
    return {
      method: FeeCalculationMethod.NetworkMedian,
      urgentBumpPercent: 100,
      economyReductionPercent: 50,
      roundFees: true,
      minFeeIncrement: BigInt(1) as MicroTari
    };
  }

  /**
   * Default privacy options
   */
  private static defaultPrivacy(): PrivacyOptions {
    return {
      randomizeDelay: false,
      maxDelaySeconds: 60,
      useDecoys: false,
      decoyCount: 0,
      splitLargeAmounts: false,
      splitThreshold: BigInt(10000000) as MicroTari, // 10 Tari
      randomizeChangePosition: false
    };
  }

  /**
   * Default retry options
   */
  private static defaultRetry(): RetryOptions {
    return {
      maxAttempts: 3,
      baseDelayMs: 1000,
      backoffMultiplier: 2,
      maxDelayMs: 10000,
      retryOnNetworkError: true,
      retryOnValidationError: false,
      increaseFeeOnRetry: false,
      feeIncreasePercent: 10
    };
  }

  /**
   * Default timeout options
   */
  private static defaultTimeout(): TimeoutOptions {
    return {
      buildTimeoutMs: 30000,
      networkTimeoutMs: 10000,
      validationTimeoutMs: 5000,
      feeEstimationTimeoutMs: 10000,
      utxoSelectionTimeoutMs: 5000
    };
  }
}

/**
 * Options validator
 */
export class OptionsValidator {
  /**
   * Validate build options
   */
  static validate(options: TransactionBuildOptions): string[] {
    const errors: string[] = [];

    // Validate numeric ranges
    if (options.maxInputs && options.maxInputs <= 0) {
      errors.push('maxInputs must be positive');
    }

    if (options.minChangeAmount < 0n) {
      errors.push('minChangeAmount must be non-negative');
    }

    // Validate fee calculation options
    if (options.feeCalculation.urgentBumpPercent < 0) {
      errors.push('urgentBumpPercent must be non-negative');
    }

    if (options.feeCalculation.economyReductionPercent < 0 || 
        options.feeCalculation.economyReductionPercent >= 100) {
      errors.push('economyReductionPercent must be between 0 and 100');
    }

    // Validate privacy options
    if (options.privacy.maxDelaySeconds < 0) {
      errors.push('maxDelaySeconds must be non-negative');
    }

    if (options.privacy.decoyCount < 0) {
      errors.push('decoyCount must be non-negative');
    }

    // Validate retry options
    if (options.retry.maxAttempts <= 0) {
      errors.push('maxAttempts must be positive');
    }

    if (options.retry.baseDelayMs < 0) {
      errors.push('baseDelayMs must be non-negative');
    }

    if (options.retry.backoffMultiplier <= 0) {
      errors.push('backoffMultiplier must be positive');
    }

    // Validate timeout options
    if (options.timeout.buildTimeoutMs <= 0) {
      errors.push('buildTimeoutMs must be positive');
    }

    if (options.timeout.networkTimeoutMs <= 0) {
      errors.push('networkTimeoutMs must be positive');
    }

    // Check for conflicting options
    if (options.optimizeForSpeed && options.optimizeForCost) {
      errors.push('Cannot optimize for both speed and cost simultaneously');
    }

    return errors;
  }

  /**
   * Sanitize options to ensure valid values
   */
  static sanitize(options: TransactionBuildOptions): TransactionBuildOptions {
    return {
      ...options,
      maxInputs: Math.max(1, options.maxInputs || 100),
      minChangeAmount: options.minChangeAmount < 0n ? BigInt(0) as MicroTari : options.minChangeAmount,
      feeCalculation: {
        ...options.feeCalculation,
        urgentBumpPercent: Math.max(0, options.feeCalculation.urgentBumpPercent),
        economyReductionPercent: Math.max(0, Math.min(99, options.feeCalculation.economyReductionPercent))
      },
      privacy: {
        ...options.privacy,
        maxDelaySeconds: Math.max(0, options.privacy.maxDelaySeconds),
        decoyCount: Math.max(0, options.privacy.decoyCount)
      },
      retry: {
        ...options.retry,
        maxAttempts: Math.max(1, options.retry.maxAttempts),
        baseDelayMs: Math.max(0, options.retry.baseDelayMs),
        backoffMultiplier: Math.max(1, options.retry.backoffMultiplier)
      },
      timeout: {
        ...options.timeout,
        buildTimeoutMs: Math.max(1000, options.timeout.buildTimeoutMs),
        networkTimeoutMs: Math.max(1000, options.timeout.networkTimeoutMs),
        validationTimeoutMs: Math.max(500, options.timeout.validationTimeoutMs),
        feeEstimationTimeoutMs: Math.max(1000, options.timeout.feeEstimationTimeoutMs),
        utxoSelectionTimeoutMs: Math.max(500, options.timeout.utxoSelectionTimeoutMs)
      }
    };
  }
}

/**
 * Options utility functions
 */
export class OptionsUtils {
  /**
   * Merge two option objects with the second taking precedence
   */
  static merge(
    base: TransactionBuildOptions,
    override: Partial<TransactionBuildOptions>
  ): TransactionBuildOptions {
    return {
      ...base,
      ...override,
      feeCalculation: {
        ...base.feeCalculation,
        ...(override.feeCalculation || {})
      },
      privacy: {
        ...base.privacy,
        ...(override.privacy || {})
      },
      retry: {
        ...base.retry,
        ...(override.retry || {})
      },
      timeout: {
        ...base.timeout,
        ...(override.timeout || {})
      }
    };
  }

  /**
   * Create options for specific priority level
   */
  static forPriority(priority: FeePriority): Partial<TransactionBuildOptions> {
    switch (priority) {
      case FeePriority.Urgent:
        return {
          optimizeForSpeed: true,
          feeCalculation: {
            method: FeeCalculationMethod.NetworkPercentile,
            urgentBumpPercent: 100,
            economyReductionPercent: 0,
            roundFees: false,
            minFeeIncrement: BigInt(1) as MicroTari
          }
        };

      case FeePriority.Economy:
        return {
          optimizeForCost: true,
          consolidateUtxos: true,
          utxoSelectionStrategy: UtxoSelectionStrategy.SmallestFirst,
          feeCalculation: {
            method: FeeCalculationMethod.NetworkMedian,
            urgentBumpPercent: 0,
            economyReductionPercent: 50,
            roundFees: true,
            minFeeIncrement: BigInt(1) as MicroTari
          }
        };

      case FeePriority.Background:
        return {
          optimizeForCost: true,
          consolidateUtxos: true,
          utxoSelectionStrategy: UtxoSelectionStrategy.SmallestFirst,
          feeCalculation: {
            method: FeeCalculationMethod.NetworkMedian,
            urgentBumpPercent: 0,
            economyReductionPercent: 75,
            roundFees: true,
            minFeeIncrement: BigInt(1) as MicroTari
          }
        };

      default: // Standard
        return BuildOptions.default();
    }
  }

  /**
   * Get recommended options for transaction amount
   */
  static forAmount(amount: MicroTari): Partial<TransactionBuildOptions> {
    // Large amounts (> 100 Tari) - optimize for privacy
    if (amount > BigInt(100000000)) {
      return BuildOptions.forPrivacy();
    }
    
    // Medium amounts (1-100 Tari) - balanced approach
    if (amount > BigInt(1000000)) {
      return BuildOptions.default();
    }
    
    // Small amounts (< 1 Tari) - optimize for cost
    return BuildOptions.forCost();
  }
}
