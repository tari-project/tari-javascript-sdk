/**
 * @fileoverview Transaction Builder
 * 
 * Provides a fluent API for constructing transactions with comprehensive validation,
 * fee estimation, and build options. Supports both standard and one-sided transactions
 * with automatic parameter validation and optimization suggestions.
 */

import {
  WalletError,
  WalletErrorCode,
  ErrorSeverity,
  withErrorContext,
  type MicroTari,
  type TariAddressString,
  type TransactionId
} from '@tari-project/tarijs-core';
import type {
  SendTransactionParams,
  SendOneSidedParams,
  TransactionBuildResult,
  TransactionValidationResult,
  FeeEstimate
} from '@tari-project/tarijs-core';
import { TariAddress } from '../../models/index.js';
import { FeeEstimator, FeePriority, type FeeEstimationResult } from '../fees/index.js';
import { TransactionValidator } from './validation.js';
import { BuildOptions, type TransactionBuildOptions } from './options.js';

/**
 * Transaction builder state
 */
interface BuilderState {
  /** Recipient address */
  recipient?: TariAddressString;
  /** Transaction amount */
  amount?: MicroTari;
  /** Fee per gram (if manually specified) */
  feePerGram?: MicroTari;
  /** Fee priority level */
  priority?: FeePriority;
  /** Transaction message */
  message?: string;
  /** Whether this is a one-sided transaction */
  isOneSided?: boolean;
  /** Maximum fee user is willing to pay */
  maxFee?: MicroTari;
  /** Minimum fee to use (safety net) */
  minFee?: MicroTari;
  /** Custom lock height */
  lockHeight?: number;
  /** Build options */
  options?: TransactionBuildOptions;
}

/**
 * Transaction build context
 */
export interface BuildContext {
  /** Fee estimator instance */
  feeEstimator: FeeEstimator;
  /** Transaction validator */
  validator: TransactionValidator;
  /** Whether to use strict validation */
  strictValidation: boolean;
  /** Default build options */
  defaultOptions: TransactionBuildOptions;
}

/**
 * Fluent transaction builder with validation and fee estimation
 */
export class TransactionBuilder {
  private readonly context: BuildContext;
  private readonly state: BuilderState = {};
  private isBuilt = false;

  constructor(context: BuildContext) {
    this.context = context;
    this.state.options = { ...context.defaultOptions };
  }

  /**
   * Set the recipient address
   */
  @withErrorContext('set_recipient', 'transaction_builder')
  to(recipient: TariAddressString | TariAddress): TransactionBuilder {
    this.ensureNotBuilt();
    
    if (recipient instanceof TariAddress) {
      this.state.recipient = recipient.toString();
    } else {
      this.state.recipient = recipient;
    }
    
    return this;
  }

  /**
   * Set the transaction amount
   */
  @withErrorContext('set_amount', 'transaction_builder')
  amount(amount: MicroTari | number | bigint): TransactionBuilder {
    this.ensureNotBuilt();
    
    if (typeof amount === 'number') {
      this.state.amount = BigInt(amount) as MicroTari;
    } else if (typeof amount === 'bigint') {
      this.state.amount = amount as MicroTari;
    } else {
      this.state.amount = amount;
    }
    
    return this;
  }

  /**
   * Set fee per gram manually
   */
  @withErrorContext('set_fee_per_gram', 'transaction_builder')
  feePerGram(feePerGram: MicroTari | number | bigint): TransactionBuilder {
    this.ensureNotBuilt();
    
    if (typeof feePerGram === 'number') {
      this.state.feePerGram = BigInt(feePerGram) as MicroTari;
    } else if (typeof feePerGram === 'bigint') {
      this.state.feePerGram = feePerGram as MicroTari;
    } else {
      this.state.feePerGram = feePerGram;
    }
    
    return this;
  }

  /**
   * Set fee priority (alternative to manual fee)
   */
  @withErrorContext('set_priority', 'transaction_builder')
  priority(priority: FeePriority): TransactionBuilder {
    this.ensureNotBuilt();
    this.state.priority = priority;
    return this;
  }

  /**
   * Add a message to the transaction
   */
  @withErrorContext('set_message', 'transaction_builder')
  message(message: string): TransactionBuilder {
    this.ensureNotBuilt();
    this.state.message = message;
    return this;
  }

  /**
   * Set as one-sided transaction
   */
  @withErrorContext('set_one_sided', 'transaction_builder')
  oneSided(isOneSided: boolean = true): TransactionBuilder {
    this.ensureNotBuilt();
    this.state.isOneSided = isOneSided;
    return this;
  }

  /**
   * Set maximum fee limit
   */
  @withErrorContext('set_max_fee', 'transaction_builder')
  maxFee(maxFee: MicroTari | number | bigint): TransactionBuilder {
    this.ensureNotBuilt();
    
    if (typeof maxFee === 'number') {
      this.state.maxFee = BigInt(maxFee) as MicroTari;
    } else if (typeof maxFee === 'bigint') {
      this.state.maxFee = maxFee as MicroTari;
    } else {
      this.state.maxFee = maxFee;
    }
    
    return this;
  }

