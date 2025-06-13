/**
 * @fileoverview Coin Splitter for Tari Wallet
 * 
 * Implements coin splitting functionality for privacy enhancement
 * with support for various split strategies and validation.
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
import { CoinSelector } from '../utxos/selection/coin-selector.js';
import type { CoinOperationProgressCallback } from './coin-service.js';

/**
 * Coin split options
 */
export interface CoinSplitOptions {
  /** Fee per gram for the transaction */
  feePerGram?: MicroTari;
  
  /** Split strategy to use */
  strategy?: 'even' | 'random' | 'fibonacci' | 'custom';
  
  /** Custom split amounts (for custom strategy) */
  customAmounts?: MicroTari[];
  
  /** Lock height for outputs */
  lockHeight?: bigint;
  
  /** Dust threshold */
  dustThreshold?: MicroTari;
  
  /** Message for transaction */
  message?: string;
  
  /** Privacy mode */
  privacyMode?: 'normal' | 'high' | 'maximum';
}

/**
 * Split operation result
 */
export interface SplitResult {
  /** Transaction ID */
  transactionId: TransactionId;
  
  /** Input UTXOs used */
  inputUtxos: UtxoInfo[];
  
  /** Split strategy used */
  strategy: string;
  
  /** Output amounts */
  outputAmounts: MicroTari[];
  
  /** Total transaction fee */
  totalFee: MicroTari;
}

/**
 * Coin splitter implementation
 */
export class CoinSplitter {
  private readonly walletHandle: WalletHandle;
  private readonly utxoService: UtxoService;
  private readonly coinSelector: CoinSelector;

  constructor(walletHandle: WalletHandle, utxoService: UtxoService) {
    this.walletHandle = walletHandle;
    this.utxoService = utxoService;
    this.coinSelector = new CoinSelector();
  }

