/**
 * @fileoverview One-Sided Transaction Validator
 * 
 * Specialized validation logic for one-sided transactions including
 * UTXO availability checks, script complexity validation, and
 * one-sided specific business rules.
 */

import {
  WalletHandle,
  MicroTari,
  WalletError,
  WalletErrorCode,
  ErrorSeverity,
  withErrorContext,
  getFFIBindings,
  microTariFromFFI
} from '@tari-project/tarijs-core';
import { TariAddress } from '../../models';

/**
 * Configuration for one-sided transaction validation
 */
export interface OneSidedValidationConfig {
  /** Minimum amount for one-sided transactions (dust protection) */
  minOneSidedAmount: MicroTari;
  /** Maximum amount for single one-sided transaction */
  maxOneSidedAmount: MicroTari;
  /** Maximum script complexity allowed */
  maxScriptComplexity: number;
  /** Whether to enforce stealth addressing */
  requireStealth: boolean;
}

/**
 * Default configuration for one-sided validation
 */
export const DEFAULT_ONESIDED_CONFIG: OneSidedValidationConfig = {
  minOneSidedAmount: BigInt(1000) as MicroTari, // 1000 microTari minimum
  maxOneSidedAmount: BigInt(100000000) as MicroTari, // 100M microTari maximum
  maxScriptComplexity: 10,
  requireStealth: false
};

/**
 * One-sided transaction validator implementing specialized validation rules
 * 
 * Provides validation specific to one-sided transactions including:
 * - UTXO selection and availability for non-interactive transactions
 * - Script complexity validation for TariScript construction
 * - Amount limits and dust protection for one-sided payments
 * - Balance verification with full UTXO consumption model
 * - Network-specific validation rules
 */
export class OneSidedValidator {
  private readonly config: OneSidedValidationConfig;
  private readonly ffi = getFFIBindings();

  constructor(
    private readonly walletHandle: WalletHandle,
    config: Partial<OneSidedValidationConfig> = {}
  ) {
    this.config = { ...DEFAULT_ONESIDED_CONFIG, ...config };
  }

  /**
   * Validate one-sided transaction parameters
   * 
   * Performs comprehensive validation specific to one-sided transactions:
   * - Amount validation with one-sided specific limits
   * - UTXO availability for full consumption model
   * - Balance verification including fee estimation
   * - Script complexity validation
   * - Network-specific rule enforcement
   * 
   * @param recipient Target address for the transaction
   * @param amount Amount to send in MicroTari
   * @param feePerGram Fee per gram for the transaction
   * @throws {WalletError} Various validation errors specific to one-sided transactions
   */
  @withErrorContext('validate_onesided_transaction', 'onesided_validator')
  async validateOneSidedTransaction(
    recipient: TariAddress,
    amount: MicroTari,
    feePerGram?: MicroTari
  ): Promise<void> {
    // Validate basic parameters
    await this.validateBasicParameters(amount, feePerGram);
    
    // Validate one-sided specific rules
    await this.validateOneSidedRules(amount);
    
    // Validate UTXO availability
    await this.validateUtxoAvailability(amount, feePerGram);
    
    // Validate script construction capability
    await this.validateScriptConstruction(recipient);
    
    // Validate network-specific rules
    await this.validateNetworkRules(amount);
  }

  /**
   * Validate basic transaction parameters
   */
  @withErrorContext('validate_basic_parameters', 'onesided_validator')
  private async validateBasicParameters(
    amount: MicroTari,
    feePerGram?: MicroTari
  ): Promise<void> {
    // Validate amount
    if (amount <= 0n) {
      throw new WalletError(
        WalletErrorCode.InvalidAmount,
        'One-sided transaction amount must be positive',
        { 
          context: {
            operation: 'validateOneSidedTransaction',
            amount: amount.toString(),
            field: 'amount'
          }
        }
      );
    }

    // Validate fee if provided
    if (feePerGram !== undefined) {
      if (feePerGram <= 0n) {
        throw new WalletError(
          WalletErrorCode.InvalidFee,
          'Fee per gram must be positive for one-sided transactions',
          { 
            context: {
              operation: 'validateOneSidedTransaction',
              feePerGram: feePerGram.toString(),
              field: 'feePerGram'
            }
          }
        );
      }
    }
  }

