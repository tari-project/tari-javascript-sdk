/**
 * @fileoverview Fee Calculator
 * 
 * Provides low-level fee calculation utilities including transaction size estimation,
 * fee-per-gram calculations, and constraint application. Used by the fee estimator
 * for core mathematical operations.
 */

import {
  WalletError,
  WalletErrorCode,
  ErrorSeverity,
  withErrorContext,
  type MicroTari
} from '@tari-project/tarijs-core';
import type { FeePriority } from './fee-estimator.js';

/**
 * Transaction component sizes in bytes
 */
interface TransactionSizeComponents {
  /** Base transaction overhead */
  baseSize: number;
  /** Size per input UTXO */
  inputSize: number;
  /** Size per output */
  outputSize: number;
  /** Size per signature */
  signatureSize: number;
  /** Kernel size */
  kernelSize: number;
  /** Message overhead (if present) */
  messageOverhead: number;
}

/**
 * Fee calculation configuration
 */
export interface FeeCalculatorConfig {
  /** Minimum fee per gram (safety net) */
  minimumFeePerGram: MicroTari;
  /** Maximum fee per gram (protection) */
  maximumFeePerGram: MicroTari;
  /** Priority multipliers for different fee levels */
  priorityMultipliers: Record<FeePriority, number>;
  /** Transaction size components */
  sizeComponents?: Partial<TransactionSizeComponents>;
  /** Bytes per gram conversion factor */
  bytesPerGram?: number;
}

/**
 * Transaction size estimation result
 */
export interface SizeEstimationResult {
  /** Total size in bytes */
  totalBytes: number;
  /** Total size in grams */
  totalGrams: number;
  /** Breakdown of size components */
  breakdown: {
    base: number;
    inputs: number;
    outputs: number;
    signatures: number;
    kernel: number;
    message: number;
  };
}

/**
 * Fee calculation breakdown
 */
export interface FeeBreakdown {
  /** Base fee component */
  baseFee: MicroTari;
  /** Input-related fees */
  inputFee: MicroTari;
  /** Output-related fees */
  outputFee: MicroTari;
  /** Signature fees */
  signatureFee: MicroTari;
  /** Kernel fee */
  kernelFee: MicroTari;
  /** Message fee (if any) */
  messageFee: MicroTari;
  /** Total calculated fee */
  totalFee: MicroTari;
  /** Fee per gram used */
  feePerGram: MicroTari;
  /** Transaction size in grams */
  sizeGrams: number;
}

/**
 * Low-level fee calculation utilities
 */
export class FeeCalculator {
  private readonly config: FeeCalculatorConfig;
  private readonly sizeComponents: TransactionSizeComponents;
  private readonly bytesPerGram: number;
  private isDisposed = false;

  constructor(config: FeeCalculatorConfig) {
    this.config = config;
    this.bytesPerGram = config.bytesPerGram || 1; // 1 byte = 1 gram by default
    
    // Initialize transaction size components with defaults
    this.sizeComponents = {
      baseSize: 32, // Base transaction structure
      inputSize: 64, // Input UTXO reference + script
      outputSize: 96, // Output commitment + range proof
      signatureSize: 64, // Ed25519 signature
      kernelSize: 128, // Transaction kernel
      messageOverhead: 8, // Message length prefix
      ...config.sizeComponents
    };
  }

  /**
   * Estimate transaction size in grams
   */
  @withErrorContext('estimate_transaction_size', 'fee_calculator')
  estimateTransactionSize(
    amount: MicroTari,
    outputs: number = 1,
    inputs?: number,
    messageLength: number = 0
  ): number {
    this.ensureNotDisposed();

    // Estimate inputs if not provided
    const estimatedInputs = inputs || this.estimateRequiredInputs(amount);

    const sizeResult = this.calculateTransactionSize(
      estimatedInputs,
      outputs,
      messageLength
    );

    return sizeResult.totalGrams;
  }

  /**
   * Calculate detailed transaction size breakdown
   */
  @withErrorContext('calculate_transaction_size', 'fee_calculator')
  calculateTransactionSize(
    inputs: number,
    outputs: number,
    messageLength: number = 0
  ): SizeEstimationResult {
    this.ensureNotDisposed();

    const breakdown = {
      base: this.sizeComponents.baseSize,
      inputs: inputs * this.sizeComponents.inputSize,
      outputs: outputs * this.sizeComponents.outputSize,
      signatures: inputs * this.sizeComponents.signatureSize, // One signature per input
      kernel: this.sizeComponents.kernelSize,
      message: messageLength > 0 ? 
        this.sizeComponents.messageOverhead + messageLength : 0
    };

    const totalBytes = Object.values(breakdown).reduce((sum, size) => sum + size, 0);
    const totalGrams = Math.ceil(totalBytes / this.bytesPerGram);

    return {
      totalBytes,
      totalGrams,
      breakdown
    };
  }

