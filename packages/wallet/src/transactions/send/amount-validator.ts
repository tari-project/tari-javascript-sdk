import { FFIBindings } from '@tari-project/tarijs-core';
import {
  WalletHandle,
  MicroTari,
  WalletError,
  WalletErrorCode,
  withErrorContext,
  validateMicroTari,
  validateRequired,
} from '@tari-project/tarijs-core';
import { WalletBalance } from '../../models';

/**
 * Configuration for amount validation
 */
export interface AmountValidationConfig {
  /** Minimum transaction amount (dust limit) */
  minimumAmount: MicroTari;
  /** Maximum transaction amount for safety */
  maximumAmount?: MicroTari;
  /** Safety margin percentage (e.g., 0.01 for 1%) */
  safetyMarginPercent: number;
  /** Enable strict UTXO validation */
  strictUtxoValidation: boolean;
}

/**
 * Default amount validation configuration
 */
export const DEFAULT_AMOUNT_CONFIG: AmountValidationConfig = {
  minimumAmount: 1n, // 1 MicroTari dust limit
  maximumAmount: undefined, // No maximum by default
  safetyMarginPercent: 0.05, // 5% safety margin
  strictUtxoValidation: true
};

/**
 * Amount and balance validation service for transactions
 * 
 * Provides comprehensive validation for transaction amounts including:
 * - Dust limit enforcement
 * - Balance sufficiency checks
 * - UTXO availability verification
 * - Safety margin calculations
 * - Multi-output transaction validation
 */
export class AmountValidator {
  private config: AmountValidationConfig;
  private cachedBalance?: {
    balance: WalletBalance;
    timestamp: number;
    ttl: number;
  };

  constructor(
    private readonly walletHandle: WalletHandle,
    config: Partial<AmountValidationConfig> = {}
  ) {
    this.config = { ...DEFAULT_AMOUNT_CONFIG, ...config };
  }

  /**
   * Validate transaction amount and ensure sufficient balance
   * 
   * Performs comprehensive validation including:
   * - Basic amount validation (positive, above dust limit)
   * - Balance sufficiency check including fees
   * - UTXO availability verification
   * - Safety margin enforcement
   * 
   * @param amount Transaction amount to validate
   * @param estimatedFee Estimated transaction fee
   * @returns Promise resolving when validation passes
   * 
   * @throws {WalletError} WalletErrorCode.INVALID_AMOUNT - Invalid amount
   * @throws {WalletError} WalletErrorCode.AMOUNT_BELOW_DUST_LIMIT - Amount too small
   * @throws {WalletError} WalletErrorCode.AMOUNT_EXCEEDS_MAXIMUM - Amount too large
   * @throws {WalletError} WalletErrorCode.INSUFFICIENT_FUNDS - Not enough balance
   * @throws {WalletError} WalletErrorCode.INSUFFICIENT_UTXOS - UTXOs not available
   */
  @withErrorContext('validate_sufficient_balance', 'transaction')
  async validateSufficientBalance(
    amount: MicroTari,
    estimatedFee?: MicroTari
  ): Promise<void> {
    // Basic amount validation
    this.validateBasicAmount(amount);

    // Get current balance
    const balance = await this.getCurrentBalance();
    
    // Calculate total required amount
    const fee = estimatedFee || 0n;
    const totalRequired = amount + fee;
    const safetyMargin = this.calculateSafetyMargin(balance.available);
    const totalWithMargin = totalRequired + safetyMargin;

    // Check available balance
    if (balance.available < totalRequired) {
      throw new WalletError(
        WalletErrorCode.INSUFFICIENT_FUNDS,
        `Insufficient funds: need ${totalRequired} MicroTari, have ${balance.available} MicroTari`,
        {
          operation: 'validateSufficientBalance',
          required: totalRequired.toString(),
          available: balance.available.toString(),
          amount: amount.toString(),
          fee: fee.toString()
        }
      );
    }

    // Check safety margin if enabled
    if (this.config.safetyMarginPercent > 0 && balance.available < totalWithMargin) {
      throw new WalletError(
        WalletErrorCode.INSUFFICIENT_FUNDS_WITH_MARGIN,
        `Insufficient funds including safety margin: need ${totalWithMargin} MicroTari, have ${balance.available} MicroTari`,
        {
          operation: 'validateSufficientBalance',
          required: totalRequired.toString(),
          requiredWithMargin: totalWithMargin.toString(),
          available: balance.available.toString(),
          safetyMargin: safetyMargin.toString(),
          safetyMarginPercent: this.config.safetyMarginPercent.toString()
        }
      );
    }

    // Verify UTXO availability if strict validation is enabled
    if (this.config.strictUtxoValidation) {
      await this.validateUtxoAvailability(totalRequired);
    }
  }

