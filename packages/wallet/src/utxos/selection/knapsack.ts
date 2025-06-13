/**
 * @fileoverview Knapsack UTXO Selection Strategy
 * 
 * Implements a knapsack-based optimization algorithm for UTXO selection
 * that balances fee optimization with selection efficiency.
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
 * Knapsack selection strategy
 * 
 * This strategy treats UTXO selection as a variant of the knapsack problem,
 * where we want to minimize waste while staying above the target amount.
 * 
 * Advantages:
 * - Good balance between optimality and performance
 * - Considers value-to-cost ratio
 * - Works well for medium-sized UTXO sets
 * 
 * Disadvantages:
 * - More complex than greedy algorithms
 * - May not find global optimum
 * - Performance depends on UTXO distribution
 */
export class KnapsackStrategy extends SelectionStrategy {
  private static readonly MAX_ITERATIONS = 1000;
  
  constructor() {
    super('knapsack');
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
      throw new Error('No suitable UTXOs available for selection');
    }

    // Convert to knapsack items
    const items = this.createKnapsackItems(filtered, context);
    
    // Sort by value-to-weight ratio
    items.sort((a, b) => b.ratio - a.ratio);
    
    // Try different approaches
    const selections = await Promise.all([
      this.greedyKnapsack(items, context),
      this.dynamicKnapsack(items, context),
      this.heuristicKnapsack(items, context)
    ]);

    // Select best result
    const bestSelection = this.selectBestResult(selections, context);
    
