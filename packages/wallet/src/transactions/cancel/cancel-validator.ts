/**
 * @fileoverview Transaction Cancellation Validator
 * 
 * Validates whether transactions can be cancelled based on state,
 * direction, age, and other business rules.
 */

import {
  WalletError,
  WalletErrorCode,
  withErrorContext,
  type TransactionId,
  type PendingOutboundTransaction,
  type UnixTimestamp
} from '@tari-project/tarijs-core';
import type { CancellationServiceConfig } from './cancellation-service.js';

/**
 * Validation rules for transaction cancellation
 */
export interface CancellationValidationRules {
  /** Maximum age for cancellable transactions (hours) */
  maxAgeHours: number;
  /** Whether to allow cancellation of older transactions */
  allowOlderTransactions: boolean;
  /** Minimum time since transaction creation (seconds) */
  minAgeSeconds: number;
  /** Whether to validate transaction direction */
  enforceOutboundOnly: boolean;
  /** Additional custom validation rules */
  customRules: Array<(transaction: PendingOutboundTransaction) => Promise<void>>;
}

/**
 * Result of validation check
 */
export interface ValidationResult {
  /** Whether the transaction can be cancelled */
  isValid: boolean;
  /** Detailed validation results */
  checks: {
    exists: boolean;
    isPending: boolean;
    isOutbound: boolean;
    withinAgeLimit: boolean;
    aboveMinAge: boolean;
    customRulesPassed: boolean;
  };
  /** Error messages for failed checks */
  errors: string[];
  /** Warnings that don't prevent cancellation */
  warnings: string[];
}

/**
 * Transaction cancellation validator
 * 
 * Provides comprehensive validation for transaction cancellation eligibility
 * including existence, state, direction, age, and custom business rules.
 */
export class CancelValidator {
  private readonly config: CancellationServiceConfig;
  private readonly validationRules: CancellationValidationRules;
  private isDisposed = false;

  constructor(config: CancellationServiceConfig) {
    this.config = config;
    this.validationRules = this.createValidationRules();
  }

  /**
   * Validate if a transaction can be cancelled
   */
  @withErrorContext('validate_cancellation', 'cancel_validator')
  async validateCancellation(
    transactionId: TransactionId,
    transaction: PendingOutboundTransaction | null
  ): Promise<void> {
    this.ensureNotDisposed();
    
    const result = await this.performValidation(transactionId, transaction);
    
    if (!result.isValid) {
      const errorMessage = result.errors.join('; ');
      
      // Determine the most appropriate error code
      let errorCode = WalletErrorCode.TransactionCancellationFailed;
      
      if (!result.checks.exists) {
        errorCode = WalletErrorCode.TransactionNotFound;
      } else if (!result.checks.isPending) {
        errorCode = WalletErrorCode.TransactionAlreadyConfirmed;
      } else if (!result.checks.isOutbound) {
        errorCode = WalletErrorCode.TransactionCancellationNotAllowed;
      } else if (!result.checks.withinAgeLimit || !result.checks.aboveMinAge) {
        errorCode = WalletErrorCode.TransactionCancellationExpired;
      }
      
      throw new WalletError(
        errorCode,
        `Cannot cancel transaction ${transactionId}: ${errorMessage}`,
        {
          transactionId,
          validationResult: result
        }
      );
    }
  }