  /**
   * Validate multiple transaction amounts (for batch transactions)
   * 
   * @param amounts Array of transaction amounts
   * @param estimatedFees Array of corresponding fees (optional)
   * @returns Promise resolving when all validations pass
   */
  @withErrorContext('validate_multiple_amounts', 'transaction')
  async validateMultipleAmounts(
    amounts: MicroTari[],
    estimatedFees?: MicroTari[]
  ): Promise<void> {
    validateRequired(amounts, 'amounts');

    if (amounts.length === 0) {
      throw new WalletError(
        WalletErrorCode.INVALID_PARAMETERS,
        'At least one amount is required',
        { operation: 'validateMultipleAmounts' }
      );
    }

    // Validate each amount individually
    amounts.forEach((amount, index) => {
      try {
        this.validateBasicAmount(amount);
      } catch (error) {
        throw new WalletError(
          error.code || WalletErrorCode.INVALID_AMOUNT,
          `Invalid amount at index ${index}: ${error.message}`,
          {
            operation: 'validateMultipleAmounts',
            amountIndex: index,
            amount: amount.toString(),
            cause: error
          }
        );
      }
    });

    // Calculate total required amount
    const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0n);
    const totalFees = estimatedFees?.reduce((sum, fee) => sum + fee, 0n) || 0n;
    const grandTotal = totalAmount + totalFees;

    // Validate total against balance
    const balance = await this.getCurrentBalance();
    const safetyMargin = this.calculateSafetyMargin(balance.available);

    if (balance.available < grandTotal + safetyMargin) {
      throw new WalletError(
        WalletErrorCode.INSUFFICIENT_FUNDS,
        `Insufficient funds for batch transaction: need ${grandTotal + safetyMargin} MicroTari, have ${balance.available} MicroTari`,
        {
          operation: 'validateMultipleAmounts',
          totalAmount: totalAmount.toString(),
          totalFees: totalFees.toString(),
          grandTotal: grandTotal.toString(),
          safetyMargin: safetyMargin.toString(),
          available: balance.available.toString(),
          transactionCount: amounts.length.toString()
        }
      );
    }

