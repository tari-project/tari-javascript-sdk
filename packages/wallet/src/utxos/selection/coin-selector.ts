/**
 * @fileoverview Main Coin Selector for Tari Wallet
 * 
 * Provides the primary interface for UTXO selection with support
 * for multiple algorithms and automatic strategy selection.
 */

import {
  UtxoInfo,
  MicroTari,
  WalletError,
  WalletErrorCode
} from '@tari-project/tarijs-core';

import {
  SelectionStrategy,
  SelectionContext,
  UtxoSelection,
  SelectionStrategyFactory
} from './strategy.js';

import { LargestFirstStrategy } from './largest-first.js';
import { BranchAndBoundStrategy } from './branch-and-bound.js';
import { RandomSelectionStrategy } from './random-selection.js';
import { KnapsackStrategy } from './knapsack.js';
import { PrivacyAwareStrategy } from './privacy-aware.js';

/**
 * Coin selector configuration
 */
export interface CoinSelectorConfig {
  /** Default selection strategy */
  defaultStrategy?: string;
  
  /** Fallback strategies if primary fails */
  fallbackStrategies?: string[];
  
  /** Whether to enable automatic strategy selection */
  autoStrategy?: boolean;
  
  /** Maximum selection attempts */
  maxAttempts?: number;
  
  /** Selection timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Strategy selection criteria
 */
export interface StrategySelectionCriteria {
  /** Target amount */
  targetAmount: MicroTari;
  
  /** Available UTXO count */
  utxoCount: number;
  
  /** Total available amount */
  totalAmount: MicroTari;
  
  /** Privacy requirements */
  privacyLevel: 'normal' | 'high' | 'maximum';
  
  /** Performance requirements */
  performanceLevel: 'fast' | 'balanced' | 'optimal';
}

/**
 * Main coin selector with multiple strategy support
 */
export class CoinSelector {
  private readonly config: Required<CoinSelectorConfig>;
  
  constructor(config?: Partial<CoinSelectorConfig>) {
    this.config = {
      defaultStrategy: 'largest-first',
      fallbackStrategies: ['knapsack', 'random'],
      autoStrategy: true,
      maxAttempts: 3,
      timeoutMs: 5000,
      ...config
    };
    
    this.registerStrategies();
  }

  /**
   * Select UTXOs for a transaction
   */
  public async selectCoins(
    candidates: UtxoInfo[],
    context: SelectionContext
  ): Promise<UtxoSelection> {
    const startTime = Date.now();
    
    // Validate inputs
    this.validateInputs(candidates, context);
    
    // Choose strategy
    const strategyName = this.chooseStrategy(candidates, context);
    
    // Attempt selection with primary strategy
    try {
      const strategy = SelectionStrategyFactory.create(strategyName);
      const result = await this.executeWithTimeout(
        () => strategy.select(candidates, context),
        this.config.timeoutMs
      );
      
      if (result.success) {
        return result;
      }
    } catch (error) {
      console.warn(`Primary strategy ${strategyName} failed:`, error);
    }
    
    // Try fallback strategies
    for (const fallbackName of this.config.fallbackStrategies) {
      if (fallbackName === strategyName) continue; // Skip if same as primary
      
      try {
        const strategy = SelectionStrategyFactory.create(fallbackName);
        const result = await this.executeWithTimeout(
          () => strategy.select(candidates, context),
          this.config.timeoutMs
        );
        
        if (result.success) {
          return result;
        }
      } catch (error) {
        console.warn(`Fallback strategy ${fallbackName} failed:`, error);
      }
    }
    
    // All strategies failed
    throw new WalletError(
      'All coin selection strategies failed',
      WalletErrorCode.InsufficientFunds,
      {
        targetAmount: context.targetAmount,
        availableAmount: this.calculateTotalAmount(candidates),
        strategiesAttempted: [strategyName, ...this.config.fallbackStrategies]
      }
    );
  }

  /**
   * Select coins with specific strategy
   */
  public async selectWithStrategy(
    candidates: UtxoInfo[],
    context: SelectionContext,
    strategyName: string
  ): Promise<UtxoSelection> {
    this.validateInputs(candidates, context);
    
    if (!SelectionStrategyFactory.isAvailable(strategyName)) {
      throw new WalletError(
        `Unknown selection strategy: ${strategyName}`,
        WalletErrorCode.InvalidArgument
      );
    }
    
    const strategy = SelectionStrategyFactory.create(strategyName);
    return await this.executeWithTimeout(
      () => strategy.select(candidates, context),
      this.config.timeoutMs
    );
  }

  /**
   * Compare multiple strategies for the same selection
   */
  public async compareStrategies(
    candidates: UtxoInfo[],
    context: SelectionContext,
    strategyNames?: string[]
  ): Promise<Map<string, UtxoSelection>> {
    this.validateInputs(candidates, context);
    
    const strategies = strategyNames || SelectionStrategyFactory.getAvailableStrategies();
    const results = new Map<string, UtxoSelection>();
    
    for (const name of strategies) {
      try {
        const result = await this.selectWithStrategy(candidates, context, name);
        results.set(name, result);
      } catch (error) {
        // Create failed result
        results.set(name, {
          selected: [],
          totalAmount: 0n as MicroTari,
          changeAmount: 0n as MicroTari,
          estimatedFee: 0n as MicroTari,
          success: false,
          algorithm: name,
          metadata: {
            candidatesConsidered: candidates.length,
            selectionTime: 0,
            feeOptimization: 0,
            privacyScore: 0,
            perfectMatch: false,
            waste: 0n as MicroTari,
            algorithmData: { error: error instanceof Error ? error.message : String(error) }
          }
        });
      }
    }
    
    return results;
  }

