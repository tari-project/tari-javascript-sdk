import { FFIBindings } from '@tari-project/tarijs-core';
import {
  WalletHandle,
  TransactionId,
  MicroTari,
  WalletError,
  WalletErrorCode,
  withErrorContext,
  withRetry,
  RetryConfigs,
  validateTariAddress,
  validateMicroTari,
  validateRequired,
} from '@tari-project/tarijs-core';
import { TariAddress } from '../../models';
import { TransactionBuilder } from '../builder';
import { FeeEstimator } from '../fees';
import { RecipientValidator } from './recipient-validator';
import { AmountValidator } from './amount-validator';

/**
 * Options for standard transaction sending
 */
export interface StandardSendOptions {
  /** Custom fee per gram (if not provided, will be estimated) */
  feePerGram?: MicroTari;
  /** Message to include with the transaction */
  message?: string;
  /** Optional lock height for time-locked transactions */
  lockHeight?: number;
  /** Whether to allow sending to own address (default: false) */
  allowSelfSend?: boolean;
}

/**
 * Standard transaction sender implementing two-party transaction flow
 * 
 * Handles the complete standard transaction sending process including:
 * - Comprehensive recipient and amount validation
 * - Dynamic fee estimation with fallback options
 * - Balance verification and UTXO availability checks
 * - Transaction construction using the builder pattern
 * - FFI integration with error translation
 * - Retry logic for transient failures
 */
export class StandardSender {
  private readonly recipientValidator: RecipientValidator;
  private readonly amountValidator: AmountValidator;
  private readonly feeEstimator: FeeEstimator;

  constructor(
    private readonly walletHandle: WalletHandle,
    feeEstimator: FeeEstimator
  ) {
    this.recipientValidator = new RecipientValidator();
    this.amountValidator = new AmountValidator(walletHandle);
    this.feeEstimator = feeEstimator;
  }