  /**
   * Calculate fee with detailed breakdown
   */
  @withErrorContext('calculate_fee_breakdown', 'fee_calculator')
  calculateFeeBreakdown(
    feePerGram: MicroTari,
    inputs: number,
    outputs: number,
    messageLength: number = 0
  ): FeeBreakdown {
    this.ensureNotDisposed();

    const sizeResult = this.calculateTransactionSize(inputs, outputs, messageLength);
    const { breakdown, totalGrams } = sizeResult;

    // Calculate proportional fees based on size components
    const feePerByte = Number(feePerGram) / this.bytesPerGram;

    const baseFee = BigInt(Math.ceil(breakdown.base * feePerByte)) as MicroTari;
    const inputFee = BigInt(Math.ceil(breakdown.inputs * feePerByte)) as MicroTari;
    const outputFee = BigInt(Math.ceil(breakdown.outputs * feePerByte)) as MicroTari;
    const signatureFee = BigInt(Math.ceil(breakdown.signatures * feePerByte)) as MicroTari;
    const kernelFee = BigInt(Math.ceil(breakdown.kernel * feePerByte)) as MicroTari;
    const messageFee = BigInt(Math.ceil(breakdown.message * feePerByte)) as MicroTari;

    const totalFee = (baseFee + inputFee + outputFee + signatureFee + kernelFee + messageFee) as MicroTari;

    return {
      baseFee,
      inputFee,
      outputFee,
      signatureFee,
      kernelFee,
      messageFee,
      totalFee,
      feePerGram,
      sizeGrams: totalGrams
    };
  }

  /**
   * Calculate simple fee (fee per gram * size)
   */
  @withErrorContext('calculate_simple_fee', 'fee_calculator')
  calculateSimpleFee(feePerGram: MicroTari, sizeGrams: number): MicroTari {
    this.ensureNotDisposed();
    return (feePerGram * BigInt(sizeGrams)) as MicroTari;
  }

  /**
   * Apply fee constraints (min/max limits)
   */
  @withErrorContext('apply_fee_constraints', 'fee_calculator')
  applyFeeConstraints(feePerGram: MicroTari): MicroTari {
    this.ensureNotDisposed();

    if (feePerGram < this.config.minimumFeePerGram) {
      return this.config.minimumFeePerGram;
    }

    if (feePerGram > this.config.maximumFeePerGram) {
      return this.config.maximumFeePerGram;
    }

    return feePerGram;
  }

  /**
   * Apply priority multiplier to base fee
   */
  @withErrorContext('apply_priority_multiplier', 'fee_calculator')
  applyPriorityMultiplier(baseFeePerGram: MicroTari, priority: FeePriority): MicroTari {
    this.ensureNotDisposed();

    const multiplier = this.config.priorityMultipliers[priority];
    const adjustedFee = BigInt(Math.floor(Number(baseFeePerGram) * multiplier)) as MicroTari;
    
    return this.applyFeeConstraints(adjustedFee);
  }

  /**
   * Estimate number of inputs required for a transaction amount
   */
  @withErrorContext('estimate_required_inputs', 'fee_calculator')
  estimateRequiredInputs(amount: MicroTari): number {
    this.ensureNotDisposed();

    // This is a heuristic - in reality, depends on UTXO distribution
    // For simplicity, assume average UTXO size and add some overhead
    const averageUtxoSize = BigInt(1000000); // 1 Tari in MicroTari
    const estimatedInputs = Math.ceil(Number(amount) / Number(averageUtxoSize));
    
    // Minimum 1 input, and add 1 for change if amount is not exact multiple
    return Math.max(1, estimatedInputs + (Number(amount) % Number(averageUtxoSize) > 0 ? 1 : 0));
  }

  /**
   * Calculate fee for one-sided transactions
   */
  @withErrorContext('calculate_one_sided_fee', 'fee_calculator')
  calculateOneSidedFee(
    feePerGram: MicroTari,
    outputs: number = 1,
    messageLength: number = 0
  ): FeeBreakdown {
    this.ensureNotDisposed();

    // One-sided transactions have different characteristics:
    // - Only one input (the entire UTXO being spent)
    // - No change output typically
    // - Simplified kernel structure
    const inputs = 1;
    const adjustedOutputs = outputs;

    return this.calculateFeeBreakdown(feePerGram, inputs, adjustedOutputs, messageLength);
  }

  /**
   * Validate fee parameters
   */
  @withErrorContext('validate_fee_parameters', 'fee_calculator')
  validateFeeParameters(feePerGram: MicroTari, amount: MicroTari): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    this.ensureNotDisposed();

    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if fee per gram is positive
    if (feePerGram <= 0n) {
      errors.push('Fee per gram must be positive');
    }

