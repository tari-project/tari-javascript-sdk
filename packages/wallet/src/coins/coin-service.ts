/**
 * @fileoverview Coin Service for Tari Wallet
 * 
 * Provides coin split and join operations for privacy enhancement
 * and UTXO consolidation with progress tracking and validation.
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
import { CoinSplitter, CoinSplitOptions } from './coin-splitter.js';
import { CoinJoiner, CoinJoinOptions } from './coin-joiner.js';

/**
 * Coin operation progress callback
 */
export type CoinOperationProgressCallback = (progress: {
  phase: string;
  percentage: number;
  message: string;
  estimatedTimeRemaining?: number;
}) => void;

/**
 * Coin operation result
 */
export interface CoinOperationResult {
  /** Operation transaction ID */
  transactionId: TransactionId;
  
  /** Operation type */
  operation: 'split' | 'join';
  
  /** Input UTXOs used */
  inputUtxos: UtxoInfo[];
  
  /** Expected output count */
  expectedOutputs: number;
  
  /** Operation success status */
  success: boolean;
  
  /** Operation duration in milliseconds */
  duration: number;
  
  /** Additional operation metadata */
  metadata: Record<string, any>;
}

/**
 * Comprehensive coin management service
 */
export class CoinService {
  private readonly walletHandle: WalletHandle;
  private readonly utxoService: UtxoService;
  private readonly splitter: CoinSplitter;
  private readonly joiner: CoinJoiner;
  private activeOperations = new Map<string, { type: string; startTime: number }>();

  constructor(walletHandle: WalletHandle, utxoService: UtxoService) {
    this.walletHandle = walletHandle;
    this.utxoService = utxoService;
    this.splitter = new CoinSplitter(walletHandle, utxoService);
    this.joiner = new CoinJoiner(walletHandle, utxoService);
  }

