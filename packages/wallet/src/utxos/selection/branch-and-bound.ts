/**
 * @fileoverview Branch and Bound UTXO Selection Strategy
 * 
 * Implements the Branch and Bound algorithm for optimal UTXO selection,
 * focusing on minimizing waste and avoiding change outputs when possible.
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
  UtxoSelection
} from './strategy.js';

/**
 * Branch and Bound selection strategy
 * 
 * This strategy uses a depth-first search with pruning to find the
 * optimal combination of UTXOs that minimizes waste (excess over target).
 * 
 * Advantages:
 * - Can find exact matches (no change output)
 * - Minimizes waste
 * - Optimal solution when it completes
 * 
 * Disadvantages:
 * - Can be slow for large UTXO sets
 * - May timeout without finding a solution
 * - Exponential worst-case complexity
 */
export class BranchAndBoundStrategy extends SelectionStrategy {
  private static readonly MAX_TRIES = 100000;
  private static readonly COST_OF_CHANGE = 5000n; // Cost penalty for change output
  
  constructor() {
    super('branch-and-bound');
  }

  public async select(
    candidates: UtxoInfo[],
    context: SelectionContext
  ): Promise<UtxoSelection> {
    const startTime = Date.now();
    
    this.validateContext(context);
    
    // Filter and prepare candidates
    const filtered = this.filterCandidates(candidates, context);
    if (filtered.length === 0) {
      throw new WalletError(
        WalletErrorCode.InsufficientUtxos,
        'No suitable UTXOs available for selection'
      );
    }

    // Sort by effective value (amount - input cost)
    const sorted = this.sortByEffectiveValue(filtered, context);
    
    // Calculate target with fees
    const target = this.calculateTarget(context);
    
    // Try branch and bound algorithm
    const result = this.branchAndBound(sorted, target, context);
    
    if (result) {
      return this.createSelectionResult(
        result,
        context,
        startTime,
        candidates.length
      );
    }

    // If branch and bound fails, fall back to first-fit
    return this.fallbackSelection(sorted, context, startTime, candidates.length);
  }

  private sortByEffectiveValue(
    utxos: UtxoInfo[],
    context: SelectionContext
  ): Array<{ utxo: UtxoInfo; effectiveValue: bigint }> {
    return utxos
      .map(utxo => {
        const inputCost = this.calculateInputCost(context.feePerGram);
        const effectiveValue = BigInt(utxo.amount) - inputCost;
        return { utxo, effectiveValue };
      })
      .filter(item => item.effectiveValue > 0n) // Remove negative effective value UTXOs
      .sort((a, b) => {
        const diff = b.effectiveValue - a.effectiveValue;
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
      });
  }

  private calculateTarget(context: SelectionContext): bigint {
    // Target amount plus minimum fee (assuming no change output initially)
    const baseFee = this.estimateFee(1, context.feePerGram, false);
    return BigInt(context.targetAmount) + BigInt(baseFee);
  }

  private calculateInputCost(feePerGram: MicroTari): bigint {
    // Approximate cost of including one input
    const inputSize = 100; // bytes
    return BigInt(inputSize) * BigInt(feePerGram);
  }

  private branchAndBound(
    sortedUtxos: Array<{ utxo: UtxoInfo; effectiveValue: bigint }>,
    target: bigint,
    context: SelectionContext
  ): UtxoInfo[] | null {
    let bestSelection: UtxoInfo[] | null = null;
    let bestWaste = BigInt(Number.MAX_SAFE_INTEGER);
    let tries = 0;

    const search = (
      index: number,
      currentValue: bigint,
      currentSelection: UtxoInfo[],
      currentInputCost: bigint
    ): void => {
      if (++tries > BranchAndBoundStrategy.MAX_TRIES) {
        return; // Timeout protection
      }

      // Check if current selection meets the target
      if (currentValue >= target) {
        const actualFee = this.estimateFee(
          currentSelection.length,
          context.feePerGram,
          true
        );
        const totalNeeded = BigInt(context.targetAmount) + BigInt(actualFee);
        
        if (currentValue >= totalNeeded) {
          const waste = currentValue - totalNeeded;
          
          // Perfect match (no change)
          if (waste === 0n) {
            bestSelection = [...currentSelection];
            bestWaste = 0n;
            return;
          }
          
          // Consider cost of change output
          const changeOutputCost = this.calculateChangeOutputCost(context.feePerGram);
          const adjustedWaste = waste + changeOutputCost;
          
          if (adjustedWaste < bestWaste) {
            bestSelection = [...currentSelection];
            bestWaste = adjustedWaste;
          }
        }
      }

      // Pruning conditions
      if (index >= sortedUtxos.length) return;
      if (currentValue > target + BranchAndBoundStrategy.COST_OF_CHANGE) return;
      
      // Calculate upper bound for remaining UTXOs
      let upperBound = currentValue;
      for (let i = index; i < sortedUtxos.length; i++) {
        upperBound += sortedUtxos[i].effectiveValue;
      }
      
      if (upperBound < target) return; // Can't reach target
      if (bestWaste === 0n) return; // Already found perfect match

      // Apply input limit
      if (currentSelection.length >= (context.maxInputs || 100)) return;

      // Branch 1: Include current UTXO
      const currentUtxo = sortedUtxos[index];
      if (currentUtxo.effectiveValue > 0n) {
        search(
          index + 1,
          currentValue + currentUtxo.effectiveValue,
          [...currentSelection, currentUtxo.utxo],
          currentInputCost + this.calculateInputCost(context.feePerGram)
        );
      }

      // Branch 2: Skip current UTXO
      search(index + 1, currentValue, currentSelection, currentInputCost);
    };

    search(0, 0n, [], 0n);
    
    return bestSelection;
  }

