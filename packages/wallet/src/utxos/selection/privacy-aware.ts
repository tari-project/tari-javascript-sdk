/**
 * @fileoverview Privacy-Aware UTXO Selection Strategy
 * 
 * Implements a selection algorithm optimized for transaction privacy
 * by considering multiple privacy factors and mixing techniques.
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
 * Privacy-aware selection strategy
 * 
 * This strategy prioritizes privacy over fee optimization by:
 * - Using diverse UTXO sets
 * - Avoiding patterns that could link transactions
 * - Implementing mixing-friendly selection
 * 
 * Advantages:
 * - Maximizes transaction privacy
 * - Reduces linkability between transactions
 * - Supports advanced privacy features
 * 
 * Disadvantages:
 * - Higher fees due to more inputs
 * - Larger transaction sizes
 * - May select unnecessary UTXOs
 */
export class PrivacyAwareStrategy extends SelectionStrategy {
  
  constructor() {
    super('privacy-aware');
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

    // Score UTXOs for privacy
    const scored = this.scoreUtxosForPrivacy(filtered, context);
    
    // Perform privacy-optimized selection
    const selected = await this.performPrivacySelection(scored, context);
    
    return this.createPrivacyResult(selected, context, startTime, candidates.length);
  }

  private scoreUtxosForPrivacy(
    utxos: UtxoInfo[],
    context: SelectionContext
  ): Array<{ utxo: UtxoInfo; privacyScore: number }> {
    return utxos.map(utxo => ({
      utxo,
      privacyScore: this.calculateUtxoPrivacyScore(utxo, context)
    }));
  }

  private calculateUtxoPrivacyScore(utxo: UtxoInfo, context: SelectionContext): number {
    let score = 1.0;
    
    // Age scoring - older UTXOs are better for privacy
    const age = Date.now() - Number(utxo.detectedAt);
    const ageDays = age / (24 * 60 * 60 * 1000);
    
    if (ageDays > 30) {
      score += 0.5; // Bonus for old UTXOs
    } else if (ageDays > 7) {
      score += 0.3;
    } else if (ageDays > 1) {
      score += 0.1;
    } else {
      score -= 0.2; // Penalty for very fresh UTXOs
    }
    
    // Amount diversity scoring
    const amount = Number(utxo.amount);
    
    // Penalty for round amounts (more suspicious)
    if (amount % 1000000 === 0) {
      score -= 0.3;
    } else if (amount % 100000 === 0) {
      score -= 0.1;
    }
    
    // Prefer medium-sized amounts
    if (amount >= 100000 && amount <= 10000000) {
      score += 0.2;
    }
    
    // Size-based scoring
    if (amount < Number(context.dustThreshold || 1000)) {
      score -= 0.5; // Avoid dust
    }
    
    // Output features consideration
    if (utxo.features === 'coinbase') {
      score -= 0.4; // Coinbase outputs are more traceable
    }
    
    // Custom priority scoring
    if (context.utxoPriorities?.has(utxo.id)) {
      const priority = context.utxoPriorities.get(utxo.id)!;
      score *= priority;
    }
    
    return Math.max(0.1, score); // Ensure positive score
  }

  private async performPrivacySelection(
    scoredUtxos: Array<{ utxo: UtxoInfo; privacyScore: number }>,
    context: SelectionContext
  ): Promise<UtxoInfo[]> {
    const selected: UtxoInfo[] = [];
    const available = [...scoredUtxos];
    let totalAmount = 0n;
    const targetAmount = BigInt(context.targetAmount);
    
    // Determine optimal input count for privacy
    const optimalInputCount = this.calculateOptimalInputCount(
      available.length,
      context.privacyMode || 'normal'
    );
    
    const maxInputs = Math.min(
      context.maxInputs || optimalInputCount,
      optimalInputCount
    );

    // Phase 1: Select diverse set of UTXOs
    const diverseSet = this.selectDiverseSet(available, maxInputs, context);
    
    for (const item of diverseSet) {
      selected.push(item.utxo);
      totalAmount += BigInt(item.utxo.amount);
      
      // Remove from available
      const index = available.indexOf(item);
      if (index > -1) {
        available.splice(index, 1);
      }
      
      // Check if we have enough
      const estimatedFee = this.estimateFee(
        selected.length,
        context.feePerGram,
        true
      );
      
      if (totalAmount >= targetAmount + BigInt(estimatedFee)) {
        // For maximum privacy, sometimes add one more UTXO
        if (context.privacyMode === 'maximum' && 
            selected.length < maxInputs && 
            available.length > 0 &&
            Math.random() < 0.4) {
          
          const additionalUtxo = this.selectAdditionalPrivacyUtxo(available);
          if (additionalUtxo) {
            selected.push(additionalUtxo.utxo);
            totalAmount += BigInt(additionalUtxo.utxo.amount);
          }
        }
        break;
      }
    }

    // Phase 2: Add more UTXOs if needed
    while (selected.length < maxInputs && available.length > 0) {
      const estimatedFee = this.estimateFee(
        selected.length + 1,
        context.feePerGram,
        true
      );
      
      if (totalAmount >= targetAmount + BigInt(estimatedFee)) {
        break;
      }
      
      // Select next best UTXO for privacy
      const nextUtxo = this.selectNextPrivacyUtxo(available, selected);
      if (!nextUtxo) break;
      
      selected.push(nextUtxo.utxo);
      totalAmount += BigInt(nextUtxo.utxo.amount);
      
      const index = available.indexOf(nextUtxo);
      available.splice(index, 1);
    }

    return selected;
  }

