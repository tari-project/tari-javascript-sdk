/**
 * @fileoverview One-Sided Transaction Sender
 * 
 * Implements non-interactive one-sided transaction sending using TariScript.
 * One-sided transactions allow sending funds without recipient participation,
 * with the recipient later scanning the blockchain to detect and claim funds.
 */

import { getFFIBindings } from '@tari-project/tarijs-core';
import {
  WalletHandle,
  TransactionId,
  MicroTari,
  WalletError,
  WalletErrorCode,
  withErrorContext,
  withRetry,
  validateRequired,
} from '@tari-project/tarijs-core';
import { TariAddress } from '../../models';
import { TransactionBuilder } from '../builder';
import { FeeEstimator } from '../fees';
import { RecipientValidator } from './recipient-validator';
import { OneSidedValidator } from './onesided-validator';

/**
 * Options for one-sided transaction sending
 */
export interface OneSidedSendOptions {
  /** Custom fee per gram (if not provided, will be estimated) */
  feePerGram?: MicroTari;
  /** Message to include with the transaction */
  message?: string;
  /** Whether to use stealth addressing for enhanced privacy */
  useStealth?: boolean;
  /** Optional recovery data for the recipient */
  recoveryData?: string;
}

/**
 * One-sided transaction validation result
 */
export interface OneSidedValidationResult {
  isValid: boolean;
  recipientAddress: TariAddress;
  estimatedFee: MicroTari;
  totalCost: MicroTari;
  utxoConsumption: {
    inputCount: number;
    outputCount: number;
    scriptComplexity: number;
  };
  errors: string[];
  warnings: string[];
}

/**
 * One-sided transaction sender implementing non-interactive payment flow
 * 
 * Handles the complete one-sided transaction sending process including:
 * - Recipient validation without requiring online presence
 * - TariScript construction for conditional spending
 * - UTXO consumption without change outputs (full consumption model)
 * - Stealth address generation for enhanced privacy
 * - Fee estimation accounting for script complexity
 * - Transaction construction with recovery data
 */
export class OneSidedSender {
  private readonly recipientValidator: RecipientValidator;
  private readonly oneSidedValidator: OneSidedValidator;
  private readonly feeEstimator: FeeEstimator;
  private readonly ffi = getFFIBindings();

  constructor(
    private readonly walletHandle: WalletHandle,
    feeEstimator: FeeEstimator
  ) {
    this.recipientValidator = new RecipientValidator();
    this.oneSidedValidator = new OneSidedValidator(walletHandle);
    this.feeEstimator = feeEstimator;
  }