  /**
   * Validate one-sided specific business rules
   */
  @withErrorContext('validate_onesided_rules', 'onesided_validator')
  private async validateOneSidedRules(amount: MicroTari): Promise<void> {
    // Check minimum amount (dust protection)
    if (amount < this.config.minOneSidedAmount) {
      throw new WalletError(
        WalletErrorCode.InvalidAmount,
        `One-sided transaction amount below minimum threshold of ${this.config.minOneSidedAmount}`,
        {
          context: {
            operation: 'validateOneSidedTransaction',
            amount: amount.toString(),
            minimum: this.config.minOneSidedAmount.toString(),
            field: 'amount'
          }
        }
      );
    }

    // Check maximum amount (security limit)
    if (amount > this.config.maxOneSidedAmount) {
      throw new WalletError(
        WalletErrorCode.InvalidAmount,
        `One-sided transaction amount exceeds maximum threshold of ${this.config.maxOneSidedAmount}`,
        {
          context: {
            operation: 'validateOneSidedTransaction',
            amount: amount.toString(),
            maximum: this.config.maxOneSidedAmount.toString(),
            field: 'amount'
          }
        }
      );
    }
  }

  /**
   * Validate UTXO availability for one-sided transaction
   * 
   * One-sided transactions require full UTXO consumption without change outputs,
   * so we need to ensure suitable UTXOs are available.
   */
  @withErrorContext('validate_utxo_availability', 'onesided_validator')
  private async validateUtxoAvailability(
    amount: MicroTari,
    feePerGram?: MicroTari
  ): Promise<void> {
    try {
      // Get current wallet balance
      const balance = await this.ffi.getBalance(this.walletHandle);
      
      // Estimate total cost including fee
      const estimatedFee = feePerGram ? 
        microTariFromFFI((feePerGram as bigint) * BigInt(250)) : // Estimated transaction size
        microTariFromFFI(BigInt(Math.ceil(Number(amount as bigint) * 0.001))); // 0.1% fee fallback
      
      const totalCost = microTariFromFFI((amount as bigint) + (estimatedFee as bigint));

      // Check available balance
      if (balance.available < totalCost) {
        throw new WalletError(
          WalletErrorCode.InsufficientFunds,
          `Insufficient funds for one-sided transaction. Required: ${totalCost}, Available: ${balance.available}`,
          {
            operation: 'validateOneSidedTransaction',
            required: totalCost.toString(),
            available: balance.available.toString(),
            amount: amount.toString(),
            estimatedFee: estimatedFee.toString()
          }
        );
      }

      // Validate UTXO selection capability
      await this.validateUtxoSelection(totalCost);

    } catch (error) {
      if (error instanceof WalletError) {
        throw error;
      }
      
      throw new WalletError(
        WalletErrorCode.BalanceFailed,
        'Failed to validate UTXO availability for one-sided transaction',
        {
          operation: 'validateOneSidedTransaction',
          amount: amount.toString(),
          cause: error
        }
      );
    }
  }

  /**
   * Validate UTXO selection for the transaction
   */
  @withErrorContext('validate_utxo_selection', 'onesided_validator')
  private async validateUtxoSelection(totalCost: MicroTari): Promise<void> {
    try {
      // Use FFI to preview UTXO selection
      const selection = await this.ffi.walletPreviewUtxoSelection(
        this.walletHandle,
        (totalCost as bigint).toString()
      );

      // Check if selection has any inputs (indicates success)
      if (!selection.inputs || selection.inputs.length === 0) {
        throw new WalletError(
          WalletErrorCode.InsufficientFunds,
          'Cannot select suitable UTXOs for one-sided transaction',
          {
            severity: ErrorSeverity.Error
          }
        );
      }

      // Validate that we don't need too many inputs (complexity limit)
      if (selection.inputs.length > 10) {
        throw new WalletError(
          WalletErrorCode.InvalidAmount,
          'One-sided transaction would require too many inputs, reducing complexity',
          {
            severity: ErrorSeverity.Error
          }
        );
      }

    } catch (error) {
      if (error instanceof WalletError) {
        throw error;
      }

      // If FFI call fails, do basic balance check
      console.warn('UTXO selection preview failed, falling back to basic validation:', error);
    }
  }