    // Verify UTXO availability for the total amount
    if (this.config.strictUtxoValidation) {
      await this.validateUtxoAvailability(grandTotal);
    }
  }

  /**
   * Calculate the recommended fee for a given amount
   * 
   * @param amount Transaction amount
   * @param outputCount Number of outputs (default: 1)
   * @returns Promise resolving to recommended fee
   */
  @withErrorContext('calculate_recommended_fee', 'transaction')
  async calculateRecommendedFee(
    amount: MicroTari,
    outputCount = 1
  ): Promise<MicroTari> {
    this.validateBasicAmount(amount);

    try {
      // Get current network fee statistics
      const feeStats = await FFIBindings.walletGetFeePerGramStats(this.walletHandle);
      
      // Estimate transaction size based on outputs
      const estimatedSizeGrams = this.estimateTransactionSize(outputCount);
      
      // Use median fee rate for standard priority
      const recommendedFee = BigInt(feeStats.median) * BigInt(estimatedSizeGrams);
      
      return recommendedFee;
    } catch (error) {
      // Fallback to minimum network fee if stats unavailable
      const minimumFee = 1000n; // 1000 MicroTari minimum
      return minimumFee;
    }
  }

  /**
   * Get current balance with caching
   * 
   * @param forceRefresh Force refresh of cached balance
   * @returns Promise resolving to current wallet balance
   */
  @withErrorContext('get_current_balance', 'transaction')
  async getCurrentBalance(forceRefresh = false): Promise<WalletBalance> {
    const now = Date.now();
    const cacheExpired = !this.cachedBalance || 
      now > this.cachedBalance.timestamp + this.cachedBalance.ttl;

    if (forceRefresh || cacheExpired) {
      try {
        const balance = await FFIBindings.walletGetBalance(this.walletHandle);
        
        this.cachedBalance = {
          balance: WalletBalance.from(balance),
          timestamp: now,
          ttl: 30000 // 30 seconds cache
        };
      } catch (error) {
        throw new WalletError(
          WalletErrorCode.BALANCE_QUERY_FAILED,
          'Failed to retrieve wallet balance',
          {
            operation: 'getCurrentBalance',
            cause: error
          }
        );
      }
    }

    return this.cachedBalance.balance;
  }

  /**
   * Check if an amount is above the dust limit
   * 
   * @param amount Amount to check
   * @returns True if amount is above dust limit
   */
  isAboveDustLimit(amount: MicroTari): boolean {
    return amount >= this.config.minimumAmount;
  }

  /**
   * Check if an amount is below the maximum limit (if configured)
   * 
   * @param amount Amount to check
   * @returns True if amount is below maximum limit
   */
  isBelowMaximumLimit(amount: MicroTari): boolean {
    return this.config.maximumAmount === undefined || 
           amount <= this.config.maximumAmount;
  }

  /**
   * Update validation configuration
   * 
   * @param newConfig Partial configuration to update
   */
  updateConfig(newConfig: Partial<AmountValidationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Clear cached balance data
   */
  clearBalanceCache(): void {
    this.cachedBalance = undefined;
  }

  private validateBasicAmount(amount: MicroTari): void {
    validateMicroTari(amount, 'amount');

    if (amount <= 0n) {
      throw new WalletError(
        WalletErrorCode.INVALID_AMOUNT,
        'Transaction amount must be greater than zero',
        {
          operation: 'validateBasicAmount',
          amount: amount.toString()
        }
      );
    }

    if (!this.isAboveDustLimit(amount)) {
      throw new WalletError(
        WalletErrorCode.AMOUNT_BELOW_DUST_LIMIT,
        `Transaction amount ${amount} is below dust limit of ${this.config.minimumAmount}`,
        {
          operation: 'validateBasicAmount',
          amount: amount.toString(),
          dustLimit: this.config.minimumAmount.toString()
        }
      );
    }

    if (!this.isBelowMaximumLimit(amount)) {
      throw new WalletError(
        WalletErrorCode.AMOUNT_EXCEEDS_MAXIMUM,
        `Transaction amount ${amount} exceeds maximum limit of ${this.config.maximumAmount}`,
        {
          operation: 'validateBasicAmount',
          amount: amount.toString(),
          maximumLimit: this.config.maximumAmount!.toString()
        }
      );
    }
  }

  private calculateSafetyMargin(availableBalance: MicroTari): MicroTari {
    if (this.config.safetyMarginPercent <= 0) {
      return 0n;
    }

    const margin = availableBalance * BigInt(Math.floor(this.config.safetyMarginPercent * 10000)) / 10000n;
    return margin;
  }

  private async validateUtxoAvailability(requiredAmount: MicroTari): Promise<void> {
    try {
      // Check if we have sufficient UTXOs to cover the required amount
      // This would typically involve querying available UTXOs and ensuring
      // they can be combined to meet the requirement
      
      // For now, we'll implement a simple check
      // In a full implementation, this would query actual UTXO availability
      const balance = await this.getCurrentBalance();
      
      if (balance.available < requiredAmount) {
        throw new WalletError(
          WalletErrorCode.INSUFFICIENT_UTXOS,
          `Insufficient UTXOs available: need ${requiredAmount}, have ${balance.available}`,
          {
            operation: 'validateUtxoAvailability',
            required: requiredAmount.toString(),
            available: balance.available.toString()
          }
        );
      }
    } catch (error) {
      if (error instanceof WalletError) {
        throw error;
      }
      
      throw new WalletError(
        WalletErrorCode.UTXO_VALIDATION_FAILED,
        'Failed to validate UTXO availability',
        {
          operation: 'validateUtxoAvailability',
          required: requiredAmount.toString(),
          cause: error
        }
      );
    }
  }

  private estimateTransactionSize(outputCount: number): number {
    // Simplified transaction size estimation
    // In practice, this would be more sophisticated based on:
    // - Number of inputs and outputs
    // - Script complexity
    // - Signature requirements
    // - Metadata size
    
    const baseSize = 100; // Base transaction overhead
    const inputSize = 32; // Typical input size
    const outputSize = 32; // Typical output size
    
    // Assume 1 input per output for simplicity
    const estimatedSize = baseSize + (outputCount * (inputSize + outputSize));
    
    return estimatedSize;
  }
}