  /**
   * Find optimal selection among multiple strategies
   */
  public async findOptimalSelection(
    candidates: UtxoInfo[],
    context: SelectionContext,
    optimizationGoal: 'fee' | 'privacy' | 'speed' = 'fee'
  ): Promise<UtxoSelection> {
    const results = await this.compareStrategies(candidates, context);
    
    // Filter successful results
    const successfulResults = Array.from(results.entries())
      .filter(([, result]) => result.success)
      .map(([name, result]) => ({ name, result }));
    
    if (successfulResults.length === 0) {
      throw new WalletError(
        'No strategy produced a successful selection',
        WalletErrorCode.InsufficientFunds
      );
    }
    
    // Select best based on optimization goal
    let bestResult = successfulResults[0];
    
    for (const current of successfulResults.slice(1)) {
      if (this.isBetterSelection(current.result, bestResult.result, optimizationGoal)) {
        bestResult = current;
      }
    }
    
    return bestResult.result;
  }

  /**
   * Get available selection strategies
   */
  public getAvailableStrategies(): string[] {
    return SelectionStrategyFactory.getAvailableStrategies();
  }

  /**
   * Get selector configuration
   */
  public getConfig(): Readonly<Required<CoinSelectorConfig>> {
    return { ...this.config };
  }

  /**
   * Update selector configuration
   */
  public updateConfig(newConfig: Partial<CoinSelectorConfig>): void {
    Object.assign(this.config, newConfig);
  }

  // Private implementation methods

  private registerStrategies(): void {
    // Register all available strategies
    SelectionStrategyFactory.register('largest-first', () => new LargestFirstStrategy());
    SelectionStrategyFactory.register('branch-and-bound', () => new BranchAndBoundStrategy());
    SelectionStrategyFactory.register('random', () => new RandomSelectionStrategy());
    SelectionStrategyFactory.register('knapsack', () => new KnapsackStrategy());
    SelectionStrategyFactory.register('privacy-aware', () => new PrivacyAwareStrategy());
  }

  private chooseStrategy(candidates: UtxoInfo[], context: SelectionContext): string {
    if (!this.config.autoStrategy) {
      return this.config.defaultStrategy;
    }

    const criteria: StrategySelectionCriteria = {
      targetAmount: context.targetAmount,
      utxoCount: candidates.length,
      totalAmount: this.calculateTotalAmount(candidates),
      privacyLevel: context.privacyMode || 'normal',
      performanceLevel: 'balanced'
    };

    // Strategy selection logic
    if (criteria.privacyLevel === 'maximum') {
      return 'privacy-aware';
    }

    if (criteria.utxoCount > 1000) {
      return 'largest-first'; // Fast for large UTXO sets
    }

    if (context.avoidChange) {
      return 'branch-and-bound'; // Best for exact matches
    }

    if (criteria.utxoCount < 50) {
      return 'knapsack'; // Optimal for small sets
    }

    return this.config.defaultStrategy;
  }

  private validateInputs(candidates: UtxoInfo[], context: SelectionContext): void {
    if (!candidates || candidates.length === 0) {
      throw new WalletError(
        'No UTXO candidates provided',
        WalletErrorCode.InvalidArgument
      );
    }

    if (BigInt(context.targetAmount) <= 0n) {
      throw new WalletError(
        'Target amount must be positive',
        WalletErrorCode.InvalidAmount
      );
    }

    const totalAvailable = this.calculateTotalAmount(candidates);
    if (BigInt(totalAvailable) < BigInt(context.targetAmount)) {
      throw new WalletError(
        'Insufficient funds: total available is less than target amount',
        WalletErrorCode.InsufficientFunds,
        {
          available: totalAvailable,
          required: context.targetAmount
        }
      );
    }
  }

  private calculateTotalAmount(candidates: UtxoInfo[]): MicroTari {
    return candidates.reduce(
      (sum, utxo) => sum + BigInt(utxo.amount), 
      0n
    ) as MicroTari;
  }

  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new WalletError(
          'Selection operation timed out',
          WalletErrorCode.OperationTimeout
        ));
      }, timeoutMs);

      operation()
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  private isBetterSelection(
    current: UtxoSelection,
    best: UtxoSelection,
    goal: 'fee' | 'privacy' | 'speed'
  ): boolean {
    switch (goal) {
      case 'fee':
        // Prefer lower fees, then less waste
        if (BigInt(current.estimatedFee) !== BigInt(best.estimatedFee)) {
          return BigInt(current.estimatedFee) < BigInt(best.estimatedFee);
        }
        return BigInt(current.metadata.waste) < BigInt(best.metadata.waste);

      case 'privacy':
        // Prefer higher privacy score
        if (current.metadata.privacyScore !== best.metadata.privacyScore) {
          return current.metadata.privacyScore > best.metadata.privacyScore;
        }
        // Tie-breaker: prefer more inputs
        return current.selected.length > best.selected.length;

      case 'speed':
        // Prefer faster selection time
        if (current.metadata.selectionTime !== best.metadata.selectionTime) {
          return current.metadata.selectionTime < best.metadata.selectionTime;
        }
        // Tie-breaker: prefer fewer inputs
        return current.selected.length < best.selected.length;

      default:
        return false;
    }
  }
}