  /**
   * Perform detailed validation and return results
   */
  @withErrorContext('perform_validation', 'cancel_validator')
  async performValidation(
    transactionId: TransactionId,
    transaction: PendingOutboundTransaction | null
  ): Promise<ValidationResult> {
    this.ensureNotDisposed();
    
    const result: ValidationResult = {
      isValid: true,
      checks: {
        exists: false,
        isPending: false,
        isOutbound: false,
        withinAgeLimit: false,
        aboveMinAge: false,
        customRulesPassed: false
      },
      errors: [],
      warnings: []
    };

    // Check 1: Transaction exists
    if (!transaction) {
      result.checks.exists = false;
      result.errors.push('Transaction not found or not in pending outbound list');
    } else {
      result.checks.exists = true;
    }

    if (!transaction) {
      result.isValid = false;
      return result;
    }

    // Check 2: Transaction is pending
    if (transaction.status !== 'Pending') {
      result.checks.isPending = false;
      result.errors.push(`Transaction is in ${transaction.status} state, not Pending`);
    } else {
      result.checks.isPending = true;
    }

    // Check 3: Transaction is outbound (implicit in PendingOutboundTransaction)
    result.checks.isOutbound = true;

    // Check 4: Within age limit
    const now = Date.now();
    const transactionAge = (now - transaction.timestamp) / (1000 * 60 * 60); // hours
    
    if (this.validationRules.allowOlderTransactions || transactionAge <= this.validationRules.maxAgeHours) {
      result.checks.withinAgeLimit = true;
    } else {
      result.checks.withinAgeLimit = false;
      result.errors.push(
        `Transaction is too old (${transactionAge.toFixed(2)} hours, max ${this.validationRules.maxAgeHours} hours)`
      );
    }

    // Check 5: Above minimum age
    const transactionAgeSeconds = (now - transaction.timestamp) / 1000;
    
    if (transactionAgeSeconds >= this.validationRules.minAgeSeconds) {
      result.checks.aboveMinAge = true;
    } else {
      result.checks.aboveMinAge = false;
      const remainingSeconds = this.validationRules.minAgeSeconds - transactionAgeSeconds;
      result.errors.push(
        `Transaction is too recent (wait ${remainingSeconds.toFixed(0)} more seconds)`
      );
    }

    // Check 6: Custom validation rules
    try {
      for (const customRule of this.validationRules.customRules) {
        await customRule(transaction);
      }
      result.checks.customRulesPassed = true;
    } catch (error: unknown) {
      result.checks.customRulesPassed = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Custom validation failed: ${errorMessage}`);
    }

    // Add warnings for edge cases
    if (transactionAge > this.validationRules.maxAgeHours / 2) {
      result.warnings.push('Transaction is relatively old; cancellation success may be lower');
    }

    if (transaction.amount && BigInt(transaction.amount) > BigInt(1000000000)) { // > 1 Tari
      result.warnings.push('Large transaction amount; ensure cancellation is intended');
    }

    // Determine overall validity
    result.isValid = Object.values(result.checks).every(check => check === true);

    return result;
  }

  /**
   * Quick check if a transaction ID can potentially be cancelled
   */
  @withErrorContext('quick_validation_check', 'cancel_validator')
  async quickValidationCheck(transactionId: TransactionId): Promise<boolean> {
    this.ensureNotDisposed();
    
    try {
      // This is a lightweight check that doesn't require the full transaction object
      // In a real implementation, this might check just the transaction status
      // without fetching the complete transaction data
      
      if (!transactionId || transactionId.length === 0) {
        return false;
      }
      
      // Basic format validation
      if (typeof transactionId !== 'string') {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get validation rules currently in use
   */
  @withErrorContext('get_validation_rules', 'cancel_validator')
  getValidationRules(): CancellationValidationRules {
    this.ensureNotDisposed();
    return { ...this.validationRules };
  }

  /**
   * Update validation rules
   */
  @withErrorContext('update_validation_rules', 'cancel_validator')
  updateValidationRules(updates: Partial<CancellationValidationRules>): void {
    this.ensureNotDisposed();
    
    Object.assign(this.validationRules, updates);
    
    // Validate the updated rules
    this.validateRules();
  }

  /**
   * Add a custom validation rule
   */
  @withErrorContext('add_custom_rule', 'cancel_validator')
  addCustomRule(rule: (transaction: PendingOutboundTransaction) => Promise<void>): void {
    this.ensureNotDisposed();
    
    if (typeof rule !== 'function') {
      throw new WalletError(
        WalletErrorCode.InvalidArgument,
        'Custom rule must be a function'
      );
    }
    
    this.validationRules.customRules.push(rule);
  }

  /**
   * Remove all custom validation rules
   */
  @withErrorContext('clear_custom_rules', 'cancel_validator')
  clearCustomRules(): void {
    this.ensureNotDisposed();
    this.validationRules.customRules = [];
  }

  /**
   * Get detailed validation status for debugging
   */
  @withErrorContext('get_validation_status', 'cancel_validator')
  async getValidationStatus(
    transactionId: TransactionId,
    transaction: PendingOutboundTransaction | null
  ): Promise<{
    transactionId: TransactionId;
    validationResult: ValidationResult;
    timestamp: UnixTimestamp;
    validatorConfig: CancellationValidationRules;
  }> {
    this.ensureNotDisposed();
    
    const validationResult = await this.performValidation(transactionId, transaction);
    
    return {
      transactionId,
      validationResult,
      timestamp: Date.now() as UnixTimestamp,
      validatorConfig: this.getValidationRules()
    };
  }

  /**
   * Create validation rules from configuration
   */
  private createValidationRules(): CancellationValidationRules {
    return {
      maxAgeHours: this.config.maxCancellationAgeHours,
      allowOlderTransactions: this.config.allowOlderTransactionCancellation,
      minAgeSeconds: 5, // Minimum 5 seconds to prevent accidental immediate cancellation
      enforceOutboundOnly: true,
      customRules: []
    };
  }

  /**
   * Validate the current rules configuration
   */
  private validateRules(): void {
    if (this.validationRules.maxAgeHours <= 0) {
      throw new WalletError(
        WalletErrorCode.InvalidConfiguration,
        'Max age hours must be positive'
      );
    }
    
    if (this.validationRules.minAgeSeconds < 0) {
      throw new WalletError(
        WalletErrorCode.InvalidConfiguration,
        'Min age seconds cannot be negative'
      );
    }
    
    if (this.validationRules.minAgeSeconds > this.validationRules.maxAgeHours * 3600) {
      throw new WalletError(
        WalletErrorCode.InvalidConfiguration,
        'Min age seconds cannot exceed max age hours'
      );
    }
  }

  /**
   * Ensure validator is not disposed
   */
  private ensureNotDisposed(): void {
    if (this.isDisposed) {
      throw new WalletError(
        WalletErrorCode.ResourceDisposed,
        'Cancel validator has been disposed'
      );
    }
  }

  /**
   * Dispose of the validator
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }
    
    this.isDisposed = true;
    this.validationRules.customRules = [];
  }
}
