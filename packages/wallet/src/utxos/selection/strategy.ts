/**
 * @fileoverview UTXO Selection Strategy Interface for Tari Wallet
 * 
 * Defines the contract for UTXO selection algorithms with support
 * for various selection strategies and optimization goals.
 */

import {
  UtxoInfo,
  MicroTari,
  WalletError,
  WalletErrorCode
} from '@tari-project/tarijs-core';

/**
 * UTXO selection context and constraints
 */
export interface SelectionContext {
  /** Target amount to select */
  targetAmount: MicroTari;
  
  /** Fee per gram for transaction size calculation */
  feePerGram: MicroTari;
  
  /** Current block height for maturity checks */
  currentHeight?: bigint;
  
  /** Maximum number of inputs allowed */
  maxInputs?: number;
  
  /** Minimum UTXO amount to consider */
  dustThreshold?: MicroTari;
  
  /** Whether to prefer change output avoidance */
  avoidChange?: boolean;
  
  /** Privacy mode preferences */
  privacyMode?: 'normal' | 'high' | 'maximum';
  
  /** Custom UTXO priorities (higher values = higher priority) */
  utxoPriorities?: Map<string, number>;
}

/**
 * UTXO selection result
 */
export interface UtxoSelection {
  /** Selected UTXOs */
  selected: UtxoInfo[];
  
  /** Total amount of selected UTXOs */
  totalAmount: MicroTari;
  
  /** Change amount (totalAmount - targetAmount - estimatedFee) */
  changeAmount: MicroTari;
  
  /** Estimated transaction fee */
  estimatedFee: MicroTari;
  
  /** Whether selection is successful */
  success: boolean;
  
  /** Selection algorithm used */
  algorithm: string;
  
  /** Selection metadata */
  metadata: SelectionMetadata;
}

/**
 * Selection algorithm metadata
 */
export interface SelectionMetadata {
  /** Number of candidates considered */
  candidatesConsidered: number;
  
  /** Selection duration in milliseconds */
  selectionTime: number;
  
  /** Fee optimization achieved */
  feeOptimization: number;
  
  /** Privacy score (0-1, higher is better) */
  privacyScore: number;
  
  /** Whether perfect match was found (no change) */
  perfectMatch: boolean;
  
  /** Waste amount (excess over target) */
  waste: MicroTari;
  
  /** Additional algorithm-specific data */
  algorithmData?: Record<string, any>;
}

/**
 * Abstract base class for UTXO selection strategies
 */
export abstract class SelectionStrategy {
  protected readonly name: string;
  
  constructor(name: string) {
    this.name = name;
  }

  /**
   * Select UTXOs based on the strategy
   */
  public abstract select(
    candidates: UtxoInfo[],
    context: SelectionContext
  ): Promise<UtxoSelection>;

  /**
   * Get strategy name
   */
  public getName(): string {
    return this.name;
  }

  /**
   * Validate selection context
   */
  protected validateContext(context: SelectionContext): void {
    if (BigInt(context.targetAmount) <= 0n) {
      throw new WalletError(
        'Target amount must be positive',
        WalletErrorCode.InvalidAmount
      );
    }

    if (BigInt(context.feePerGram) < 0n) {
      throw new WalletError(
        'Fee per gram cannot be negative',
        WalletErrorCode.InvalidFee
      );
    }

    if (context.maxInputs !== undefined && context.maxInputs <= 0) {
      throw new WalletError(
        'Maximum inputs must be positive',
        WalletErrorCode.InvalidArgument
      );
    }
  }