  private calculateChangeOutputCost(feePerGram: MicroTari): bigint {
    // Cost of adding a change output
    const changeOutputSize = 50; // bytes
    return BigInt(changeOutputSize) * BigInt(feePerGram);
  }

  private createSelectionResult(
    selected: UtxoInfo[],
    context: SelectionContext,
    startTime: number,
    candidatesCount: number
  ): UtxoSelection {
    const totalAmount = selected.reduce(
      (sum, utxo) => sum + BigInt(utxo.amount), 0n
    ) as MicroTari;

    const estimatedFee = this.estimateFee(
      selected.length,
      context.feePerGram,
      true
    );

    const changeAmount = (BigInt(totalAmount) - 
                         BigInt(context.targetAmount) - 
                         BigInt(estimatedFee)) as MicroTari;

    const actualChange = changeAmount > 0n ? changeAmount : 0n as MicroTari;
    const perfectMatch = actualChange === 0n;

    return this.createResult(
      selected,
      context,
      {
        feeOptimization: this.calculateFeeOptimization(selected, context),
        privacyScore: 0.5,
        perfectMatch,
        waste: actualChange,
        changeAmount: actualChange,
        algorithmData: {
          branchAndBoundUsed: true,
          exactMatch: perfectMatch,
          wasteMinimized: true
        }
      },
      startTime,
      candidatesCount
    );
  }

  private fallbackSelection(
    sortedUtxos: Array<{ utxo: UtxoInfo; effectiveValue: bigint }>,
    context: SelectionContext,
    startTime: number,
    candidatesCount: number
  ): UtxoSelection {
    const selected: UtxoInfo[] = [];
    let totalValue = 0n;
    const target = BigInt(context.targetAmount);

    // Simple first-fit as fallback
    for (const { utxo, effectiveValue } of sortedUtxos) {
      if (selected.length >= (context.maxInputs || 100)) break;
      
      selected.push(utxo);
      totalValue += BigInt(utxo.amount);

      const estimatedFee = this.estimateFee(
        selected.length,
        context.feePerGram,
        true
      );

      if (totalValue >= target + BigInt(estimatedFee)) {
        break;
      }
    }

    const totalAmount = totalValue as MicroTari;
    const estimatedFee = this.estimateFee(
      selected.length,
      context.feePerGram,
      totalValue > target + BigInt(this.estimateFee(selected.length, context.feePerGram))
    );

    const changeAmount = totalValue >= target + BigInt(estimatedFee)
      ? (totalValue - target - BigInt(estimatedFee)) as MicroTari
      : 0n as MicroTari;

    const success = totalValue >= target + BigInt(estimatedFee);

    return this.createResult(
      selected,
      context,
      {
        feeOptimization: this.calculateFeeOptimization(selected, context),
        privacyScore: 0.5,
        perfectMatch: changeAmount === 0n,
        waste: changeAmount,
        changeAmount,
        algorithmData: {
          branchAndBoundUsed: false,
          fallbackUsed: true,
          reason: 'branch_and_bound_timeout'
        }
      },
      startTime,
      candidatesCount
    );
  }

  private calculateFeeOptimization(
    selected: UtxoInfo[],
    context: SelectionContext
  ): number {
    // Optimization is based on minimizing total cost (fee + change cost)
    const actualFee = this.estimateFee(selected.length, context.feePerGram, true);
    const minPossibleFee = this.estimateFee(1, context.feePerGram, false);
    
    const feeRatio = Number(actualFee) / Number(minPossibleFee);
    return Math.max(0, 2 - feeRatio); // Higher score for lower fee ratios
  }
}
