/**
 * @fileoverview Random UTXO Selection Strategy
 * 
 * Implements a random selection algorithm that provides better privacy
 * by making transaction patterns less predictable.
 */

import {
  UtxoInfo,
  MicroTari
} from '@tari-project/tarijs-core';

import {
  SelectionStrategy,
  SelectionContext,
  UtxoSelection
} from './strategy.js';

/**
 * Random selection strategy
 * 
 * This strategy randomly selects UTXOs until the target amount is reached.
 * It can use different randomization approaches for different privacy levels.
 * 
 * Advantages:
 * - Better privacy through unpredictable selection
 * - Helps prevent transaction pattern analysis
 * - Simple implementation
 * 
 * Disadvantages:
 * - Not optimal for fees
 * - May select more UTXOs than necessary
 * - No guarantee of efficiency
 */
export class RandomSelectionStrategy extends SelectionStrategy {
  
  constructor() {
    super('random');
  }

  public async select(
    candidates: UtxoInfo[],
    context: SelectionContext
  ): Promise<UtxoSelection> {
    const startTime = Date.now();
    
    this.validateContext(context);
    
    // Filter candidates
    const filtered = this.filterCandidates(candidates, context);
    if (filtered.length === 0) {
      throw new Error('No suitable UTXOs available for selection');
    }

    // Select based on privacy mode
    const selected = await this.performRandomSelection(filtered, context);
    
    const totalAmount = selected.reduce(
      (sum, utxo) => sum + BigInt(utxo.amount), 0n
    ) as MicroTari;

    const estimatedFee = this.estimateFee(
      selected.length,
      context.feePerGram,
      true
    );

    const required = BigInt(context.targetAmount) + BigInt(estimatedFee);
    const success = BigInt(totalAmount) >= required;
    
    const changeAmount = success 
      ? (BigInt(totalAmount) - required) as MicroTari
      : 0n as MicroTari;

    return this.createResult(
      selected,
      context,
      {
        feeOptimization: this.calculateFeeOptimization(selected.length),
        privacyScore: 0.5,
        perfectMatch: changeAmount === 0n,
        waste: changeAmount,
        changeAmount,
        algorithmData: {
          randomizationMethod: this.getRandomizationMethod(context),
          selectionRounds: this.calculateSelectionRounds(selected.length),
          privacyEnhanced: true
        }
      },
      startTime,
      candidates.length
    );
  }

  private async performRandomSelection(
    candidates: UtxoInfo[],
    context: SelectionContext
  ): Promise<UtxoInfo[]> {
    const selected: UtxoInfo[] = [];
    const available = [...candidates];
    let totalSelected = 0n;
    const targetAmount = BigInt(context.targetAmount);
    
    const maxInputs = Math.min(
      context.maxInputs || available.length,
      available.length
    );

    // Randomization based on privacy mode
    const privacyMode = context.privacyMode || 'normal';
    
    while (selected.length < maxInputs && available.length > 0) {
      // Select next UTXO based on privacy mode
      const nextUtxo = this.selectNextUtxo(available, privacyMode, context);
      
      if (!nextUtxo) break;
      
      // Remove from available and add to selected
      const index = available.indexOf(nextUtxo);
      available.splice(index, 1);
      selected.push(nextUtxo);
      totalSelected += BigInt(nextUtxo.amount);

      // Check if we have enough (with some buffer for fees)
      const estimatedFee = this.estimateFee(
        selected.length,
        context.feePerGram,
        true
      );
      
      if (totalSelected >= targetAmount + BigInt(estimatedFee)) {
        // For higher privacy, sometimes select additional UTXOs
        if (privacyMode === 'maximum' && Math.random() < 0.3 && selected.length < maxInputs) {
          continue; // Select one more for obfuscation
        }
        break;
      }
    }

    return selected;
  }

  private selectNextUtxo(
    available: UtxoInfo[],
    privacyMode: string,
    context: SelectionContext
  ): UtxoInfo | null {
    if (available.length === 0) return null;

    switch (privacyMode) {
      case 'maximum':
        return this.selectWithMaximumPrivacy(available, context);
      
      case 'high':
        return this.selectWithHighPrivacy(available);
      
      case 'normal':
      default:
        return this.selectWithNormalPrivacy(available);
    }
  }

  private selectWithMaximumPrivacy(
    available: UtxoInfo[],
    context: SelectionContext
  ): UtxoInfo {
    // Use weighted random selection based on multiple factors
    const weights = available.map(utxo => {
      let weight = 1;
      
      // Prefer older UTXOs (better mixing)
      const age = Date.now() - Number(utxo.detectedAt);
      weight += Math.min(age / (24 * 60 * 60 * 1000), 10); // Max 10 days bonus
      
      // Prefer diverse amounts
      const amount = Number(utxo.amount);
      const isRoundAmount = amount % 1000000 === 0; // Round millions
      if (!isRoundAmount) weight += 2;
      
      // Apply custom priorities if provided
      if (context.utxoPriorities?.has(utxo.id)) {
        weight *= context.utxoPriorities.get(utxo.id)!;
      }
      
      return weight;
    });

    return this.weightedRandomSelection(available, weights);
  }

  private selectWithHighPrivacy(available: UtxoInfo[]): UtxoInfo {
    // Weighted selection with age bias
    const weights = available.map(utxo => {
      const age = Date.now() - Number(utxo.detectedAt);
      return 1 + (age / (7 * 24 * 60 * 60 * 1000)); // Bias toward older UTXOs
    });

    return this.weightedRandomSelection(available, weights);
  }

  private selectWithNormalPrivacy(available: UtxoInfo[]): UtxoInfo {
    // Simple uniform random selection
    const randomIndex = Math.floor(Math.random() * available.length);
    return available[randomIndex];
  }

  private weightedRandomSelection(items: UtxoInfo[], weights: number[]): UtxoInfo {
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < items.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return items[i];
      }
    }
    
    // Fallback to last item
    return items[items.length - 1];
  }

  private getRandomizationMethod(context: SelectionContext): string {
    const privacyMode = context.privacyMode || 'normal';
    
    switch (privacyMode) {
      case 'maximum':
        return 'weighted_multi_factor';
      case 'high':
        return 'age_weighted';
      case 'normal':
      default:
        return 'uniform_random';
    }
  }

  private calculateSelectionRounds(selectedCount: number): number {
    // Number of rounds it took to select UTXOs
    return selectedCount;
  }

  private calculateFeeOptimization(inputCount: number): number {
    // Random selection is not optimized for fees
    // Score decreases with more inputs
    return Math.max(0, 1 - (inputCount - 1) * 0.1);
  }
}