    // Check if fee per gram is within reasonable bounds
    if (feePerGram < this.config.minimumFeePerGram) {
      warnings.push(`Fee per gram (${feePerGram}) is below minimum (${this.config.minimumFeePerGram})`);
    }

    if (feePerGram > this.config.maximumFeePerGram) {
      warnings.push(`Fee per gram (${feePerGram}) exceeds maximum (${this.config.maximumFeePerGram})`);
    }

    // Check if amount is positive
    if (amount <= 0n) {
      errors.push('Transaction amount must be positive');
    }

    // Calculate estimated total fee and check if it's reasonable relative to amount
    const estimatedSize = this.estimateTransactionSize(amount);
    const estimatedFee = this.calculateSimpleFee(feePerGram, estimatedSize);
    
    // Warn if fee is more than 10% of transaction amount
    if (estimatedFee * 10n > amount) {
      warnings.push(`High fee ratio: fee (${estimatedFee}) is more than 10% of amount (${amount})`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get calculator configuration
   */
  getConfig(): FeeCalculatorConfig {
    return { ...this.config };
  }

  /**
   * Get size components
   */
  getSizeComponents(): TransactionSizeComponents {
    return { ...this.sizeComponents };
  }

  /**
   * Calculate cost efficiency (amount per unit fee)
   */
  @withErrorContext('calculate_cost_efficiency', 'fee_calculator')
  calculateCostEfficiency(amount: MicroTari, fee: MicroTari): number {
    this.ensureNotDisposed();

    if (fee <= 0n) {
      return Infinity;
    }

    return Number(amount) / Number(fee);
  }

  /**
   * Compare fee options and rank by efficiency
   */
  @withErrorContext('compare_fee_options', 'fee_calculator')
  compareFeeOptions(
    amount: MicroTari,
    feeOptions: MicroTari[]
  ): Array<{
    feePerGram: MicroTari;
    totalFee: MicroTari;
    efficiency: number;
    rank: number;
  }> {
    this.ensureNotDisposed();

    const sizeGrams = this.estimateTransactionSize(amount);
    
    const results = feeOptions.map(feePerGram => {
      const totalFee = this.calculateSimpleFee(feePerGram, sizeGrams);
      const efficiency = this.calculateCostEfficiency(amount, totalFee);
      
      return {
        feePerGram,
        totalFee,
        efficiency,
        rank: 0 // Will be set after sorting
      };
    });

    // Sort by efficiency (higher is better) and assign ranks
    results.sort((a, b) => b.efficiency - a.efficiency);
    results.forEach((result, index) => {
      result.rank = index + 1;
    });

    return results;
  }

  /**
   * Ensure calculator is not disposed
   */
  private ensureNotDisposed(): void {
    if (this.isDisposed) {
      throw new WalletError(
        WalletErrorCode.ResourceDisposed,
        'Fee calculator has been disposed',
        { severity: ErrorSeverity.Error }
      );
    }
  }

  /**
   * Dispose of the calculator
   */
  async dispose(): Promise<void> {
    this.isDisposed = true;
  }

  /**
   * AsyncDisposable implementation
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }
}

/**
 * Default transaction size components for Tari
 */
export const DEFAULT_TARI_SIZE_COMPONENTS: TransactionSizeComponents = {
  baseSize: 32,
  inputSize: 64,
  outputSize: 96,
  signatureSize: 64,
  kernelSize: 128,
  messageOverhead: 8
};

/**
 * Utility functions for fee calculations
 */
export class FeeUtils {
  /**
   * Convert MicroTari to Tari for display purposes
   */
  static microTariToTari(microTari: MicroTari): number {
    return Number(microTari) / 1_000_000;
  }

  /**
   * Convert Tari to MicroTari
   */
  static tariToMicroTari(tari: number): MicroTari {
    return BigInt(Math.floor(tari * 1_000_000)) as MicroTari;
  }

  /**
   * Format fee for display
   */
  static formatFee(fee: MicroTari, decimals: number = 6): string {
    const tari = this.microTariToTari(fee);
    return tari.toFixed(decimals);
  }

  /**
   * Calculate fee rate (fee per byte)
   */
  static calculateFeeRate(fee: MicroTari, sizeBytes: number): number {
    return Number(fee) / sizeBytes;
  }

  /**
   * Estimate dust threshold (minimum economical amount)
   */
  static estimateDustThreshold(feePerGram: MicroTari): MicroTari {
    // Rule of thumb: dust threshold is roughly 3x the cost to spend the output
    const spendCostGrams = 64; // Typical input size
    const spendCost = feePerGram * BigInt(spendCostGrams);
    return (spendCost * 3n) as MicroTari;
  }
}
