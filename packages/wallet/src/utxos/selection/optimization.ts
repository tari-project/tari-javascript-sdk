/**
 * @fileoverview UTXO Selection Optimization Utilities
 * 
 * Provides optimization algorithms and utilities for improving
 * UTXO selection results across different criteria.
 */

import {
  UtxoInfo,
  MicroTari
} from '@tari-project/tarijs-core';

import {
  SelectionContext,
  UtxoSelection
} from './strategy.js';

/**
 * Optimization goals for UTXO selection
 */
export type OptimizationGoal = 
  | 'minimize_fee'
  | 'maximize_privacy'
  | 'minimize_inputs'
  | 'minimize_waste'
  | 'balanced';

/**
 * Optimization result with detailed analysis
 */
export interface OptimizationResult {
  /** Original selection */
  original: UtxoSelection;
  
  /** Optimized selection */
  optimized: UtxoSelection;
  
  /** Improvement metrics */
  improvements: {
    feeReduction?: number;
    privacyIncrease?: number;
    inputReduction?: number;
    wasteReduction?: number;
  };
  
  /** Whether optimization was successful */
  improved: boolean;
  
  /** Optimization algorithm used */
  algorithm: string;
}

/**
 * UTXO selection optimization utilities
 */
export class OptimizationStrategy {

  /**
   * Optimize a selection for a specific goal
   */
  public static async optimize(
    selection: UtxoSelection,
    allCandidates: UtxoInfo[],
    context: SelectionContext,
    goal: OptimizationGoal
  ): Promise<OptimizationResult> {
    switch (goal) {
      case 'minimize_fee':
        return this.optimizeForFee(selection, allCandidates, context);
      
      case 'maximize_privacy':
        return this.optimizeForPrivacy(selection, allCandidates, context);
      
      case 'minimize_inputs':
        return this.optimizeForInputCount(selection, allCandidates, context);
      
      case 'minimize_waste':
        return this.optimizeForWaste(selection, allCandidates, context);
      
      case 'balanced':
        return this.optimizeBalanced(selection, allCandidates, context);
      
      default:
        throw new Error(`Unknown optimization goal: ${goal}`);
    }
  }

  /**
   * Optimize selection to minimize transaction fees
   */
  private static async optimizeForFee(
    selection: UtxoSelection,
    allCandidates: UtxoInfo[],
    context: SelectionContext
  ): Promise<OptimizationResult> {
    // Try to reduce the number of inputs while maintaining sufficient funds
    const targetAmount = BigInt(context.targetAmount);
    const selectedUtxos = [...selection.selected];
    
    // Sort by amount descending to prefer larger UTXOs
    const sortedCandidates = allCandidates
      .filter(utxo => !selectedUtxos.some(s => s.id === utxo.id))
      .sort((a, b) => {
        const diff = BigInt(b.amount) - BigInt(a.amount);
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
      });

    // Try to replace multiple small UTXOs with fewer large ones
    let optimized = [...selectedUtxos];
    let improved = false;

    for (let i = 0; i < optimized.length - 1; i++) {
      for (let j = i + 1; j < optimized.length; j++) {
        const utxo1 = optimized[i];
        const utxo2 = optimized[j];
        const combinedAmount = BigInt(utxo1.amount) + BigInt(utxo2.amount);

        // Try to find a single UTXO that can replace both
        const replacement = sortedCandidates.find(candidate => 
          BigInt(candidate.amount) >= combinedAmount * 95n / 100n &&
          BigInt(candidate.amount) <= combinedAmount * 110n / 100n
        );

        if (replacement) {
          // Test if we still have enough funds
          const testSelection = optimized
            .filter((_, idx) => idx !== i && idx !== j)
            .concat([replacement]);
          
          const testTotal = testSelection.reduce(
            (sum, utxo) => sum + BigInt(utxo.amount), 0n
          );
          
          const testFee = this.estimateFee(testSelection.length, context.feePerGram);
          
          if (testTotal >= targetAmount + BigInt(testFee)) {
            optimized = testSelection;
            improved = true;
            break;
          }
        }
      }
      
      if (improved) break;
    }

    return this.createOptimizationResult(
      selection,
      this.createOptimizedSelection(optimized, context),
      'fee_minimization'
    );
  }