  /**
   * Set minimum fee floor
   */
  @withErrorContext('set_min_fee', 'transaction_builder')
  minFee(minFee: MicroTari | number | bigint): TransactionBuilder {
    this.ensureNotBuilt();
    
    if (typeof minFee === 'number') {
      this.state.minFee = BigInt(minFee) as MicroTari;
    } else if (typeof minFee === 'bigint') {
      this.state.minFee = minFee as MicroTari;
    } else {
      this.state.minFee = minFee;
    }
    
    return this;
  }

  /**
   * Set lock height for time-locked transactions
   */
  @withErrorContext('set_lock_height', 'transaction_builder')
  lockHeight(height: number): TransactionBuilder {
    this.ensureNotBuilt();
    this.state.lockHeight = height;
    return this;
  }

  /**
   * Set build options
   */
  @withErrorContext('set_options', 'transaction_builder')
  options(options: Partial<TransactionBuildOptions>): TransactionBuilder {
    this.ensureNotBuilt();
    this.state.options = { ...this.state.options, ...options };
    return this;
  }

  /**
   * Enable/disable strict validation
   */
  @withErrorContext('set_strict_validation', 'transaction_builder')
  strictValidation(enabled: boolean = true): TransactionBuilder {
    this.ensureNotBuilt();
    this.context.strictValidation = enabled;
    return this;
  }

  /**
   * Quick configuration methods
   */

  /**
   * Configure for urgent transaction
   */
  urgent(): TransactionBuilder {
    return this.priority(FeePriority.Urgent);
  }

  /**
   * Configure for standard transaction
   */
  standard(): TransactionBuilder {
    return this.priority(FeePriority.Standard);
  }

  /**
   * Configure for economy transaction
   */
  economy(): TransactionBuilder {
    return this.priority(FeePriority.Economy);
  }

  /**
   * Configure for background transaction
   */
  background(): TransactionBuilder {
    return this.priority(FeePriority.Background);
  }

  /**
   * Estimate fee without building the transaction
   */
  @withErrorContext('estimate_fee', 'transaction_builder')
  async estimateFee(): Promise<FeeEstimationResult> {
    this.validateRequiredFields(['amount']);

    const amount = this.state.amount!;
    const priority = this.state.priority || FeePriority.Standard;

    const estimationOptions = {
      priority,
      maxFee: this.state.maxFee,
      minFee: this.state.minFee,
      useNetworkData: this.state.options?.useNetworkData !== false
    };

    return await this.context.feeEstimator.estimateFee(amount, estimationOptions);
  }

  /**
   * Validate the current builder state
   */
  @withErrorContext('validate', 'transaction_builder')
  async validate(): Promise<TransactionValidationResult> {
    const params = this.buildParams();
    return await this.context.validator.validateTransaction(params, this.context.strictValidation);
  }

  /**
   * Build the transaction parameters (dry run)
   */
  @withErrorContext('build_params', 'transaction_builder')
  buildParams(): SendTransactionParams | SendOneSidedParams {
    this.validateRequiredFields(['recipient', 'amount']);

    const baseParams = {
      recipient: this.state.recipient!,
      amount: this.state.amount!,
      message: this.state.message
    };

    // Determine fee per gram
    let feePerGram: MicroTari;
    if (this.state.feePerGram) {
      feePerGram = this.state.feePerGram;
    } else {
      // Will be estimated during build if not provided
      feePerGram = BigInt(25) as MicroTari; // Default fallback
    }

    if (this.state.isOneSided) {
      const oneSidedParams: SendOneSidedParams = {
        ...baseParams,
        feePerGram
      };
      return oneSidedParams;
    } else {
      const standardParams: SendTransactionParams = {
        ...baseParams,
        feePerGram,
        isOneSided: false
      };
      return standardParams;
    }
  }

  /**
   * Build the transaction with full validation and fee estimation
   */
  @withErrorContext('build', 'transaction_builder')
  async build(): Promise<TransactionBuildResult> {
    this.ensureNotBuilt();

    try {
      // Validate required fields
      this.validateRequiredFields(['recipient', 'amount']);

      // Estimate fee if not manually specified
      let feeEstimate: FeeEstimationResult | undefined;
      if (!this.state.feePerGram) {
        feeEstimate = await this.estimateFee();
        this.state.feePerGram = feeEstimate.feePerGram;
      }

      // Build transaction parameters
      const params = this.buildParams();

      // Validate transaction
      const validation = await this.validate();
      if (!validation.valid && this.context.strictValidation) {
        return {
          success: false,
          error: `Transaction validation failed: ${validation.errors.map(e => e.message).join(', ')}`,
          feeEstimate
        };
      }

      // Validate recipient address
      try {
        await TariAddress.fromString(this.state.recipient!);
      } catch (error) {
        return {
          success: false,
          error: `Invalid recipient address: ${this.state.recipient}`,
          feeEstimate
        };
      }

      // Create successful build result
      const result: TransactionBuildResult = {
        success: true,
        feeEstimate,
        // Note: transaction property would be populated by the service when actually sending
      };

      // Mark as built to prevent reuse
      this.isBuilt = true;

      return result;

    } catch (error) {
      return {
        success: false,
        error: `Failed to build transaction: ${error}`,
        feeEstimate: undefined
      };
    }
  }