  /**
   * Split coins with specified parameters
   */
  public async split(
    amount: MicroTari,
    splitCount: number,
    options?: CoinSplitOptions,
    onProgress?: CoinOperationProgressCallback
  ): Promise<SplitResult> {
    try {
      onProgress?.({
        phase: 'calculating_splits',
        percentage: 40,
        message: 'Calculating split amounts'
      });

      // Calculate split amounts
      const splitAmounts = this.calculateSplitAmounts(amount, splitCount, options);
      
      onProgress?.({
        phase: 'selecting_utxos',
        percentage: 60,
        message: 'Selecting UTXOs for split'
      });

      // Select UTXOs for the split
      const selectedUtxos = await this.selectUtxosForSplit(amount, options);
      
      onProgress?.({
        phase: 'executing_split',
        percentage: 80,
        message: 'Executing coin split transaction'
      });

      // Execute the split transaction
      const transactionId = await this.executeSplit(
        selectedUtxos,
        splitAmounts,
        options
      );

      const totalFee = await this.calculateSplitFee(
        selectedUtxos.length,
        splitAmounts.length,
        options?.feePerGram
      );

      return {
        transactionId,
        inputUtxos: selectedUtxos,
        strategy: options?.strategy || 'even',
        outputAmounts: splitAmounts,
        totalFee
      };
      
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.CoinSplitExecutionFailed,
        'Coin split execution failed',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get recommended split configuration
   */
  public async getRecommendedSplit(
    amount: MicroTari,
    privacyLevel: 'normal' | 'high' | 'maximum'
  ): Promise<{
    recommendedSplitCount: number;
    estimatedFee: MicroTari;
    privacyScore: number;
    reasoning: string;
  }> {
    const amountNum = Number(amount);
    
    // Base split count on amount and privacy level
    let baseSplitCount = 2;
    
    if (amountNum > 100000000) { // > 100M
      baseSplitCount = privacyLevel === 'maximum' ? 8 : privacyLevel === 'high' ? 5 : 3;
    } else if (amountNum > 10000000) { // > 10M
      baseSplitCount = privacyLevel === 'maximum' ? 6 : privacyLevel === 'high' ? 4 : 2;
    } else {
      baseSplitCount = privacyLevel === 'maximum' ? 4 : privacyLevel === 'high' ? 3 : 2;
    }

    const estimatedFee = await this.calculateSplitFee(1, baseSplitCount);
    const privacyScore = this.calculatePrivacyScore(baseSplitCount, privacyLevel);
    
    let reasoning = `Split ${amountNum.toLocaleString()} into ${baseSplitCount} outputs `;
    reasoning += `for ${privacyLevel} privacy level. `;
    reasoning += `This provides good balance between privacy and transaction cost.`;

    return {
      recommendedSplitCount: baseSplitCount,
      estimatedFee,
      privacyScore,
      reasoning
    };
  }

  /**
   * Estimate split operation cost
   */
  public async estimateCost(
    amount: MicroTari,
    splitCount: number,
    options?: CoinSplitOptions
  ): Promise<{
    estimatedFee: MicroTari;
    transactionSize: number;
    breakdown: {
      baseFee: MicroTari;
      outputFees: MicroTari;
      inputFees: MicroTari;
    };
  }> {
    // Estimate input count needed
    const inputCount = await this.estimateInputCount(amount, options);
    
    // Calculate transaction size
    const baseSize = 100; // Base transaction overhead
    const inputSize = 100; // Size per input
    const outputSize = 50; // Size per output
    
    const transactionSize = baseSize + (inputCount * inputSize) + (splitCount * outputSize);
    
    const feePerGram = options?.feePerGram || await this.getDefaultFeePerGram();
    const totalFee = BigInt(Math.ceil(transactionSize * Number(feePerGram))) as MicroTari;
    
    // Break down fees
    const baseFee = BigInt(Math.ceil(baseSize * Number(feePerGram))) as MicroTari;
    const inputFees = BigInt(Math.ceil(inputCount * inputSize * Number(feePerGram))) as MicroTari;
    const outputFees = BigInt(Math.ceil(splitCount * outputSize * Number(feePerGram))) as MicroTari;

    return {
      estimatedFee: totalFee,
      transactionSize,
      breakdown: {
        baseFee,
        outputFees,
        inputFees
      }
    };
  }

  // Private implementation methods

  private calculateSplitAmounts(
    amount: MicroTari,
    splitCount: number,
    options?: CoinSplitOptions
  ): MicroTari[] {
    const strategy = options?.strategy || 'even';
    
    switch (strategy) {
      case 'even':
        return this.calculateEvenSplit(amount, splitCount);
      
      case 'random':
        return this.calculateRandomSplit(amount, splitCount, options);
      
      case 'fibonacci':
        return this.calculateFibonacciSplit(amount, splitCount);
      
      case 'custom':
        return this.validateCustomSplit(amount, options?.customAmounts || []);
      
      default:
        throw new WalletError(
          WalletErrorCode.InvalidArgument,
          `Unknown split strategy: ${strategy}`
        );
    }
  }

  private calculateEvenSplit(amount: MicroTari, splitCount: number): MicroTari[] {
    const baseAmount = BigInt(amount) / BigInt(splitCount);
    const remainder = BigInt(amount) % BigInt(splitCount);
    
    const amounts: MicroTari[] = [];
    
    for (let i = 0; i < splitCount; i++) {
      let outputAmount = baseAmount;
      
      // Distribute remainder among first few outputs
      if (i < Number(remainder)) {
        outputAmount += 1n;
      }
      
      amounts.push(outputAmount as MicroTari);
    }
    
    return amounts;
  }

  private calculateRandomSplit(
    amount: MicroTari,
    splitCount: number,
    options?: CoinSplitOptions
  ): MicroTari[] {
    const totalAmount = BigInt(amount);
    const amounts: MicroTari[] = [];
    const dustThreshold = BigInt(options?.dustThreshold || 1000n);
    
    // Generate random split points
    const splitPoints: number[] = [];
    for (let i = 0; i < splitCount - 1; i++) {
      splitPoints.push(Math.random());
    }
    splitPoints.sort((a, b) => a - b);
    
    // Calculate amounts based on split points
    let lastPoint = 0;
    let remainingAmount = totalAmount;
    
    for (let i = 0; i < splitCount; i++) {
      const currentPoint = i < splitCount - 1 ? splitPoints[i] : 1;
      const proportion = currentPoint - lastPoint;
      
      let outputAmount: bigint;
      if (i === splitCount - 1) {
        // Last output gets remaining amount
        outputAmount = remainingAmount;
      } else {
        outputAmount = BigInt(Math.floor(Number(totalAmount) * proportion));
        
        // Ensure minimum size
        if (outputAmount < dustThreshold) {
          outputAmount = dustThreshold;
        }
        
        remainingAmount -= outputAmount;
      }
      
      amounts.push(outputAmount as MicroTari);
      lastPoint = currentPoint;
    }
    
    return amounts;
  }

  private calculateFibonacciSplit(amount: MicroTari, splitCount: number): MicroTari[] {
    // Generate Fibonacci sequence
    const fibonacci = [1, 1];
    for (let i = 2; i < splitCount; i++) {
      fibonacci[i] = fibonacci[i - 1] + fibonacci[i - 2];
    }
    
    const fibSum = fibonacci.reduce((sum, val) => sum + val, 0);
    const totalAmount = BigInt(amount);
    
    return fibonacci.map(fibNum => {
      const proportion = fibNum / fibSum;
      return BigInt(Math.floor(Number(totalAmount) * proportion)) as MicroTari;
    });
  }

  private validateCustomSplit(amount: MicroTari, customAmounts: MicroTari[]): MicroTari[] {
    const totalCustom = customAmounts.reduce((sum, amt) => sum + BigInt(amt), 0n);
    
    if (totalCustom !== BigInt(amount)) {
      throw new WalletError(
        WalletErrorCode.InvalidAmount,
        'Custom split amounts do not sum to total amount',
        { context: { totalCustom, expectedTotal: amount } }
      );
    }
    
    return customAmounts;
  }

  private async selectUtxosForSplit(
    amount: MicroTari,
    options?: CoinSplitOptions
  ): Promise<UtxoInfo[]> {
    // Get available UTXOs
    const availableUtxos = await this.utxoService.getSpendable();
    
    if (availableUtxos.length === 0) {
      throw new WalletError(
        WalletErrorCode.InsufficientUtxos,
        'No spendable UTXOs available'
      );
    }

    // Estimate fee to include in selection
    const estimatedFee = await this.calculateSplitFee(2, 2, options?.feePerGram);
    const targetAmount = BigInt(amount) + BigInt(estimatedFee);

    // Use coin selector to find optimal UTXOs
    const selectionContext = {
      targetAmount: targetAmount as MicroTari,
      feePerGram: options?.feePerGram || await this.getDefaultFeePerGram(),
      privacyMode: options?.privacyMode
    };

    const selection = await this.coinSelector.selectCoins(availableUtxos, selectionContext);
    
    if (!selection.success) {
      throw new WalletError(
        WalletErrorCode.InsufficientFunds,
        'Unable to select sufficient UTXOs for split'
      );
    }

    return selection.selected;
  }

  private async executeSplit(
    inputUtxos: UtxoInfo[],
    outputAmounts: MicroTari[],
    options?: CoinSplitOptions
  ): Promise<TransactionId> {
    try {
      // TODO: Replace with actual FFI call when available
      // return await ffi.walletCoinSplit(
      //   this.walletHandle,
      //   inputUtxos.map(u => u.commitment),
      //   outputAmounts,
      //   options?.feePerGram,
      //   options?.lockHeight,
      //   options?.message
      // );
      
      // Placeholder implementation
      const transactionId = `split_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log(`FFI coin split not yet implemented. Would split ${inputUtxos.length} UTXOs into ${outputAmounts.length} outputs`);
      
      return BigInt(transactionId.replace(/\D/g, '')) as TransactionId;
      
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.FFICallFailed,
        'FFI coin split execution failed',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  private async calculateSplitFee(
    inputCount: number = 1,
    outputCount: number = 2,
    feePerGram?: MicroTari
  ): Promise<MicroTari> {
    const fee = feePerGram || await this.getDefaultFeePerGram();
    
    const baseSize = 100;
    const inputSize = 100;
    const outputSize = 50;
    
    const totalSize = baseSize + (inputCount * inputSize) + (outputCount * outputSize);
    
    return BigInt(Math.ceil(totalSize * Number(fee))) as MicroTari;
  }

  private async estimateInputCount(amount: MicroTari, options?: CoinSplitOptions): Promise<number> {
    // Simple estimation - would be more sophisticated in practice
    const availableUtxos = await this.utxoService.getSpendable();
    
    if (availableUtxos.length === 0) {
      return 1;
    }
    
    // Sort by amount descending
    const sortedUtxos = availableUtxos.sort((a, b) => {
      const diff = BigInt(b.amount) - BigInt(a.amount);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });
    
    let totalSelected = 0n;
    let inputCount = 0;
    
    for (const utxo of sortedUtxos) {
      inputCount++;
      totalSelected += BigInt(utxo.amount);
      
      if (totalSelected >= BigInt(amount)) {
        break;
      }
    }
    
    return inputCount;
  }

  private calculatePrivacyScore(splitCount: number, privacyLevel: string): number {
    // Base score on split count
    let score = Math.min(splitCount / 10, 0.8);
    
    // Bonus for privacy level
    switch (privacyLevel) {
      case 'maximum':
        score += 0.2;
        break;
      case 'high':
        score += 0.1;
        break;
      case 'normal':
      default:
        // No bonus
        break;
    }
    
    return Math.min(score, 1.0);
  }

  private async getDefaultFeePerGram(): Promise<MicroTari> {
    // TODO: Get from fee estimation service
    return 25n as MicroTari; // Placeholder
  }
}
