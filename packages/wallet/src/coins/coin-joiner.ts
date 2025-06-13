/**
 * @fileoverview Coin Joiner for Tari Wallet
 * 
 * Implements coin joining functionality for UTXO consolidation
 * with intelligent selection and optimization strategies.
 */

import {
  UtxoInfo,
  MicroTari,
  TransactionId,
  WalletError,
  WalletErrorCode,
  type WalletHandle
} from '@tari-project/tarijs-core';

import { UtxoService } from '../utxos/utxo-service.js';
import type { CoinOperationProgressCallback } from './coin-service.js';

/**
 * Coin join options
 */
export interface CoinJoinOptions {
  /** Fee per gram for the transaction */
  feePerGram?: MicroTari;
  
  /** Join strategy to use */
  strategy?: 'smallest_first' | 'oldest_first' | 'mixed' | 'optimal';
  
  /** Maximum number of UTXOs to join */
  maxInputs?: number;
  
  /** Minimum UTXO amount to consider */
  minAmount?: MicroTari;
  
  /** Maximum UTXO amount to consider */
  maxAmount?: MicroTari;
  
  /** Lock height for output */
  lockHeight?: bigint;
  
  /** Message for transaction */
  message?: string;
  
  /** Whether to prioritize fee reduction */
  prioritizeFeeReduction?: boolean;
}

/**
 * Join operation result
 */
export interface JoinResult {
  /** Transaction ID */
  transactionId: TransactionId;
  
  /** Input UTXOs used */
  inputUtxos: UtxoInfo[];
  
  /** Join strategy used */
  strategy: string;
  
  /** Total amount consolidated */
  totalAmount: MicroTari;
  
  /** Total transaction fee */
  totalFee: MicroTari;
  
  /** Fee savings from consolidation */
  feeSavings: MicroTari;
}

/**
 * UTXO consolidation analysis
 */
export interface ConsolidationAnalysis {
  /** UTXOs recommended for joining */
  recommendedUtxos: UtxoInfo[];
  
  /** Estimated fee for join operation */
  joinFee: MicroTari;
  
  /** Estimated future fee savings */
  futureSavings: MicroTari;
  
  /** Net benefit of consolidation */
  netBenefit: MicroTari;
  
  /** Consolidation efficiency score (0-1) */
  efficiencyScore: number;
  
  /** Reasoning for recommendation */
  reasoning: string;
}

/**
 * Coin joiner implementation
 */
export class CoinJoiner {
  private readonly walletHandle: WalletHandle;
  private readonly utxoService: UtxoService;

  constructor(walletHandle: WalletHandle, utxoService: UtxoService) {
    this.walletHandle = walletHandle;
    this.utxoService = utxoService;
  }