  /**
   * Filter candidates by basic criteria
   */
  protected filterCandidates(
    candidates: UtxoInfo[],
    context: SelectionContext
  ): UtxoInfo[] {
    return candidates.filter(utxo => {
      // Must be spendable
      if (utxo.status !== 'unspent') {
        return false;
      }

      // Must be mature if height is provided
      if (context.currentHeight !== undefined && 
          utxo.maturityHeight > context.currentHeight) {
        return false;
      }

      // Must be above dust threshold
      if (context.dustThreshold !== undefined && 
          BigInt(utxo.amount) < BigInt(context.dustThreshold)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Estimate transaction fee based on input count
   */
  protected estimateFee(
    inputCount: number,
    feePerGram: MicroTari,
    hasChangeOutput: boolean = true
  ): MicroTari {
    // Basic fee estimation (simplified)
    // Real implementation would use more sophisticated calculation
    const baseSize = 100; // Base transaction size
    const inputSize = 100; // Size per input
    const outputSize = 50; // Size per output
    
    const totalSize = baseSize + 
                     (inputCount * inputSize) + 
                     (hasChangeOutput ? 2 * outputSize : outputSize);
    
    return BigInt(Math.ceil(totalSize * Number(feePerGram))) as MicroTari;
  }

  /**
   * Calculate privacy score for selection
   */
  protected calculatePrivacyScore(
    selected: UtxoInfo[],
    context: SelectionContext
  ): number {
    if (selected.length === 0) return 0;

    let score = 0;

    // Prefer more inputs for better mixing
    score += Math.min(selected.length / 10, 0.3);

    // Prefer avoiding round amounts that might reveal intent
    const totalAmount = selected.reduce(
      (sum, utxo) => sum + BigInt(utxo.amount), 0n
    );
    const isRoundAmount = totalAmount % 1000000n === 0n; // Check if round million
    if (!isRoundAmount) {
      score += 0.2;
    }

    // Prefer diverse UTXO ages
    const ages = selected.map(utxo => Number(utxo.detectedAt));
    const ageVariance = this.calculateVariance(ages);
    const normalizedVariance = Math.min(ageVariance / 86400000, 1); // Normalize by day
    score += normalizedVariance * 0.3;

    // Prefer diverse amounts
    const amounts = selected.map(utxo => Number(utxo.amount));
    const amountVariance = this.calculateVariance(amounts);
    const normalizedAmountVariance = Math.min(amountVariance / 1000000, 1);
    score += normalizedAmountVariance * 0.2;

    return Math.min(score, 1);
  }

  /**
   * Calculate variance for privacy scoring
   */
  private calculateVariance(values: number[]): number {
    if (values.length <= 1) return 0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => {
      const diff = val - mean;
      return sum + (diff * diff);
    }, 0) / values.length;

    return variance;
  }

  /**
   * Create selection result
   */
  protected createResult(
    selected: UtxoInfo[],
    context: SelectionContext,
    metadata: Omit<SelectionMetadata, 'selectionTime' | 'candidatesConsidered'>,
    startTime: number,
    candidatesCount: number
  ): UtxoSelection {
    const totalAmount = selected.reduce(
      (sum, utxo) => sum + BigInt(utxo.amount), 0n
    ) as MicroTari;

    const estimatedFee = this.estimateFee(
      selected.length,
      context.feePerGram,
      metadata.changeAmount > 0n
    );

    const changeAmount = (BigInt(totalAmount) - 
                         BigInt(context.targetAmount) - 
                         BigInt(estimatedFee)) as MicroTari;

    const success = BigInt(totalAmount) >= 
                   (BigInt(context.targetAmount) + BigInt(estimatedFee));

    return {
      selected,
      totalAmount,
      changeAmount: changeAmount > 0n ? changeAmount : 0n as MicroTari,
      estimatedFee,
      success,
      algorithm: this.name,
      metadata: {
        ...metadata,
        selectionTime: Date.now() - startTime,
        candidatesConsidered: candidatesCount,
        privacyScore: this.calculatePrivacyScore(selected, context)
      }
    };
  }
}

/**
 * Selection strategy factory
 */
export class SelectionStrategyFactory {
  private static strategies = new Map<string, () => SelectionStrategy>();

  /**
   * Register a selection strategy
   */
  public static register(name: string, factory: () => SelectionStrategy): void {
    this.strategies.set(name, factory);
  }

  /**
   * Create a selection strategy by name
   */
  public static create(name: string): SelectionStrategy {
    const factory = this.strategies.get(name);
    if (!factory) {
      throw new WalletError(
        `Unknown selection strategy: ${name}`,
        WalletErrorCode.InvalidArgument
      );
    }
    return factory();
  }

  /**
   * Get available strategy names
   */
  public static getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Check if strategy is available
   */
  public static isAvailable(name: string): boolean {
    return this.strategies.has(name);
  }
}