  /**
   * Optimize selection to maximize privacy
   */
  private static async optimizeForPrivacy(
    selection: UtxoSelection,
    allCandidates: UtxoInfo[],
    context: SelectionContext
  ): Promise<OptimizationResult> {
    const selectedUtxos = [...selection.selected];
    const targetAmount = BigInt(context.targetAmount);
    
    // Add more UTXOs if we have room and funds permit
    const availableUtxos = allCandidates
      .filter(utxo => !selectedUtxos.some(s => s.id === utxo.id))
      .sort((a, b) => this.calculatePrivacyScore(b) - this.calculatePrivacyScore(a));

    let optimized = [...selectedUtxos];
    const maxInputs = context.maxInputs || 10;

    // Add UTXOs for better mixing if we have space
    for (const candidate of availableUtxos) {
      if (optimized.length >= maxInputs) break;

      const testSelection = [...optimized, candidate];
      const testTotal = testSelection.reduce(
        (sum, utxo) => sum + BigInt(utxo.amount), 0n
      );
      
      const testFee = this.estimateFee(testSelection.length, context.feePerGram);
      
      // Only add if it doesn't create excessive waste
      const waste = testTotal - targetAmount - BigInt(testFee);
      const currentWaste = BigInt(selection.metadata.waste);
      
      if (waste <= currentWaste * 150n / 100n) { // Allow 50% more waste for privacy
        optimized.push(candidate);
      }
    }

    return this.createOptimizationResult(
      selection,
      this.createOptimizedSelection(optimized, context),
      'privacy_maximization'
    );
  }

  /**
   * Optimize selection to minimize number of inputs
   */
  private static async optimizeForInputCount(
    selection: UtxoSelection,
    allCandidates: UtxoInfo[],
    context: SelectionContext
  ): Promise<OptimizationResult> {
    const targetAmount = BigInt(context.targetAmount);
    
    // Sort all candidates by amount descending
    const sortedCandidates = allCandidates
      .sort((a, b) => {
        const diff = BigInt(b.amount) - BigInt(a.amount);
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
      });

    // Greedy selection of largest UTXOs
    let optimized: UtxoInfo[] = [];
    let totalAmount = 0n;

    for (const utxo of sortedCandidates) {
      optimized.push(utxo);
      totalAmount += BigInt(utxo.amount);

      const estimatedFee = this.estimateFee(optimized.length, context.feePerGram);
      
      if (totalAmount >= targetAmount + BigInt(estimatedFee)) {
        break;
      }
    }

    return this.createOptimizationResult(
      selection,
      this.createOptimizedSelection(optimized, context),
      'input_minimization'
    );
  }

  /**
   * Optimize selection to minimize waste
   */
  private static async optimizeForWaste(
    selection: UtxoSelection,
    allCandidates: UtxoInfo[],
    context: SelectionContext
  ): Promise<OptimizationResult> {
    const targetAmount = BigInt(context.targetAmount);
    
    // Try to find exact or near-exact matches
    let bestSelection = selection.selected;
    let bestWaste = BigInt(selection.metadata.waste);

    // Try all reasonable combinations (limited for performance)
    const maxCombinations = Math.min(Math.pow(2, allCandidates.length), 10000);
    
    for (let mask = 1; mask < maxCombinations; mask++) {
      const testUtxos: UtxoInfo[] = [];
      let testTotal = 0n;
      
      for (let i = 0; i < allCandidates.length; i++) {
        if (mask & (1 << i)) {
          testUtxos.push(allCandidates[i]);
          testTotal += BigInt(allCandidates[i].amount);
        }
      }
      
      if (testUtxos.length > (context.maxInputs || 10)) continue;
      
      const testFee = this.estimateFee(testUtxos.length, context.feePerGram);
      const required = targetAmount + BigInt(testFee);
      
      if (testTotal >= required) {
        const waste = testTotal - required;
        
        if (waste < bestWaste) {
          bestWaste = waste;
          bestSelection = testUtxos;
          
          if (waste === 0n) break; // Perfect match found
        }
      }
    }

    return this.createOptimizationResult(
      selection,
      this.createOptimizedSelection(bestSelection, context),
      'waste_minimization'
    );
  }