  private calculateOptimalInputCount(
    availableCount: number,
    privacyMode: string
  ): number {
    // Calculate optimal number of inputs for privacy
    switch (privacyMode) {
      case 'maximum':
        return Math.min(Math.max(5, Math.ceil(availableCount * 0.1)), 15);
      case 'high':
        return Math.min(Math.max(3, Math.ceil(availableCount * 0.05)), 10);
      case 'normal':
      default:
        return Math.min(Math.max(2, Math.ceil(availableCount * 0.02)), 6);
    }
  }

  private selectDiverseSet(
    available: Array<{ utxo: UtxoInfo; privacyScore: number }>,
    maxCount: number,
    context: SelectionContext
  ): Array<{ utxo: UtxoInfo; privacyScore: number }> {
    // Sort by privacy score
    const sorted = available.sort((a, b) => b.privacyScore - a.privacyScore);
    
    const selected: Array<{ utxo: UtxoInfo; privacyScore: number }> = [];
    const diversityBuckets = this.createDiversityBuckets(sorted);
    
    // Select from different buckets to ensure diversity
    let bucketIndex = 0;
    const bucketKeys = Object.keys(diversityBuckets);
    
    while (selected.length < maxCount && bucketKeys.length > 0) {
      const currentBucket = bucketKeys[bucketIndex % bucketKeys.length];
      const bucket = diversityBuckets[currentBucket];
      
      if (bucket.length > 0) {
        // Select best from this bucket
        const item = bucket.shift()!;
        selected.push(item);
        
        // Remove empty buckets
        if (bucket.length === 0) {
          delete diversityBuckets[currentBucket];
          bucketKeys.splice(bucketKeys.indexOf(currentBucket), 1);
        }
      }
      
      bucketIndex++;
    }
    
    return selected;
  }

  private createDiversityBuckets(
    utxos: Array<{ utxo: UtxoInfo; privacyScore: number }>
  ): Record<string, Array<{ utxo: UtxoInfo; privacyScore: number }>> {
    const buckets: Record<string, Array<{ utxo: UtxoInfo; privacyScore: number }>> = {};
    
    for (const item of utxos) {
      // Create bucket key based on amount range and age
      const amount = Number(item.utxo.amount);
      const age = Date.now() - Number(item.utxo.detectedAt);
      const ageDays = Math.floor(age / (24 * 60 * 60 * 1000));
      
      let amountBucket = 'small';
      if (amount > 10000000) amountBucket = 'large';
      else if (amount > 1000000) amountBucket = 'medium';
      
      let ageBucket = 'fresh';
      if (ageDays > 30) ageBucket = 'old';
      else if (ageDays > 7) ageBucket = 'mature';
      
      const bucketKey = `${amountBucket}_${ageBucket}`;
      
      if (!buckets[bucketKey]) {
        buckets[bucketKey] = [];
      }
      
      buckets[bucketKey].push(item);
    }
    
    // Sort each bucket by privacy score
    for (const bucket of Object.values(buckets)) {
      bucket.sort((a, b) => b.privacyScore - a.privacyScore);
    }
    
    return buckets;
  }

  private selectNextPrivacyUtxo(
    available: Array<{ utxo: UtxoInfo; privacyScore: number }>,
    alreadySelected: UtxoInfo[]
  ): { utxo: UtxoInfo; privacyScore: number } | null {
    if (available.length === 0) return null;
    
    // Calculate diversity bonus for each candidate
    const candidates = available.map(item => ({
      ...item,
      diversityBonus: this.calculateDiversityBonus(item.utxo, alreadySelected)
    }));
    
    // Sort by combined score
    candidates.sort((a, b) => 
      (b.privacyScore + b.diversityBonus) - (a.privacyScore + a.diversityBonus)
    );
    
    return candidates[0];
  }

  private calculateDiversityBonus(utxo: UtxoInfo, selected: UtxoInfo[]): number {
    let bonus = 0;
    
    const amount = Number(utxo.amount);
    const age = Date.now() - Number(utxo.detectedAt);
    
    // Check diversity against already selected UTXOs
    for (const selectedUtxo of selected) {
      const selectedAmount = Number(selectedUtxo.amount);
      const selectedAge = Date.now() - Number(selectedUtxo.detectedAt);
      
      // Amount diversity bonus
      const amountRatio = Math.min(amount, selectedAmount) / Math.max(amount, selectedAmount);
      if (amountRatio < 0.5) {
        bonus += 0.2; // Bonus for different amount ranges
      }
      
      // Age diversity bonus
      const ageDiff = Math.abs(age - selectedAge);
      if (ageDiff > 7 * 24 * 60 * 60 * 1000) { // More than 7 days difference
        bonus += 0.1;
      }
      
      // Feature diversity bonus
      if (utxo.features !== selectedUtxo.features) {
        bonus += 0.1;
      }
    }
    
    return bonus;
  }