    return this.createSelectionResult(
      bestSelection,
      context,
      startTime,
      candidates.length
    );
  }

  private createKnapsackItems(
    utxos: UtxoInfo[],
    context: SelectionContext
  ): KnapsackItem[] {
    return utxos.map(utxo => {
      const value = Number(utxo.amount);
      const weight = this.calculateWeight(utxo, context);
      const ratio = weight > 0 ? value / weight : value;
      
      return {
        utxo,
        value,
        weight,
        ratio,
        effectiveValue: value - weight
      };
    });
  }

  private calculateWeight(utxo: UtxoInfo, context: SelectionContext): number {
    // Weight represents the "cost" of including this UTXO
    const inputCost = 100 * Number(context.feePerGram); // Approximate input size cost
    
    let weight = inputCost;
    
    // Add penalties for various factors
    
    // Age penalty (prefer older UTXOs for privacy)
    const age = Date.now() - Number(utxo.detectedAt);
    const ageDays = age / (24 * 60 * 60 * 1000);
    if (ageDays < 1) {
      weight += inputCost * 0.1; // 10% penalty for very fresh UTXOs
    }
    
    // Round amount penalty (prefer non-round amounts for privacy)
    const amount = Number(utxo.amount);
    if (amount % 1000000 === 0) {
      weight += inputCost * 0.05; // 5% penalty for round amounts
    }
    
    return Math.max(weight, 1); // Ensure positive weight
  }

  private async greedyKnapsack(
    items: KnapsackItem[],
    context: SelectionContext
  ): Promise<KnapsackItem[]> {
    const selected: KnapsackItem[] = [];
    let totalValue = 0;
    const target = Number(context.targetAmount);
    const maxInputs = context.maxInputs || items.length;

    // Greedy selection by ratio
    for (const item of items) {
      if (selected.length >= maxInputs) break;
      
      selected.push(item);
      totalValue += item.effectiveValue;
      
      // Check if we have enough
      const estimatedFee = this.estimateFeeCost(selected.length, context);
      if (totalValue >= target + estimatedFee) {
        break;
      }
    }

    return selected;
  }

  private async dynamicKnapsack(
    items: KnapsackItem[],
    context: SelectionContext
  ): Promise<KnapsackItem[]> {
    // Simplified dynamic programming approach
    // Limited to reasonable sizes for performance
    
    if (items.length > 50) {
      return this.greedyKnapsack(items, context); // Fallback for large sets
    }

    const target = Number(context.targetAmount);
    const maxInputs = Math.min(context.maxInputs || items.length, 20);
    
    // DP table: dp[i][w] = best value using first i items with weight <= w
    const maxWeight = target * 2; // Reasonable weight limit
    const dp: number[][] = Array(items.length + 1)
      .fill(null)
      .map(() => Array(maxWeight + 1).fill(0));
    
    const keep: boolean[][] = Array(items.length + 1)
      .fill(null)
      .map(() => Array(maxWeight + 1).fill(false));

    // Fill DP table
    for (let i = 1; i <= items.length; i++) {
      const item = items[i - 1];
      
      for (let w = 0; w <= maxWeight; w++) {
        // Don't take item
        dp[i][w] = dp[i - 1][w];
        
        // Take item if possible
        if (w >= item.weight && item.effectiveValue > 0) {
          const newValue = dp[i - 1][w - item.weight] + item.effectiveValue;
          if (newValue > dp[i][w]) {
            dp[i][w] = newValue;
            keep[i][w] = true;
          }
        }
      }
    }

    // Backtrack to find solution
    const selected: KnapsackItem[] = [];
    let w = maxWeight;
    
    for (let i = items.length; i > 0 && selected.length < maxInputs; i--) {
      if (keep[i][w]) {
        selected.push(items[i - 1]);
        w -= items[i - 1].weight;
      }
    }

    return selected.reverse();
  }

  private async heuristicKnapsack(
    items: KnapsackItem[],
    context: SelectionContext
  ): Promise<KnapsackItem[]> {
    // Heuristic approach with random restarts
    const target = Number(context.targetAmount);
    const maxInputs = context.maxInputs || items.length;
    
    let bestSelection: KnapsackItem[] = [];
    let bestScore = -Infinity;
    
    const attempts = Math.min(10, Math.ceil(items.length / 5));
    
    for (let attempt = 0; attempt < attempts; attempt++) {
      const selected: KnapsackItem[] = [];
      let totalValue = 0;
      const available = [...items];
      
      // Shuffle for randomness
      for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
      }
      
      // Select based on weighted probability
      while (selected.length < maxInputs && available.length > 0) {
        const probabilities = available.map(item => 
          Math.max(0.1, item.ratio / 1000) // Normalize ratios
        );
        
        const selectedIndex = this.weightedRandomChoice(probabilities);
        const item = available[selectedIndex];
        
        selected.push(item);
        totalValue += item.effectiveValue;
        available.splice(selectedIndex, 1);
        
        const estimatedFee = this.estimateFeeCost(selected.length, context);
        if (totalValue >= target + estimatedFee) {
          break;
        }
      }
      
      // Score this selection
      const score = this.scoreSelection(selected, context);
      if (score > bestScore) {
        bestScore = score;
        bestSelection = selected;
      }
    }

    return bestSelection;
  }

  private weightedRandomChoice(weights: number[]): number {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return i;
      }
    }
    
    return weights.length - 1;
  }

  private scoreSelection(selected: KnapsackItem[], context: SelectionContext): number {
    if (selected.length === 0) return -Infinity;
    
    const totalValue = selected.reduce((sum, item) => sum + item.effectiveValue, 0);
    const target = Number(context.targetAmount);
    const estimatedFee = this.estimateFeeCost(selected.length, context);
    
    if (totalValue < target + estimatedFee) {
      return -Infinity; // Insufficient funds
    }
    
    const waste = totalValue - target - estimatedFee;
    const efficiency = totalValue / selected.length; // Value per input
    
    // Combine metrics (minimize waste, maximize efficiency)
    return efficiency - waste * 0.1;
  }

  private selectBestResult(
    selections: KnapsackItem[][],
    context: SelectionContext
  ): KnapsackItem[] {
    let bestSelection = selections[0];
    let bestScore = this.scoreSelection(bestSelection, context);
    
    for (let i = 1; i < selections.length; i++) {
      const score = this.scoreSelection(selections[i], context);
      if (score > bestScore) {
        bestScore = score;
        bestSelection = selections[i];
      }
    }
    
    return bestSelection;
  }

  private createSelectionResult(
    selected: KnapsackItem[],
    context: SelectionContext,
    startTime: number,
    candidatesCount: number
  ): UtxoSelection {
    const utxos = selected.map(item => item.utxo);
    const totalAmount = selected.reduce(
      (sum, item) => sum + BigInt(item.utxo.amount), 0n
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
      utxos,
      context,
      {
        feeOptimization: this.calculateFeeOptimization(selected),
        perfectMatch: changeAmount === 0n,
        waste: changeAmount,
        changeAmount,
        algorithmData: {
          algorithmsUsed: ['greedy', 'dynamic_programming', 'heuristic'],
          bestAlgorithm: this.identifyBestAlgorithm(selected),
          valueToWeightRatio: this.calculateAverageRatio(selected),
          selectionEfficiency: this.calculateSelectionEfficiency(selected, context)
        }
      },
      startTime,
      candidatesCount
    );
  }

  private estimateFeeCost(inputCount: number, context: SelectionContext): number {
    return Number(this.estimateFee(inputCount, context.feePerGram, true));
  }

  private calculateFeeOptimization(selected: KnapsackItem[]): number {
    if (selected.length === 0) return 0;
    
    const avgRatio = this.calculateAverageRatio(selected);
    // Higher ratios indicate better value-to-cost optimization
    return Math.min(1, avgRatio / 1000);
  }

  private calculateAverageRatio(selected: KnapsackItem[]): number {
    if (selected.length === 0) return 0;
    
    const totalRatio = selected.reduce((sum, item) => sum + item.ratio, 0);
    return totalRatio / selected.length;
  }

  private calculateSelectionEfficiency(
    selected: KnapsackItem[],
    context: SelectionContext
  ): number {
    if (selected.length === 0) return 0;
    
    const totalValue = selected.reduce((sum, item) => sum + item.effectiveValue, 0);
    const target = Number(context.targetAmount);
    
    return target / totalValue; // Closer to 1.0 is better
  }

  private identifyBestAlgorithm(selected: KnapsackItem[]): string {
    // Simple heuristic to identify which algorithm likely produced this result
    if (selected.length <= 2) return 'greedy';
    if (selected.length > 10) return 'heuristic';
    return 'dynamic_programming';
  }
}

interface KnapsackItem {
  utxo: UtxoInfo;
  value: number;
  weight: number;
  ratio: number;
  effectiveValue: number;
}