  /**
   * Send a standard two-party transaction
   * 
   * This method implements the complete transaction sending flow:
   * 1. Validates recipient address format and accessibility
   * 2. Validates amount and checks sufficient balance
   * 3. Estimates transaction fee if not provided
   * 4. Constructs transaction using builder pattern
   * 5. Submits transaction via FFI with retry logic
   * 
   * @param recipient Target address (emoji, base58, or TariAddress object)
   * @param amount Amount to send in MicroTari
   * @param options Optional transaction parameters
   * @returns Promise resolving to transaction ID
   * 
   * @throws {WalletError} WalletErrorCode.INVALID_ADDRESS - Invalid recipient address
   * @throws {WalletError} WalletErrorCode.INVALID_AMOUNT - Invalid amount or zero
   * @throws {WalletError} WalletErrorCode.INSUFFICIENT_FUNDS - Not enough balance
   * @throws {WalletError} WalletErrorCode.SELF_SEND_NOT_ALLOWED - Attempting to send to own address
   * @throws {WalletError} WalletErrorCode.FEE_ESTIMATION_FAILED - Unable to estimate fees
   * @throws {WalletError} WalletErrorCode.TRANSACTION_SEND_FAILED - FFI transaction failure
   */
  @withErrorContext('standard_transaction_send', 'transaction')
  @withRetry(RetryConfigs.transaction())
  async sendTransaction(
    recipient: string | TariAddress,
    amount: MicroTari,
    options: StandardSendOptions = {}
  ): Promise<TransactionId> {
    // Step 1: Validate all inputs
    validateRequired(recipient, 'recipient');
    validateMicroTari(amount, 'amount');
    
    if (amount <= 0n) {
      throw new WalletError(
        WalletErrorCode.INVALID_AMOUNT,
        'Transaction amount must be greater than zero',
        { operation: 'sendTransaction', amount: amount.toString() }
      );
    }

    // Step 2: Resolve and validate recipient address
    const recipientAddress = await this.recipientValidator.validateAndResolve(
      recipient,
      options.allowSelfSend
    );

    // Step 3: Validate amount and check balance availability
    await this.amountValidator.validateSufficientBalance(amount, options.feePerGram);

    // Step 4: Build transaction with all parameters
    const builder = new TransactionBuilder()
      .recipient(recipientAddress)
      .amount(amount);

    // Add optional parameters
    if (options.message) {
      builder.message(options.message);
    }

    if (options.lockHeight) {
      builder.lockHeight(options.lockHeight);
    }

    // Step 5: Estimate fee if not provided
    let feePerGram = options.feePerGram;
    if (!feePerGram) {
      try {
        feePerGram = await this.feeEstimator.estimateFeePerGram(amount, 1);
      } catch (error) {
        throw new WalletError(
          WalletErrorCode.FEE_ESTIMATION_FAILED,
          'Failed to estimate transaction fee',
          { 
            operation: 'sendTransaction',
            amount: amount.toString(),
            recipient: recipientAddress.toDisplayString(),
            cause: error
          }
        );
      }
    }

    builder.feePerGram(feePerGram);

    // Step 6: Build and validate final transaction
    const transactionParams = builder.build();

    // Step 7: Submit transaction via FFI
    try {
      const txId = await FFIBindings.walletSendTransaction(
        this.walletHandle,
        recipientAddress.handle,
        amount,
        feePerGram,
        transactionParams.message || '',
        false // isOneSided = false for standard transactions
      );

      return TransactionId.from(txId);
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.TRANSACTION_SEND_FAILED,
        'Failed to send transaction via FFI',
        {
          operation: 'sendTransaction',
          amount: amount.toString(),
          recipient: recipientAddress.toDisplayString(),
          feePerGram: feePerGram.toString(),
          message: options.message || '',
          cause: error
        }
      );
    }
  }

  /**
   * Validate transaction parameters without sending
   * 
   * Performs all validation steps that would be done during sending
   * but without actually submitting the transaction. Useful for
   * pre-flight checks and form validation.
   * 
   * @param recipient Target address
   * @param amount Amount to send
   * @param options Transaction options
   * @returns Promise resolving to validation result with estimated fee
   */
  @withErrorContext('validate_transaction_params', 'transaction')
  async validateTransactionParams(
    recipient: string | TariAddress,
    amount: MicroTari,
    options: StandardSendOptions = {}
  ): Promise<{
    isValid: boolean;
    recipientAddress: TariAddress;
    estimatedFee: MicroTari;
    totalCost: MicroTari;
    errors: string[];
  }> {
    const errors: string[] = [];
    let recipientAddress: TariAddress | null = null;
    let estimatedFee = 0n;

    try {
      // Validate recipient
      recipientAddress = await this.recipientValidator.validateAndResolve(
        recipient,
        options.allowSelfSend
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
      validateMicroTari(amount, 'amount');
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
      // Estimate fee
      estimatedFee = options.feePerGram || 
        await this.feeEstimator.estimateFeePerGram(amount, 1);
    } catch (error) {
      errors.push('Failed to estimate transaction fee');
    }

    try {
      // Check balance
      if (estimatedFee > 0n) {
        await this.amountValidator.validateSufficientBalance(amount, estimatedFee);
      }
    } catch (error) {
      if (error instanceof WalletError) {
        errors.push(error.message);
      } else {
        errors.push('Insufficient balance');
      }
    }

    const totalCost = amount + estimatedFee;

    return {
      isValid: errors.length === 0,
      recipientAddress: recipientAddress || TariAddress.empty(),
      estimatedFee,
      totalCost,
      errors
    };
  }

  /**
   * Get transaction cost breakdown for a potential transaction
   * 
   * @param amount Transaction amount
   * @param feePerGram Optional custom fee per gram
   * @returns Promise resolving to cost breakdown
   */
  @withErrorContext('get_transaction_cost', 'transaction')
  async getTransactionCost(
    amount: MicroTari,
    feePerGram?: MicroTari
  ): Promise<{
    amount: MicroTari;
    estimatedFee: MicroTari;
    totalCost: MicroTari;
    feeBreakdown: {
      baseAmount: MicroTari;
      feePerGram: MicroTari;
      estimatedSizeGrams: number;
    };
  }> {
    validateMicroTari(amount, 'amount');

    const estimatedFeePerGram = feePerGram || 
      await this.feeEstimator.estimateFeePerGram(amount, 1);
    
    const estimatedSizeGrams = this.feeEstimator.estimateTransactionSize(1); // 1 output
    const estimatedFee = estimatedFeePerGram * BigInt(estimatedSizeGrams);
    const totalCost = amount + estimatedFee;

    return {
      amount,
      estimatedFee,
      totalCost,
      feeBreakdown: {
        baseAmount: amount,
        feePerGram: estimatedFeePerGram,
        estimatedSizeGrams
      }
    };
  }
}