  /**
   * Split coins for privacy enhancement
   */
  public async splitCoins(
    amount: MicroTari,
    splitCount: number,
    options?: CoinSplitOptions,
    onProgress?: CoinOperationProgressCallback
  ): Promise<CoinOperationResult> {
    const operationId = this.generateOperationId();
    const startTime = Date.now();
    
    try {
      this.activeOperations.set(operationId, { type: 'split', startTime });
      
      onProgress?.({
        phase: 'validation',
        percentage: 10,
        message: 'Validating split parameters'
      });

      // Validate split parameters
      await this.validateSplitParameters(amount, splitCount, options);
      
      onProgress?.({
        phase: 'utxo_selection',
        percentage: 30,
        message: 'Selecting UTXOs for split'
      });

      // Perform the split
      const result = await this.splitter.split(amount, splitCount, options, onProgress);
      
      onProgress?.({
        phase: 'complete',
        percentage: 100,
        message: 'Coin split completed successfully'
      });

      return {
        transactionId: result.transactionId,
        operation: 'split',
        inputUtxos: result.inputUtxos,
        expectedOutputs: splitCount,
        success: true,
        duration: Date.now() - startTime,
        metadata: {
          splitStrategy: result.strategy,
          totalAmount: amount,
          splitCount,
          averageOutputSize: Number(amount) / splitCount
        }
      };
      
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.CoinSplitFailed,
        'Coin split operation failed',
        { cause: error instanceof Error ? error : undefined }
      );
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  /**
   * Join coins for UTXO consolidation
   */
  public async joinCoins(
    utxoIds?: string[],
    options?: CoinJoinOptions,
    onProgress?: CoinOperationProgressCallback
  ): Promise<CoinOperationResult> {
    const operationId = this.generateOperationId();
    const startTime = Date.now();
    
    try {
      this.activeOperations.set(operationId, { type: 'join', startTime });
      
      onProgress?.({
        phase: 'validation',
        percentage: 10,
        message: 'Validating join parameters'
      });

      // Validate join parameters
      await this.validateJoinParameters(utxoIds, options);
      
      onProgress?.({
        phase: 'utxo_selection',
        percentage: 30,
        message: 'Selecting UTXOs for join'
      });

      // Perform the join
      const result = await this.joiner.join(utxoIds, options, onProgress);
      
      onProgress?.({
        phase: 'complete',
        percentage: 100,
        message: 'Coin join completed successfully'
      });

      return {
        transactionId: result.transactionId,
        operation: 'join',
        inputUtxos: result.inputUtxos,
        expectedOutputs: 1,
        success: true,
        duration: Date.now() - startTime,
        metadata: {
          joinStrategy: result.strategy,
          totalAmount: result.totalAmount,
          inputCount: result.inputUtxos.length,
          consolidationRatio: result.inputUtxos.length
        }
      };
      
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.CoinJoinFailed,
        'Coin join operation failed',
        { cause: error instanceof Error ? error : undefined }
      );
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  /**
   * Get recommended split configuration
   */
  public async getRecommendedSplit(
    amount: MicroTari,
    privacyLevel: 'normal' | 'high' | 'maximum' = 'normal'
  ): Promise<{
    recommendedSplitCount: number;
    estimatedFee: MicroTari;
    privacyScore: number;
    reasoning: string;
  }> {
    return this.splitter.getRecommendedSplit(amount, privacyLevel);
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
    return this.joiner.getRecommendedJoin();
  }

  /**
   * Estimate split operation cost
   */
  public async estimateSplitCost(
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
    return this.splitter.estimateCost(amount, splitCount, options);
  }

  /**
   * Estimate join operation cost
   */
  public async estimateJoinCost(
    utxoIds?: string[],
    options?: CoinJoinOptions
  ): Promise<{
    estimatedFee: MicroTari;
    transactionSize: number;
    savings: MicroTari; // Fee savings from consolidation
    breakdown: {
      baseFee: MicroTari;
      inputFees: MicroTari;
      outputFee: MicroTari;
    };
  }> {
    return this.joiner.estimateCost(utxoIds, options);
  }

  /**
   * Get active coin operations
   */
  public getActiveOperations(): Array<{
    id: string;
    type: string;
    duration: number;
  }> {
    const now = Date.now();
    return Array.from(this.activeOperations.entries()).map(([id, op]) => ({
      id,
      type: op.type,
      duration: now - op.startTime
    }));
  }

  /**
   * Cancel active coin operation
   */
  public async cancelOperation(operationId: string): Promise<boolean> {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      return false;
    }

    // Note: Actual cancellation would depend on FFI implementation
    // For now, just remove from tracking
    this.activeOperations.delete(operationId);
    return true;
  }

  /**
   * Get coin operation statistics
   */
  public async getOperationStatistics(): Promise<{
    totalSplits: number;
    totalJoins: number;
    totalVolumeProcessed: MicroTari;
    averageOperationTime: number;
    successRate: number;
  }> {
    // This would typically come from persistent storage or FFI
    // Placeholder implementation
    return {
      totalSplits: 0,
      totalJoins: 0,
      totalVolumeProcessed: 0n as MicroTari,
      averageOperationTime: 0,
      successRate: 1.0
    };
  }

  // Private helper methods

  private async validateSplitParameters(
    amount: MicroTari,
    splitCount: number,
    options?: CoinSplitOptions
  ): Promise<void> {
    if (BigInt(amount) <= 0n) {
      throw new WalletError(
        WalletErrorCode.CoinSplitAmountInvalid,
        'Split amount must be positive'
      );
    }

    if (splitCount < 2) {
      throw new WalletError(
        WalletErrorCode.CoinSplitCountInvalid,
        'Split count must be at least 2'
      );
    }

    if (splitCount > 100) {
      throw new WalletError(
        WalletErrorCode.CoinSplitCountExceeded,
        'Split count cannot exceed 100'
      );
    }

    // Check if wallet has sufficient funds
    const balance = await this.utxoService.getBalanceSummary();
    if (BigInt(balance.available) < BigInt(amount)) {
      throw new WalletError(
        WalletErrorCode.CoinSplitInsufficientFunds,
        'Insufficient funds for split operation',
        { context: { available: balance.available, required: amount } }
      );
    }

    // Validate minimum output size
    const minOutputSize = BigInt(amount) / BigInt(splitCount);
    const dustLimit = options?.dustThreshold || 1000n;
    
    if (minOutputSize < dustLimit) {
      throw new WalletError(
        WalletErrorCode.CoinSplitDustOutputs,
        'Split would create dust outputs',
        { context: { minOutputSize, dustLimit } }
      );
    }
  }

  private async validateJoinParameters(
    utxoIds?: string[],
    options?: CoinJoinOptions
  ): Promise<void> {
    if (utxoIds && utxoIds.length < 2) {
      throw new WalletError(
        WalletErrorCode.CoinJoinMinimumUtxos,
        'Join operation requires at least 2 UTXOs'
      );
    }

    if (utxoIds && utxoIds.length > 50) {
      throw new WalletError(
        WalletErrorCode.CoinJoinMaximumUtxos,
        'Join operation cannot exceed 50 UTXOs per transaction'
      );
    }

    // Validate UTXOs exist and are spendable
    if (utxoIds) {
      for (const utxoId of utxoIds) {
        const utxo = await this.utxoService.get(utxoId);
        if (!utxo) {
          throw new WalletError(
            WalletErrorCode.CoinJoinUtxoNotFound,
            'UTXO not found',
            { context: { utxoId } }
          );
        }
        
        if (utxo.status !== 'unspent') {
          throw new WalletError(
            WalletErrorCode.CoinJoinInsufficientUtxos,
            'UTXO is not spendable',
            { context: { utxoId, status: utxo.status } }
          );
        }
      }
    }
  }

  private generateOperationId(): string {
    return `coin_op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