  /**
   * Validate script construction capability
   */
  @withErrorContext('validate_script_construction', 'onesided_validator')
  private async validateScriptConstruction(recipient: TariAddress): Promise<void> {
    try {
      // Validate that we can construct a TariScript for this recipient
      const scriptValidation = await this.ffi.walletValidateScript(
        this.walletHandle,
        recipient.toBase58(),
        'CheckPubKey' // Basic script type for one-sided transactions
      );

      if (!scriptValidation.valid) {
        throw new WalletError(
          WalletErrorCode.InvalidAddress,
          'Cannot construct TariScript for one-sided transaction to this recipient',
          {
            operation: 'validateOneSidedTransaction',
            recipient: recipient.toString(),
            scriptType: 'CheckPubKey',
            reason: scriptValidation.error || 'Unknown script validation error'
          }
        );
      }

      // Check script complexity
      if (scriptValidation.complexity && scriptValidation.complexity > this.config.maxScriptComplexity) {
        throw new WalletError(
          WalletErrorCode.InvalidAmount,
          `TariScript complexity (${scriptValidation.complexity}) exceeds maximum allowed (${this.config.maxScriptComplexity})`,
          {
            operation: 'validateOneSidedTransaction',
            complexity: scriptValidation.complexity,
            maxComplexity: this.config.maxScriptComplexity,
            recipient: recipient.toString()
          }
        );
      }

    } catch (error) {
      if (error instanceof WalletError) {
        throw error;
      }

      // If FFI call fails, skip script validation with warning
      console.warn('Script validation failed, proceeding without validation:', error);
    }
  }

  /**
   * Validate network-specific rules
   */
  @withErrorContext('validate_network_rules', 'onesided_validator')
  private async validateNetworkRules(amount: MicroTari): Promise<void> {
    try {
      // Get current network information
      const networkInfo = await this.ffi.walletGetNetworkInfo(this.walletHandle);
      
      // Apply network-specific validation rules
      switch (networkInfo.network) {
        case 'mainnet':
          await this.validateMainnetRules(amount);
          break;
        case 'testnet':
          await this.validateTestnetRules(amount);
          break;
        case 'nextnet':
          await this.validateNextnetRules(amount);
          break;
        default:
          console.warn(`Unknown network: ${networkInfo.network}, skipping network-specific validation`);
      }

    } catch (error) {
      if (error instanceof WalletError) {
        throw error;
      }

      // If network info fails, skip network validation
      console.warn('Network validation failed, proceeding without network-specific rules:', error);
    }
  }

  /**
   * Validate mainnet-specific rules
   */
  private async validateMainnetRules(amount: MicroTari): Promise<void> {
    // Mainnet has stricter limits for security
    const mainnetMaxAmount = BigInt(50000000) as MicroTari; // 50M microTari
    
    if (amount > mainnetMaxAmount) {
      throw new WalletError(
        WalletErrorCode.InvalidAmount,
        `One-sided transaction amount exceeds mainnet limit of ${mainnetMaxAmount}`,
        {
          operation: 'validateOneSidedTransaction',
          amount: amount.toString(),
          networkLimit: mainnetMaxAmount.toString(),
          network: 'mainnet'
        }
      );
    }
  }

  /**
   * Validate testnet-specific rules
   */
  private async validateTestnetRules(amount: MicroTari): Promise<void> {
    // Testnet allows larger amounts for testing
    // No additional restrictions beyond default config
  }

  /**
   * Validate nextnet-specific rules
   */
  private async validateNextnetRules(amount: MicroTari): Promise<void> {
    // Nextnet is for development, minimal restrictions
    // No additional restrictions beyond default config
  }

  /**
   * Check if stealth addressing is required
   */
  shouldUseStealth(): boolean {
    return this.config.requireStealth;
  }

  /**
   * Get one-sided transaction limits
   */
  getLimits(): {
    minAmount: MicroTari;
    maxAmount: MicroTari;
    maxScriptComplexity: number;
  } {
    return {
      minAmount: this.config.minOneSidedAmount,
      maxAmount: this.config.maxOneSidedAmount,
      maxScriptComplexity: this.config.maxScriptComplexity
    };
  }
}