  /**
   * Optimize selection with balanced criteria
   */
  private static async optimizeBalanced(
    selection: UtxoSelection,
    allCandidates: UtxoInfo[],
    context: SelectionContext
  ): Promise<OptimizationResult> {
    // Try multiple optimization approaches and pick the best balanced result
    const [feeOpt, privacyOpt, wasteOpt] = await Promise.all([
      this.optimizeForFee(selection, allCandidates, context),
      this.optimizeForPrivacy(selection, allCandidates, context),
      this.optimizeForWaste(selection, allCandidates, context)
    ]);

    // Score each result based on balanced criteria
    const feeScore = this.calculateBalancedScore(feeOpt.optimized);
    const privacyScore = this.calculateBalancedScore(privacyOpt.optimized);
    const wasteScore = this.calculateBalancedScore(wasteOpt.optimized);

    let bestResult = feeOpt;
    let bestScore = feeScore;

    if (privacyScore > bestScore) {
      bestResult = privacyOpt;
      bestScore = privacyScore;
    }

    if (wasteScore > bestScore) {
      bestResult = wasteOpt;
      bestScore = wasteScore;
    }

    return {
      ...bestResult,
      algorithm: 'balanced_optimization'
    };
  }

  // Helper methods

  private static calculatePrivacyScore(utxo: UtxoInfo): number {
    let score = 1.0;
    
    // Age bonus
    const age = Date.now() - Number(utxo.detectedAt);
    const ageDays = age / (24 * 60 * 60 * 1000);
    if (ageDays > 7) score += 0.3;
    
    // Amount diversity
    const amount = Number(utxo.amount);
    if (amount % 1000000 !== 0) score += 0.2; // Non-round amounts
    
    return score;
  }

  private static calculateBalancedScore(selection: UtxoSelection): number {
    // Balanced scoring considers multiple factors
    let score = 0;
    
    // Fee efficiency (30% weight)
    const feeEfficiency = selection.metadata.feeOptimization;
    score += feeEfficiency * 0.3;
    
    // Privacy score (25% weight)
    const privacyScore = selection.metadata.privacyScore;
    score += privacyScore * 0.25;
    
    // Input efficiency (25% weight) - fewer inputs is better
    const inputEfficiency = Math.max(0, 1 - (selection.selected.length - 1) * 0.1);
    score += inputEfficiency * 0.25;
    
    // Waste efficiency (20% weight) - less waste is better
    const waste = Number(selection.metadata.waste);
    const wasteEfficiency = Math.max(0, 1 - waste / 1000000); // Normalize by 1M
    score += wasteEfficiency * 0.2;
    
    return score;
  }

  private static estimateFee(inputCount: number, feePerGram: MicroTari): MicroTari {
    const baseSize = 100;
    const inputSize = 100;
    const outputSize = 50;
    
    const totalSize = baseSize + (inputCount * inputSize) + (2 * outputSize);
    return BigInt(Math.ceil(totalSize * Number(feePerGram))) as MicroTari;
  }

  private static createOptimizedSelection(
    utxos: UtxoInfo[],
    context: SelectionContext
  ): UtxoSelection {
    const totalAmount = utxos.reduce(
      (sum, utxo) => sum + BigInt(utxo.amount), 0n
    ) as MicroTari;

    const estimatedFee = this.estimateFee(utxos.length, context.feePerGram);
    const required = BigInt(context.targetAmount) + BigInt(estimatedFee);
    const success = BigInt(totalAmount) >= required;
    
    const changeAmount = success 
      ? (BigInt(totalAmount) - required) as MicroTari
      : 0n as MicroTari;

    return {
      selected: utxos,
      totalAmount,
      changeAmount,
      estimatedFee,
      success,
      algorithm: 'optimized',
      metadata: {
        candidatesConsidered: utxos.length,
        selectionTime: 0,
        feeOptimization: 0.8, // Placeholder
        privacyScore: 0.7, // Placeholder
        perfectMatch: changeAmount === 0n,
        waste: changeAmount,
        changeAmount: changeAmount
      }
    };
  }

  private static createOptimizationResult(
    original: UtxoSelection,
    optimized: UtxoSelection,
    algorithm: string
  ): OptimizationResult {
    const improvements = {
      feeReduction: Number(original.estimatedFee) - Number(optimized.estimatedFee),
      privacyIncrease: optimized.metadata.privacyScore - original.metadata.privacyScore,
      inputReduction: original.selected.length - optimized.selected.length,
      wasteReduction: Number(original.metadata.waste) - Number(optimized.metadata.waste)
    };

    const improved = Object.values(improvements).some(improvement => improvement > 0);

    return {
      original,
      optimized,
      improvements,
      improved,
      algorithm
    };
  }
}
