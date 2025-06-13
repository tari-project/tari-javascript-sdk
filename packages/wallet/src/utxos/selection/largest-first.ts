/**
 * @fileoverview Largest First UTXO Selection Strategy
 * 
 * Implements a simple greedy algorithm that selects the largest
 * UTXOs first until the target amount is reached.
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
 * Largest first selection strategy
 * 
 * This strategy sorts UTXOs by amount in descending order and selects
 * them until the target amount plus estimated fees are covered.
 * 
 * Advantages:
 * - Simple and fast
 * - Minimizes number of inputs
 * - Good for reducing transaction size
 * 
 * Disadvantages:
 * - May leave large change amounts
 * - Not optimal for privacy
 * - Can be wasteful with large UTXOs
 */
export class LargestFirstStrategy extends SelectionStrategy {
  
  constructor() {
    super('largest-first');
  }

  public async select(
    candidates: UtxoInfo[],
    context: SelectionContext
  ): Promise<UtxoSelection> {
    const startTime = Date.now();
    
    this.validateContext(context);
    
    // Filter and sort candidates
    const filtered = this.filterCandidates(candidates, context);
    if (filtered.length === 0) {
      throw new WalletError(
        'No suitable UTXOs available for selection',
        WalletErrorCode.InsufficientUtxos
      );
    }

    // Sort by amount descending (largest first)
    const sorted = filtered.sort((a, b) => {
      const diff = BigInt(b.amount) - BigInt(a.amount);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });

    return this.performSelection(sorted, context, startTime, candidates.length);
  }

  private performSelection(
    sortedUtxos: UtxoInfo[],
    context: SelectionContext,
    startTime: number,
    candidatesCount: number
  ): UtxoSelection {
    const selected: UtxoInfo[] = [];
    let totalSelected = 0n;
    const targetAmount = BigInt(context.targetAmount);

    // Apply input limit if specified
    const maxInputs = Math.min(
      context.maxInputs || sortedUtxos.length,
      sortedUtxos.length
    );

    // Greedy selection
    for (let i = 0; i < maxInputs; i++) {
      const utxo = sortedUtxos[i];
      selected.push(utxo);
      totalSelected += BigInt(utxo.amount);

      // Estimate fee for current selection
      const estimatedFee = this.estimateFee(
        selected.length,
        context.feePerGram,
        true // Assume change output
      );

      const requiredAmount = targetAmount + BigInt(estimatedFee);

      // Check if we have enough
      if (totalSelected >= requiredAmount) {
        // Check if we should avoid change output
        if (context.avoidChange) {
          const exactMatch = this.findExactMatch(
            sortedUtxos.slice(0, i + 1),
            context
          );
          if (exactMatch) {
            return exactMatch;
          }
        }

        // Calculate final amounts
        const changeAmount = (totalSelected - requiredAmount) as MicroTari;
        const perfectMatch = changeAmount === 0n;
        
        // If change is below dust threshold, include it in fee
        const dustThreshold = context.dustThreshold || 1000n as MicroTari;
        const finalFee = changeAmount < BigInt(dustThreshold) 
          ? (BigInt(estimatedFee) + changeAmount) as MicroTari
          : estimatedFee;
        
        const finalChange = changeAmount < BigInt(dustThreshold)
          ? 0n as MicroTari
          : changeAmount;

        return this.createResult(
          selected,
          context,
          {
            feeOptimization: this.calculateFeeOptimization(selected, context),
            perfectMatch,
            waste: finalChange,
            changeAmount: finalChange,
            algorithmData: {
              sortingCriteria: 'amount_desc',
              inputsConsidered: i + 1,
              dustConsolidated: changeAmount < BigInt(dustThreshold)
            }
          },
          startTime,
          candidatesCount
        );
      }
    }

    // If we get here, we couldn't select enough
    const finalFee = this.estimateFee(selected.length, context.feePerGram);
    const shortfall = (targetAmount + BigInt(finalFee) - totalSelected) as MicroTari;

    return {
      selected,
      totalAmount: totalSelected as MicroTari,
      changeAmount: 0n as MicroTari,
      estimatedFee: finalFee,
      success: false,
      algorithm: this.name,
      metadata: {
        candidatesConsidered: candidatesCount,
        selectionTime: Date.now() - startTime,
        feeOptimization: 0,
        privacyScore: 0,
        perfectMatch: false,
        waste: 0n as MicroTari,
        algorithmData: {
          shortfall,
          maxInputsReached: selected.length >= maxInputs
        }
      }
    };
  }

  /**
   * Try to find an exact match (no change) within selected UTXOs
   */
  private findExactMatch(
    candidates: UtxoInfo[],
    context: SelectionContext
  ): UtxoSelection | null {
    const targetAmount = BigInt(context.targetAmount);
    
    // Try all combinations (subset sum problem)
    // For performance, limit to reasonable number of combinations
    const maxCombinations = Math.min(Math.pow(2, candidates.length), 10000);
    
    for (let mask = 1; mask < maxCombinations; mask++) {
      const selected: UtxoInfo[] = [];
      let totalAmount = 0n;
      
      for (let i = 0; i < candidates.length; i++) {
        if (mask & (1 << i)) {
          selected.push(candidates[i]);
          totalAmount += BigInt(candidates[i].amount);
        }
      }
      
      const estimatedFee = this.estimateFee(
        selected.length,
        context.feePerGram,
        false // No change output
      );
      
      if (totalAmount === targetAmount + BigInt(estimatedFee)) {
        return {
          selected,
          totalAmount: totalAmount as MicroTari,
          changeAmount: 0n as MicroTari,
          estimatedFee,
          success: true,
          algorithm: this.name,
          metadata: {
            candidatesConsidered: candidates.length,
            selectionTime: 0,
            feeOptimization: 1.0,
            privacyScore: this.calculatePrivacyScore(selected, context),
            perfectMatch: true,
            waste: 0n as MicroTari,
            algorithmData: {
              exactMatch: true,
              combinationsTried: mask
            }
          }
        };
      }
    }
    
    return null;
  }

  /**
   * Calculate fee optimization score (0-1)
   */
  private calculateFeeOptimization(
    selected: UtxoInfo[],
    context: SelectionContext
  ): number {
    // Compare against theoretical minimum fee (1 input)
    const actualFee = this.estimateFee(selected.length, context.feePerGram);
    const minFee = this.estimateFee(1, context.feePerGram);
    
    if (BigInt(actualFee) <= BigInt(minFee)) {
      return 1.0;
    }
    
    // Calculate efficiency based on fee increase
    const feeIncrease = Number(BigInt(actualFee) - BigInt(minFee));
    const efficiency = Math.max(0, 1 - (feeIncrease / Number(actualFee)));
    
    return efficiency;
  }
}