  /**
   * Join coins with specified parameters
   */
  public async join(
    utxoIds?: string[],
    options?: CoinJoinOptions,
    onProgress?: CoinOperationProgressCallback
  ): Promise<JoinResult> {
    try {
      onProgress?.({
        phase: 'selecting_utxos',
        percentage: 40,
        message: 'Selecting UTXOs for consolidation'
      });

      // Select UTXOs to join
      const selectedUtxos = await this.selectUtxosForJoin(utxoIds, options);
      
      if (selectedUtxos.length < 2) {
        throw new WalletError(
          WalletErrorCode.CoinJoinMinimumUtxos,
          'At least 2 UTXOs required for join operation'
        );
      }

      onProgress?.({
        phase: 'calculating_consolidation',
        percentage: 60,
        message: 'Calculating consolidation benefits'
      });

      // Calculate totals and fees
      const totalAmount = selectedUtxos.reduce(
        (sum, utxo) => sum + BigInt(utxo.amount), 0n
      ) as MicroTari;

      const joinFee = await this.calculateJoinFee(selectedUtxos.length, options?.feePerGram);
      const feeSavings = await this.calculateFeeSavings(selectedUtxos, options?.feePerGram);
      
      onProgress?.({
        phase: 'executing_join',
        percentage: 80,
        message: 'Executing coin join transaction'
      });

      // Execute the join transaction
      const transactionId = await this.executeJoin(selectedUtxos, options);

      return {
        transactionId,
        inputUtxos: selectedUtxos,
        strategy: options?.strategy || 'optimal',
        totalAmount,
        totalFee: joinFee,
        feeSavings
      };
      
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.CoinJoinExecutionFailed,
        'Coin join execution failed',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get recommended join configuration
   */
  public async getRecommendedJoin(): Promise<{
    recommendedUtxos: string[];
    estimatedFee: MicroTari;
    consolidationBenefit: number;
    reasoning: string;
  }> {
    const analysis = await this.analyzeConsolidationOpportunities();
    
    return {
      recommendedUtxos: analysis.recommendedUtxos.map(utxo => utxo.id),
      estimatedFee: analysis.joinFee,
      consolidationBenefit: Number(analysis.netBenefit),
      reasoning: analysis.reasoning
    };
  }

  /**
   * Analyze consolidation opportunities
   */
  public async analyzeConsolidationOpportunities(): Promise<ConsolidationAnalysis> {
    // Get all spendable UTXOs
    const utxos = await this.utxoService.getSpendable();
    
    if (utxos.length < 2) {
      return {
        recommendedUtxos: [],
        joinFee: 0n as MicroTari,
        futureSavings: 0n as MicroTari,
        netBenefit: 0n as MicroTari,
        efficiencyScore: 0,
        reasoning: 'Insufficient UTXOs for consolidation'
      };
    }

    // Find optimal consolidation set
    const optimalSet = await this.findOptimalConsolidationSet(utxos);
    
    if (optimalSet.length < 2) {
      return {
        recommendedUtxos: [],
        joinFee: 0n as MicroTari,
        futureSavings: 0n as MicroTari,
        netBenefit: 0n as MicroTari,
        efficiencyScore: 0,
        reasoning: 'No beneficial consolidation opportunities found'
      };
    }

    const joinFee = await this.calculateJoinFee(optimalSet.length);
    const futureSavings = await this.calculateFeeSavings(optimalSet);
    const netBenefit = (BigInt(futureSavings) - BigInt(joinFee)) as MicroTari;
    const efficiencyScore = this.calculateEfficiencyScore(optimalSet, joinFee, futureSavings);
    
    let reasoning = `Consolidating ${optimalSet.length} UTXOs will cost `;
    reasoning += `${Number(joinFee).toLocaleString()} but save approximately `;
    reasoning += `${Number(futureSavings).toLocaleString()} in future transaction fees. `;
    reasoning += `Net benefit: ${Number(netBenefit).toLocaleString()}`;

    return {
      recommendedUtxos: optimalSet,
      joinFee,
      futureSavings,
      netBenefit,
      efficiencyScore,
      reasoning
    };
  }

  /**
   * Estimate join operation cost
   */
  public async estimateCost(
    utxoIds?: string[],
    options?: CoinJoinOptions
  ): Promise<{
    estimatedFee: MicroTari;
    transactionSize: number;
    savings: MicroTari;
    breakdown: {
      baseFee: MicroTari;
      inputFees: MicroTari;
      outputFee: MicroTari;
    };
  }> {
    // Determine UTXOs to analyze
    let utxos: UtxoInfo[];
    
    if (utxoIds) {
      utxos = [];
      for (const id of utxoIds) {
        const utxo = await this.utxoService.get(id);
        if (utxo) {
          utxos.push(utxo);
        }
      }
    } else {
      const analysis = await this.analyzeConsolidationOpportunities();
      utxos = analysis.recommendedUtxos;
    }

    if (utxos.length === 0) {
      const zero = 0n as MicroTari;
      return {
        estimatedFee: zero,
        transactionSize: 0,
        savings: zero,
        breakdown: { baseFee: zero, inputFees: zero, outputFee: zero }
      };
    }

    // Calculate transaction size
    const baseSize = 100;
    const inputSize = 100;
    const outputSize = 50;
    const transactionSize = baseSize + (utxos.length * inputSize) + outputSize;
    
    const feePerGram = options?.feePerGram || await this.getDefaultFeePerGram();
    const totalFee = BigInt(Math.ceil(transactionSize * Number(feePerGram))) as MicroTari;
    
    // Calculate savings
    const savings = await this.calculateFeeSavings(utxos, feePerGram);
    
    // Break down fees
    const baseFee = BigInt(Math.ceil(baseSize * Number(feePerGram))) as MicroTari;
    const inputFees = BigInt(Math.ceil(utxos.length * inputSize * Number(feePerGram))) as MicroTari;
    const outputFee = BigInt(Math.ceil(outputSize * Number(feePerGram))) as MicroTari;

    return {
      estimatedFee: totalFee,
      transactionSize,
      savings,
      breakdown: {
        baseFee,
        inputFees,
        outputFee
      }
    };
  }

  // Private implementation methods

  private async selectUtxosForJoin(
    utxoIds?: string[],
    options?: CoinJoinOptions
  ): Promise<UtxoInfo[]> {
    if (utxoIds) {
      // Use specific UTXOs
      const utxos: UtxoInfo[] = [];
      
      for (const id of utxoIds) {
        const utxo = await this.utxoService.get(id);
        if (!utxo) {
          throw new WalletError(
            WalletErrorCode.UtxoNotFound,
            'UTXO not found'
          );
        }
        utxos.push(utxo);
      }
      
      return this.filterUtxosForJoin(utxos, options);
    } else {
      // Auto-select optimal UTXOs
      return this.autoSelectUtxosForJoin(options);
    }
  }

  private async autoSelectUtxosForJoin(options?: CoinJoinOptions): Promise<UtxoInfo[]> {
    const strategy = options?.strategy || 'optimal';
    const allUtxos = await this.utxoService.getSpendable();
    const filteredUtxos = this.filterUtxosForJoin(allUtxos, options);
    
    switch (strategy) {
      case 'smallest_first':
        return this.selectSmallestFirst(filteredUtxos, options);
      
      case 'oldest_first':
        return this.selectOldestFirst(filteredUtxos, options);
      
      case 'mixed':
        return this.selectMixed(filteredUtxos, options);
      
      case 'optimal':
      default:
        return this.selectOptimal(filteredUtxos, options);
    }
  }

  private filterUtxosForJoin(utxos: UtxoInfo[], options?: CoinJoinOptions): UtxoInfo[] {
    return utxos.filter(utxo => {
      // Amount filters
      if (options?.minAmount && BigInt(utxo.amount) < BigInt(options.minAmount)) {
        return false;
      }
      
      if (options?.maxAmount && BigInt(utxo.amount) > BigInt(options.maxAmount)) {
        return false;
      }
      
      return true;
    });
  }

  private selectSmallestFirst(utxos: UtxoInfo[], options?: CoinJoinOptions): UtxoInfo[] {
    const sorted = utxos.sort((a, b) => {
      const diff = BigInt(a.amount) - BigInt(b.amount);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });
    
    const maxInputs = options?.maxInputs || 20;
    return sorted.slice(0, Math.min(maxInputs, sorted.length));
  }

  private selectOldestFirst(utxos: UtxoInfo[], options?: CoinJoinOptions): UtxoInfo[] {
    const sorted = utxos.sort((a, b) => {
      return Number(a.detectedAt) - Number(b.detectedAt);
    });
    
    const maxInputs = options?.maxInputs || 20;
    return sorted.slice(0, Math.min(maxInputs, sorted.length));
  }

  private selectMixed(utxos: UtxoInfo[], options?: CoinJoinOptions): UtxoInfo[] {
    // Mix of small and old UTXOs
    const sorted = utxos.sort((a, b) => {
      const amountScore = Number(a.amount) / 1000000; // Prefer smaller amounts
      const ageScore = (Date.now() - Number(a.detectedAt)) / (24 * 60 * 60 * 1000); // Prefer older
      const aScore = amountScore + ageScore;
      
      const bAmountScore = Number(b.amount) / 1000000;
      const bAgeScore = (Date.now() - Number(b.detectedAt)) / (24 * 60 * 60 * 1000);
      const bScore = bAmountScore + bAgeScore;
      
      return aScore - bScore;
    });
    
    const maxInputs = options?.maxInputs || 20;
    return sorted.slice(0, Math.min(maxInputs, sorted.length));
  }

  private async selectOptimal(utxos: UtxoInfo[], options?: CoinJoinOptions): Promise<UtxoInfo[]> {
    // Find the set that maximizes net benefit
    return this.findOptimalConsolidationSet(utxos, options?.maxInputs);
  }

  private async findOptimalConsolidationSet(
    utxos: UtxoInfo[],
    maxInputs?: number
  ): Promise<UtxoInfo[]> {
    const maxToConsider = maxInputs || Math.min(20, utxos.length);
    
    // Sort by consolidation benefit (small, old UTXOs first)
    const scored = utxos.map(utxo => ({
      utxo,
      score: this.calculateConsolidationScore(utxo)
    })).sort((a, b) => b.score - a.score);
    
    // Greedy selection of highest scoring UTXOs
    const selected: UtxoInfo[] = [];
    
    for (let i = 0; i < Math.min(maxToConsider, scored.length); i++) {
      const candidate = scored[i].utxo;
      
      // Check if adding this UTXO improves net benefit
      const testSet = [...selected, candidate];
      
      if (testSet.length >= 2) {
        const joinFee = await this.calculateJoinFee(testSet.length);
        const savings = await this.calculateFeeSavings(testSet);
        const netBenefit = BigInt(savings) - BigInt(joinFee);
        
        if (netBenefit > 0n) {
          selected.push(candidate);
        }
      } else {
        selected.push(candidate);
      }
    }
    
    return selected;
  }

  private calculateConsolidationScore(utxo: UtxoInfo): number {
    let score = 0;
    
    // Prefer smaller amounts (easier to consolidate)
    const amount = Number(utxo.amount);
    if (amount < 1000000) score += 3; // < 1M
    else if (amount < 10000000) score += 2; // < 10M
    else if (amount < 100000000) score += 1; // < 100M
    
    // Prefer older UTXOs
    const age = Date.now() - Number(utxo.detectedAt);
    const ageDays = age / (24 * 60 * 60 * 1000);
    if (ageDays > 30) score += 2;
    else if (ageDays > 7) score += 1;
    
    // Prefer UTXOs that increase input diversity when spent
    if (utxo.features === 'coinbase') score -= 1; // Coinbase has restrictions
    
    return score;
  }

  private async executeJoin(
    utxos: UtxoInfo[],
    options?: CoinJoinOptions
  ): Promise<TransactionId> {
    try {
      // TODO: Replace with actual FFI call when available
      // return await ffi.walletCoinJoin(
      //   this.walletHandle,
      //   utxos.map(u => u.commitment),
      //   options?.feePerGram,
      //   options?.lockHeight,
      //   options?.message
      // );
      
      // Placeholder implementation
      const transactionId = BigInt(Date.now() + Math.floor(Math.random() * 1000000)) as TransactionId;
      console.log(`FFI coin join not yet implemented. Would join ${utxos.length} UTXOs into 1 output`);
      
      return transactionId;
      
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.FFICallFailed,
        'FFI coin join execution failed',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  private async calculateJoinFee(
    inputCount: number,
    feePerGram?: MicroTari
  ): Promise<MicroTari> {
    const fee = feePerGram || await this.getDefaultFeePerGram();
    
    const baseSize = 100;
    const inputSize = 100;
    const outputSize = 50;
    
    const totalSize = baseSize + (inputCount * inputSize) + outputSize;
    
    return BigInt(Math.ceil(totalSize * Number(fee))) as MicroTari;
  }

  private async calculateFeeSavings(
    utxos: UtxoInfo[],
    feePerGram?: MicroTari
  ): Promise<MicroTari> {
    if (utxos.length <= 1) {
      return 0n as MicroTari;
    }
    
    const fee = feePerGram || await this.getDefaultFeePerGram();
    
    // Estimate future fee savings from having fewer UTXOs
    // This is the fee cost of using these UTXOs in future transactions
    const inputCostPerUtxo = 100 * Number(fee); // Size per input * fee per gram
    const totalInputCost = (utxos.length - 1) * inputCostPerUtxo; // -1 because we'll have 1 output
    
    return BigInt(Math.ceil(totalInputCost)) as MicroTari;
  }

  private calculateEfficiencyScore(
    utxos: UtxoInfo[],
    joinFee: MicroTari,
    futureSavings: MicroTari
  ): number {
    if (Number(joinFee) === 0) {
      return 1.0;
    }
    
    const ratio = Number(futureSavings) / Number(joinFee);
    
    // Score based on savings ratio
    if (ratio > 3) return 1.0;
    if (ratio > 2) return 0.8;
    if (ratio > 1.5) return 0.6;
    if (ratio > 1) return 0.4;
    
    return 0.2;
  }

  private async getDefaultFeePerGram(): Promise<MicroTari> {
    // TODO: Get from fee estimation service
    return 25n as MicroTari; // Placeholder
  }
}