  /**
   * Get the current builder state (for debugging)
   */
  getState(): Readonly<BuilderState> {
    return { ...this.state };
  }

  /**
   * Reset the builder to initial state
   */
  @withErrorContext('reset', 'transaction_builder')
  reset(): TransactionBuilder {
    Object.keys(this.state).forEach(key => {
      delete (this.state as any)[key];
    });
    this.state.options = { ...this.context.defaultOptions };
    this.isBuilt = false;
    return this;
  }

  /**
   * Clone the builder with current state
   */
  @withErrorContext('clone', 'transaction_builder')
  clone(): TransactionBuilder {
    const newBuilder = new TransactionBuilder(this.context);
    Object.assign(newBuilder.state, this.state);
    return newBuilder;
  }

  /**
   * Validate that required fields are set
   */
  private validateRequiredFields(fields: (keyof BuilderState)[]): void {
    const missing = fields.filter(field => this.state[field] === undefined);
    if (missing.length > 0) {
      throw new WalletError(
        WalletErrorCode.ValidationFailed,
        `Missing required fields: ${missing.join(', ')}`,
        ErrorSeverity.Error,
        { missingFields: missing, currentState: this.state }
      );
    }
  }

  /**
   * Ensure builder hasn't been built yet
   */
  private ensureNotBuilt(): void {
    if (this.isBuilt) {
      throw new WalletError(
        WalletErrorCode.InvalidOperation,
        'Transaction builder has already been built and cannot be modified',
        ErrorSeverity.Error
      );
    }
  }
}

/**
 * Transaction builder factory
 */
export class TransactionBuilderFactory {
  private readonly context: BuildContext;

  constructor(context: BuildContext) {
    this.context = context;
  }

  /**
   * Create a new transaction builder
   */
  create(): TransactionBuilder {
    return new TransactionBuilder(this.context);
  }

  /**
   * Create a builder for standard transaction
   */
  standard(): TransactionBuilder {
    return this.create().standard();
  }

  /**
   * Create a builder for one-sided transaction
   */
  oneSided(): TransactionBuilder {
    return this.create().oneSided();
  }

  /**
   * Create a builder for urgent transaction
   */
  urgent(): TransactionBuilder {
    return this.create().urgent();
  }

  /**
   * Create a builder for economy transaction
   */
  economy(): TransactionBuilder {
    return this.create().economy();
  }

  /**
   * Create a builder with pre-filled recipient
   */
  to(recipient: TariAddressString | TariAddress): TransactionBuilder {
    return this.create().to(recipient);
  }

  /**
   * Create a builder with pre-filled amount
   */
  amount(amount: MicroTari | number | bigint): TransactionBuilder {
    return this.create().amount(amount);
  }
}

/**
 * Utility functions for transaction building
 */
export class BuilderUtils {
  /**
   * Create transaction parameters from builder state
   */
  static createParams(state: BuilderState): SendTransactionParams | SendOneSidedParams {
    if (!state.recipient || !state.amount || !state.feePerGram) {
      throw new WalletError(
        WalletErrorCode.ValidationFailed,
        'Incomplete transaction parameters',
        ErrorSeverity.Error
      );
    }

    const baseParams = {
      recipient: state.recipient,
      amount: state.amount,
      feePerGram: state.feePerGram,
      message: state.message
    };

    if (state.isOneSided) {
      return baseParams as SendOneSidedParams;
    } else {
      return {
        ...baseParams,
        isOneSided: false
      } as SendTransactionParams;
    }
  }

  /**
   * Validate builder state completeness
   */
  static validateState(state: BuilderState): string[] {
    const errors: string[] = [];

    if (!state.recipient) {
      errors.push('Recipient address is required');
    }

    if (!state.amount || state.amount <= 0n) {
      errors.push('Valid amount is required');
    }

    if (state.message && state.message.length > 512) {
      errors.push('Message exceeds maximum length of 512 characters');
    }

    if (state.lockHeight && state.lockHeight < 0) {
      errors.push('Lock height must be non-negative');
    }

    return errors;
  }

  /**
   * Estimate total transaction cost
   */
  static estimateTotalCost(
    amount: MicroTari,
    feeEstimate: FeeEstimationResult
  ): MicroTari {
    return (amount + feeEstimate.totalFee) as MicroTari;
  }

  /**
   * Check if amount is below dust threshold
   */
  static isDustAmount(amount: MicroTari, dustThreshold: MicroTari = BigInt(100) as MicroTari): boolean {
    return amount < dustThreshold;
  }
}