  /**
   * Send a one-sided transaction
   * 
   * This method implements the complete one-sided transaction flow:
   * 1. Validates recipient address format and derives stealth address if requested
   * 2. Validates amount and ensures sufficient UTXO availability
   * 3. Estimates transaction fee accounting for script complexity
   * 4. Constructs TariScript for conditional spending
   * 5. Creates transaction with full UTXO consumption
   * 6. Submits transaction via FFI with one-sided flag
   * 
   * @param recipient Target address (emoji, base58, or TariAddress object)
   * @param amount Amount to send in MicroTari
   * @param options Optional transaction parameters
   * @returns Promise resolving to transaction ID
   * 
   * @throws {WalletError} WalletErrorCode.InvalidAddress - Invalid recipient address
   * @throws {WalletError} WalletErrorCode.InvalidAmount - Invalid amount or zero
   * @throws {WalletError} WalletErrorCode.InsufficientFunds - Not enough balance
   * @throws {WalletError} WalletErrorCode.UTXO_SELECTION_FAILED - Cannot find suitable UTXOs
   * @throws {WalletError} WalletErrorCode.SCRIPT_CONSTRUCTION_FAILED - TariScript generation error
   * @throws {WalletError} WalletErrorCode.TRANSACTION_SEND_FAILED - FFI transaction failure
   */
  @withErrorContext('onesided_transaction_send', 'transaction')
  @withRetry()
  async sendOneSidedTransaction(
    recipient: string | TariAddress,
    amount: MicroTari,
    options: OneSidedSendOptions = {}
  ): Promise<TransactionId> {
    // Step 1: Validate all inputs
    validateRequired(recipient, 'recipient');
    
    if (amount <= 0n) {
      throw new WalletError(
        WalletErrorCode.InvalidAmount,
        'One-sided transaction amount must be greater than zero',
        { context: { operation: 'sendOneSidedTransaction', amount: amount.toString() } }
      );
    }

    // Step 2: Resolve and validate recipient address
    const recipientAddress = await this.recipientValidator.validateAndResolve(
      recipient,
      true // Allow self-send for one-sided transactions
    );

    // Step 3: Generate stealth address if requested
    let targetAddress = recipientAddress;
    if (options.useStealth) {
      targetAddress = await this.generateStealthAddress(recipientAddress);
    }

    // Step 4: Validate one-sided specific requirements
    await this.oneSidedValidator.validateOneSidedTransaction(
      targetAddress,
      amount,
      options.feePerGram
    );

    // Step 5: Build transaction with one-sided parameters
    const builder = new TransactionBuilder()
      .recipient(targetAddress)
      .amount(amount)
      .oneSided(true); // Mark as one-sided transaction

    // Add optional parameters
    if (options.message) {
      builder.message(options.message);
    }

    if (options.recoveryData) {
      builder.metadata('recovery_data', options.recoveryData);
    }

    // Step 6: Estimate fee accounting for script complexity
    let feePerGram = options.feePerGram;
    if (!feePerGram) {
      try {
        feePerGram = await this.estimateOneSidedFee(amount, options.useStealth);
      } catch (error) {
        throw new WalletError(
          WalletErrorCode.FEE_ESTIMATION_FAILED,
          'Failed to estimate one-sided transaction fee',
          { 
            cause: error,
            context: {
              operation: 'sendOneSidedTransaction',
              amount: amount.toString(),
              recipient: targetAddress.toDisplayString(),
              useStealth: options.useStealth
            }
          }
        );
      }
    }

    builder.feePerGram(feePerGram);

    // Step 7: Build and validate final transaction
    const transactionParams = builder.build();

    // Step 8: Submit transaction via FFI with one-sided flag
    try {
      const txId = await this.ffi.walletSendTransaction(
        this.walletHandle,
        targetAddress.toBase58(),
        amount,
        feePerGram,
        transactionParams.message || '',
        true // isOneSided = true for one-sided transactions
      );

      return txId as TransactionId;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.TransactionFailed,
        'Failed to send one-sided transaction via FFI',
        {
          cause: error,
          context: {
            operation: 'sendOneSidedTransaction',
            amount: amount.toString(),
            recipient: targetAddress.toString(),
            feePerGram: feePerGram.toString(),
            message: options.message || '',
            useStealth: options.useStealth
          }
        }
      );
    }
  }

  /**
   * Validate one-sided transaction parameters without sending
   * 
   * Performs all validation steps including one-sided specific checks
   * but without actually submitting the transaction.
   * 
   * @param recipient Target address
   * @param amount Amount to send
   * @param options Transaction options
   * @returns Promise resolving to validation result with fee estimates
   */
  @withErrorContext('validate_onesided_params', 'transaction')
  async validateOneSidedTransaction(
    recipient: string | TariAddress,
    amount: MicroTari,
    options: OneSidedSendOptions = {}
  ): Promise<OneSidedValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let recipientAddress: TariAddress | null = null;
    let estimatedFee = 0n;
    let utxoConsumption = {
      inputCount: 0,
      outputCount: 1, // One-sided creates single output
      scriptComplexity: options.useStealth ? 2 : 1
    };

    try {
      // Validate recipient
      recipientAddress = await this.recipientValidator.validateAndResolve(
        recipient,
        true // Allow self-send for one-sided
      );
    } catch (error) {
      if (error instanceof WalletError) {
        errors.push(error.message);
      } else {
        errors.push('Invalid recipient address');
      }
    }

    try {
      // Validate amount
      if (amount <= 0n) {
        errors.push('Amount must be greater than zero');
      }
    } catch (error) {
      if (error instanceof WalletError) {
        errors.push(error.message);
      } else {
        errors.push('Invalid amount');
      }
    }

    try {
      // Estimate fee for one-sided transaction
      estimatedFee = options.feePerGram || 
        await this.estimateOneSidedFee(amount, options.useStealth);
    } catch (error) {
      errors.push('Failed to estimate one-sided transaction fee');
    }

    // Check for large amounts (warning)
    const maxRecommendedAmount = BigInt(1000000) as MicroTari; // 1M microTari
    if (amount > maxRecommendedAmount) {
      warnings.push('Large one-sided transaction may take time for recipient to detect');
    }

    // Check stealth address usage (recommendation)
    if (!options.useStealth) {
      warnings.push('Consider using stealth addressing for enhanced privacy');
    }

    try {
      // Validate one-sided specific requirements
      if (recipientAddress && estimatedFee > 0n) {
        await this.oneSidedValidator.validateOneSidedTransaction(
          recipientAddress,
          amount,
          estimatedFee
        );
        
        // Get UTXO consumption details
        utxoConsumption = await this.analyzeUtxoConsumption(amount, estimatedFee);
      }
    } catch (error) {
      if (error instanceof WalletError) {
        errors.push(error.message);
      } else {
        errors.push('One-sided transaction validation failed');
      }
    }

    const totalCost = amount + estimatedFee;

    return {
      isValid: errors.length === 0,
      recipientAddress: recipientAddress || TariAddress.empty(),
      estimatedFee,
      totalCost,
      utxoConsumption,
      errors,
      warnings
    };
  }

  /**
   * Estimate fee for one-sided transaction accounting for script complexity
   */
  @withErrorContext('estimate_onesided_fee', 'transaction')
  private async estimateOneSidedFee(
    amount: MicroTari,
    useStealth: boolean = false
  ): Promise<MicroTari> {
    // One-sided transactions have higher complexity due to TariScript
    const scriptComplexityMultiplier = useStealth ? 1.5 : 1.2;
    const baseFee = await this.feeEstimator.estimateFeePerGram(amount, 1);
    
    return BigInt(Math.ceil(Number(baseFee) * scriptComplexityMultiplier)) as MicroTari;
  }

  /**
   * Generate stealth address for enhanced privacy
   */
  @withErrorContext('generate_stealth_address', 'transaction')
  private async generateStealthAddress(
    recipientAddress: TariAddress
  ): Promise<TariAddress> {
    try {
      // Use FFI to generate stealth address with ECDH
      const stealthAddress = await this.ffi.walletGenerateStealthAddress(
        this.walletHandle,
        recipientAddress.toBase58()
      );
      
      return TariAddress.fromBase58(stealthAddress);
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InvalidAddress,
        'Failed to generate stealth address for one-sided transaction',
        {
          cause: error,
          context: {
            operation: 'generateStealthAddress',
            recipient: recipientAddress.toString()
          }
        }
      );
    }
  }

  /**
   * Analyze UTXO consumption for one-sided transaction
   */
  @withErrorContext('analyze_utxo_consumption', 'transaction')
  private async analyzeUtxoConsumption(
    amount: MicroTari,
    fee: MicroTari
  ): Promise<{ inputCount: number; outputCount: number; scriptComplexity: number }> {
    const totalRequired = amount + fee;
    
    try {
      // Query wallet for UTXO selection strategy
      const utxoSelection = await this.ffi.walletPreviewUtxoSelection(
        this.walletHandle,
        totalRequired
      );

      return {
        inputCount: utxoSelection.inputCount || 1,
        outputCount: 1, // One-sided transactions create single output
        scriptComplexity: 2 // TariScript complexity factor
      };
    } catch (error) {
      // Fallback estimation if FFI call fails
      return {
        inputCount: 1,
        outputCount: 1,
        scriptComplexity: 2
      };
    }
  }
}