  private selectAdditionalPrivacyUtxo(
    available: Array<{ utxo: UtxoInfo; privacyScore: number }>
  ): { utxo: UtxoInfo; privacyScore: number } | null {
    if (available.length === 0) return null;
    
    // For additional privacy UTXOs, prefer smaller amounts
    const sorted = available.sort((a, b) => {
      const aAmount = Number(a.utxo.amount);
      const bAmount = Number(b.utxo.amount);
      
      // Combine privacy score with size preference
      const aScore = a.privacyScore - (aAmount / 10000000); // Penalty for large amounts
      const bScore = b.privacyScore - (bAmount / 10000000);
      
      return bScore - aScore;
    });
    
    return sorted[0];
  }

  private createPrivacyResult(
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

    const required = BigInt(context.targetAmount) + BigInt(estimatedFee);
    const success = BigInt(totalAmount) >= required;
    
    const changeAmount = success 
      ? (BigInt(totalAmount) - required) as MicroTari
      : 0n as MicroTari;

    // Enhanced privacy score calculation
    const privacyScore = this.calculateEnhancedPrivacyScore(selected, context);

    return this.createResult(
      selected,
      context,
      {
        feeOptimization: this.calculatePrivacyFeeOptimization(selected.length),
        privacyScore: privacyScore,
        perfectMatch: changeAmount === 0n,
        waste: changeAmount,
        changeAmount,
        algorithmData: {
          privacyOptimized: true,
          inputDiversity: this.calculateInputDiversity(selected),
          ageDistribution: this.calculateAgeDistribution(selected),
          amountDistribution: this.calculateAmountDistribution(selected),
          privacyMode: context.privacyMode || 'normal'
        }
      },
      startTime,
      candidatesCount
    );
  }

  private calculateEnhancedPrivacyScore(
    selected: UtxoInfo[],
    context: SelectionContext
  ): number {
    let score = this.calculatePrivacyScore(selected, context);
    
    // Additional privacy factors
    
    // Input count bonus
    const inputBonus = Math.min(selected.length / 10, 0.3);
    score += inputBonus;
    
    // Diversity bonus
    const diversityBonus = this.calculateInputDiversity(selected) * 0.2;
    score += diversityBonus;
    
    // Age spread bonus
    const ageSpread = this.calculateAgeSpread(selected);
    score += ageSpread * 0.1;
    
    return Math.min(score, 1.0);
  }

  private calculateInputDiversity(selected: UtxoInfo[]): number {
    if (selected.length <= 1) return 0;
    
    const amounts = selected.map(utxo => Number(utxo.amount));
    const mean = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    
    const variance = amounts.reduce((sum, amt) => {
      const diff = amt - mean;
      return sum + (diff * diff);
    }, 0) / amounts.length;
    
    const stdDev = Math.sqrt(variance);
    const coefficient = mean > 0 ? stdDev / mean : 0;
    
    return Math.min(coefficient, 1);
  }

  private calculateAgeDistribution(selected: UtxoInfo[]): Record<string, number> {
    const distribution = { fresh: 0, recent: 0, mature: 0, old: 0 };
    const now = Date.now();
    
    for (const utxo of selected) {
      const age = now - Number(utxo.detectedAt);
      const days = age / (24 * 60 * 60 * 1000);
      
      if (days < 1) distribution.fresh++;
      else if (days < 7) distribution.recent++;
      else if (days < 30) distribution.mature++;
      else distribution.old++;
    }
    
    return distribution;
  }

  private calculateAmountDistribution(selected: UtxoInfo[]): Record<string, number> {
    const distribution = { small: 0, medium: 0, large: 0 };
    
    for (const utxo of selected) {
      const amount = Number(utxo.amount);
      
      if (amount < 1000000) distribution.small++;
      else if (amount < 10000000) distribution.medium++;
      else distribution.large++;
    }
    
    return distribution;
  }

  private calculateAgeSpread(selected: UtxoInfo[]): number {
    if (selected.length <= 1) return 0;
    
    const ages = selected.map(utxo => Number(utxo.detectedAt));
    const minAge = Math.min(...ages);
    const maxAge = Math.max(...ages);
    
    const spread = maxAge - minAge;
    const spreadDays = spread / (24 * 60 * 60 * 1000);
    
    return Math.min(spreadDays / 30, 1); // Normalize to 30 days max
  }

  private calculatePrivacyFeeOptimization(inputCount: number): number {
    // Privacy strategies sacrifice fee optimization for privacy
    // Score reflects this trade-off
    return Math.max(0.1, 0.5 - (inputCount - 2) * 0.05);
  }
}
