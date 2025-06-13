/**
 * @fileoverview Transaction Validation
 * 
 * Provides comprehensive validation for transaction parameters including
 * address validation, amount checks, fee validation, and business rule
 * enforcement. Supports both strict and lenient validation modes.
 */

import {
  WalletError,
  WalletErrorCode,
  ErrorSeverity,
  withErrorContext,
  type MicroTari,
  type TariAddressString
} from '@tari-project/tarijs-core';
import type {
  SendTransactionParams,
  SendOneSidedParams,
  TransactionValidationResult,
  TransactionValidationError,
  TransactionValidationWarning
} from '@tari-project/tarijs-core';
import { TariAddress } from '../../models/index.js';

/**
 * Validation configuration
 */
export interface ValidationConfig {
  /** Minimum transaction amount in MicroTari */
  minimumAmount: MicroTari;
  /** Maximum transaction amount in MicroTari */
  maximumAmount: MicroTari;
  /** Minimum fee per gram */
  minimumFeePerGram: MicroTari;
  /** Maximum fee per gram */
  maximumFeePerGram: MicroTari;
  /** Maximum message length */
  maxMessageLength: number;
  /** Dust threshold for warnings */
  dustThreshold: MicroTari;
  /** Maximum fee ratio (fee/amount) for warnings */
  maxFeeRatio: number;
  /** Custom validation rules */
  customRules?: ValidationRule[];
}

/**
 * Custom validation rule
 */
export interface ValidationRule {
  /** Rule identifier */
  id: string;
  /** Rule description */
  description: string;
  /** Validation function */
  validate: (params: SendTransactionParams | SendOneSidedParams) => ValidationRuleResult;
  /** Severity level */
  severity: 'error' | 'warning';
  /** Whether rule applies to one-sided transactions */
  appliesToOneSided: boolean;
}

/**
 * Validation rule result
 */
export interface ValidationRuleResult {
  /** Whether rule passed */
  passed: boolean;
  /** Error/warning message if failed */
  message?: string;
  /** Additional context */
  context?: Record<string, any>;
}

/**
 * Address validation result
 */
export interface AddressValidationResult {
  /** Whether address is valid */
  valid: boolean;
  /** Address format detected */
  format?: 'emoji' | 'base58' | 'hex';
  /** Normalized address string */
  normalized?: string;
  /** Error message if invalid */
  error?: string;
  /** Address type info */
  addressInfo?: {
    network: string;
    version: number;
    checksum: boolean;
  };
}

/**
 * Balance validation context
 */
export interface BalanceValidationContext {
  /** Available balance */
  availableBalance: MicroTari;
  /** Pending outbound amount */
  pendingOutbound: MicroTari;
  /** Reserved balance (locked UTXOs) */
  reservedBalance: MicroTari;
  /** Minimum required balance to keep */
  minimumBalance: MicroTari;
}

/**
 * Comprehensive transaction validator
 */
export class TransactionValidator {
  private readonly config: ValidationConfig;
  private balanceContext?: BalanceValidationContext;

  constructor(config: ValidationConfig) {
    this.config = config;
  }

  /**
   * Set balance context for validation
   */
  setBalanceContext(context: BalanceValidationContext): void {
    this.balanceContext = context;
  }

  /**
   * Validate a transaction with comprehensive checks
   */
  @withErrorContext('validate_transaction', 'transaction_validator')
  async validateTransaction(
    params: SendTransactionParams | SendOneSidedParams,
    strict: boolean = false
  ): Promise<TransactionValidationResult> {
    const errors: TransactionValidationError[] = [];
    const warnings: TransactionValidationWarning[] = [];

    // Core parameter validation
    this.validateAmount(params.amount, errors, warnings);
    if (params.feePerGram !== undefined) {
      this.validateFeePerGram(params.feePerGram, errors, warnings);
    }
    await this.validateRecipient(params.recipient, errors, warnings);
    this.validateMessage(params.message, errors, warnings);

    // Transaction-specific validation
    if ('isOneSided' in params && params.isOneSided) {
      this.validateOneSidedTransaction(params, errors, warnings);
    } else {
      this.validateStandardTransaction(params as SendTransactionParams, errors, warnings);
    }

    // Balance validation if context available
    if (this.balanceContext) {
      this.validateBalance(params, errors, warnings);
    }

    // Business rule validation
    this.validateBusinessRules(params, errors, warnings);

    // Custom rule validation
    if (this.config.customRules) {
      this.validateCustomRules(params, errors, warnings);
    }

    // Economic validation
    this.validateEconomics(params, errors, warnings);

    // In strict mode, warnings become errors
    if (strict) {
      warnings.forEach(warning => {
        errors.push({
          code: warning.code,
          message: `[Strict] ${warning.message}`,
          field: warning.field
        });
      });
      warnings.length = 0;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate recipient address
   */
  @withErrorContext('validate_address', 'transaction_validator')
  async validateAddress(address: TariAddressString): Promise<AddressValidationResult> {
    try {
      const tariAddress = await TariAddress.fromString(address);
      
      return {
        valid: true,
        format: this.detectAddressFormat(address),
        normalized: tariAddress.toString(),
        addressInfo: {
          network: 'mainnet', // Would be determined from address
          version: 1,
          checksum: true
        }
      };
    } catch (error: unknown) {
      return {
        valid: false,
        error: `Invalid address format: ${error}`
      };
    }
  }

  /**
   * Validate amount parameter
   */
  private validateAmount(
    amount: MicroTari,
    errors: TransactionValidationError[],
    warnings: TransactionValidationWarning[]
  ): void {
    // Check if amount is positive
    if (amount <= 0n) {
      errors.push({
        code: 'INVALID_AMOUNT',
        message: 'Transaction amount must be positive',
        field: 'amount'
      });
      return;
    }

    // Check minimum amount
    if (amount < this.config.minimumAmount) {
      errors.push({
        code: 'AMOUNT_TOO_SMALL',
        message: `Amount ${amount} is below minimum ${this.config.minimumAmount}`,
        field: 'amount'
      });
    }

    // Check maximum amount
    if (amount > this.config.maximumAmount) {
      errors.push({
        code: 'AMOUNT_TOO_LARGE',
        message: `Amount ${amount} exceeds maximum ${this.config.maximumAmount}`,
        field: 'amount'
      });
    }

    // Check for dust amount
    if (amount < this.config.dustThreshold) {
      warnings.push({
        code: 'DUST_AMOUNT',
        message: 'Transaction amount is below dust threshold',
        field: 'amount',
        recommendation: `Consider sending at least ${this.config.dustThreshold} MicroTari`
      });
    }
  }

  /**
   * Validate fee per gram
   */
  private validateFeePerGram(
    feePerGram: MicroTari,
    errors: TransactionValidationError[],
    warnings: TransactionValidationWarning[]
  ): void {
    // Check if fee is positive
    if (feePerGram <= 0n) {
      errors.push({
        code: 'INVALID_FEE',
        message: 'Fee per gram must be positive',
        field: 'feePerGram'
      });
      return;
    }

    // Check minimum fee
    if (feePerGram < this.config.minimumFeePerGram) {
      warnings.push({
        code: 'FEE_TOO_LOW',
        message: `Fee per gram ${feePerGram} is below recommended minimum ${this.config.minimumFeePerGram}`,
        field: 'feePerGram',
        recommendation: 'Transaction may take longer to confirm'
      });
    }

    // Check maximum fee
    if (feePerGram > this.config.maximumFeePerGram) {
      warnings.push({
        code: 'FEE_TOO_HIGH',
        message: `Fee per gram ${feePerGram} is above recommended maximum ${this.config.maximumFeePerGram}`,
        field: 'feePerGram',
        recommendation: 'Consider using a lower fee to save costs'
      });
    }
  }

  /**
   * Validate recipient address
   */
  private async validateRecipient(
    recipient: TariAddressString,
    errors: TransactionValidationError[],
    warnings: TransactionValidationWarning[]
  ): Promise<void> {
    if (!recipient || recipient.trim().length === 0) {
      errors.push({
        code: 'MISSING_RECIPIENT',
        message: 'Recipient address is required',
        field: 'recipient'
      });
      return;
    }

    const addressValidation = await this.validateAddress(recipient);
    if (!addressValidation.valid) {
      errors.push({
        code: 'INVALID_RECIPIENT',
        message: addressValidation.error || 'Invalid recipient address',
        field: 'recipient'
      });
    }
  }

  /**
   * Validate message parameter
   */
  private validateMessage(
    message: string | undefined,
    errors: TransactionValidationError[],
    warnings: TransactionValidationWarning[]
  ): void {
    if (!message) {
      return; // Message is optional
    }

    if (message.length > this.config.maxMessageLength) {
      errors.push({
        code: 'MESSAGE_TOO_LONG',
        message: `Message length ${message.length} exceeds maximum ${this.config.maxMessageLength}`,
        field: 'message'
      });
    }

    // Check for potentially problematic characters
    if (message.includes('\0')) {
      warnings.push({
        code: 'MESSAGE_NULL_BYTES',
        message: 'Message contains null bytes which may cause display issues',
        field: 'message',
        recommendation: 'Remove null bytes from message'
      });
    }
  }

  /**
   * Validate one-sided transaction specific rules
   */
  private validateOneSidedTransaction(
    params: SendOneSidedParams,
    errors: TransactionValidationError[],
    warnings: TransactionValidationWarning[]
  ): void {
    // One-sided transactions have different characteristics
    warnings.push({
      code: 'ONE_SIDED_TRANSACTION',
      message: 'One-sided transactions do not require recipient to be online',
      field: 'isOneSided',
      recommendation: 'Ensure recipient can detect and claim the transaction'
    });
  }

  /**
   * Validate standard transaction specific rules
   */
  private validateStandardTransaction(
    params: SendTransactionParams,
    errors: TransactionValidationError[],
    warnings: TransactionValidationWarning[]
  ): void {
    // Standard transactions require both parties to be online
    // No specific validation needed currently
  }

  /**
   * Validate against available balance
   */
  private validateBalance(
    params: SendTransactionParams | SendOneSidedParams,
    errors: TransactionValidationError[],
    warnings: TransactionValidationWarning[]
  ): void {
    if (!this.balanceContext) {
      return;
    }

    const { availableBalance, pendingOutbound, reservedBalance, minimumBalance } = this.balanceContext;
    
    // Calculate usable balance
    const usableBalance = availableBalance - pendingOutbound - reservedBalance;
    
    // Estimate total cost (amount + estimated fee)
    const estimatedFee = (params.feePerGram || 0n) * BigInt(250); // Rough estimate
    const totalCost = params.amount + estimatedFee;

    // Check if sufficient balance
    if (totalCost > usableBalance) {
      errors.push({
        code: 'INSUFFICIENT_BALANCE',
        message: `Insufficient balance: need ${totalCost}, have ${usableBalance}`,
        field: 'amount'
      });
    }

    // Check if transaction would leave minimum balance
    const remainingBalance = usableBalance - totalCost;
    if (remainingBalance < minimumBalance) {
      warnings.push({
        code: 'LOW_REMAINING_BALANCE',
        message: `Transaction would leave balance below minimum ${minimumBalance}`,
        field: 'amount',
        recommendation: 'Consider reducing transaction amount'
      });
    }
  }

  /**
   * Validate business rules
   */
  private validateBusinessRules(
    params: SendTransactionParams | SendOneSidedParams,
    errors: TransactionValidationError[],
    warnings: TransactionValidationWarning[]
  ): void {
    // Check fee ratio
    const estimatedFee = (params.feePerGram || 0n) * BigInt(250);
    const feeRatio = Number(estimatedFee) / Number(params.amount);
    
    if (feeRatio > this.config.maxFeeRatio) {
      warnings.push({
        code: 'HIGH_FEE_RATIO',
        message: `Fee ratio ${(feeRatio * 100).toFixed(2)}% is high`,
        field: 'feePerGram',
        recommendation: 'Consider using a lower fee or larger amount'
      });
    }

    // Check for round numbers (potential mistake)
    const amount = Number(params.amount);
    if (amount > 1000000 && amount % 1000000 === 0) {
      warnings.push({
        code: 'ROUND_AMOUNT',
        message: 'Transaction amount is a round number',
        field: 'amount',
        recommendation: 'Verify the intended amount'
      });
    }
  }

  /**
   * Validate custom rules
   */
  private validateCustomRules(
    params: SendTransactionParams | SendOneSidedParams,
    errors: TransactionValidationError[],
    warnings: TransactionValidationWarning[]
  ): void {
    if (!this.config.customRules) {
      return;
    }

    const isOneSided = 'isOneSided' in params && params.isOneSided;

    for (const rule of this.config.customRules) {
      // Skip rule if it doesn't apply to this transaction type
      if (isOneSided && !rule.appliesToOneSided) {
        continue;
      }

      const result = rule.validate(params);
      if (!result.passed) {
        const validationItem = {
          code: rule.id,
          message: result.message || rule.description,
          field: undefined // Custom rules may not map to specific fields
        };

        if (rule.severity === 'error') {
          errors.push(validationItem);
        } else {
          warnings.push({
            ...validationItem,
            recommendation: 'Review custom validation rule'
          });
        }
      }
    }
  }

  /**
   * Validate economic aspects
   */
  private validateEconomics(
    params: SendTransactionParams | SendOneSidedParams,
    errors: TransactionValidationError[],
    warnings: TransactionValidationWarning[]
  ): void {
    // Check if amount is economically viable
    const estimatedFee = (params.feePerGram || 0n) * BigInt(250);
    
    // Warn if fee is more than 50% of amount
    if (estimatedFee * 2n > params.amount) {
      warnings.push({
        code: 'UNECONOMICAL_TRANSACTION',
        message: 'Transaction fee is more than 50% of amount',
        field: 'amount',
        recommendation: 'Consider sending a larger amount or using a lower fee'
      });
    }

    // Check for micro-transactions
    if (params.amount < BigInt(1000)) { // Less than 0.001 Tari
      warnings.push({
        code: 'MICRO_TRANSACTION',
        message: 'Very small transaction amount',
        field: 'amount',
        recommendation: 'Micro-transactions may not be cost-effective'
      });
    }
  }

  /**
   * Detect address format
   */
  private detectAddressFormat(address: string): 'emoji' | 'base58' | 'hex' {
    if (/^[0-9a-fA-F]+$/.test(address)) {
      return 'hex';
    } else if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(address)) {
      return 'base58';
    } else {
      return 'emoji'; // Assume emoji if not hex or base58
    }
  }
}

/**
 * Default validation configuration
 */
export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  minimumAmount: BigInt(1) as MicroTari,
  maximumAmount: BigInt('1000000000000') as MicroTari, // 1 million Tari
  minimumFeePerGram: BigInt(1) as MicroTari,
  maximumFeePerGram: BigInt(10000) as MicroTari,
  maxMessageLength: 512,
  dustThreshold: BigInt(100) as MicroTari,
  maxFeeRatio: 0.1 // 10%
};

/**
 * Predefined validation rules
 */
export const COMMON_VALIDATION_RULES: ValidationRule[] = [
  {
    id: 'NO_SELF_SEND',
    description: 'Prevent sending to own address',
    severity: 'warning',
    appliesToOneSided: true,
    validate: (params) => {
      // This would need access to wallet's own addresses
      // For now, always pass
      return { passed: true };
    }
  },
  {
    id: 'BUSINESS_HOURS',
    description: 'Warn about transactions outside business hours',
    severity: 'warning',
    appliesToOneSided: false,
    validate: (params) => {
      const hour = new Date().getHours();
      const isBusinessHours = hour >= 9 && hour <= 17;
      
      return {
        passed: isBusinessHours,
        message: 'Transaction initiated outside business hours'
      };
    }
  }
];

/**
 * Validation utilities
 */
export class ValidationUtils {
  /**
   * Check if amount is a dust amount
   */
  static isDustAmount(amount: MicroTari, threshold: MicroTari): boolean {
    return amount < threshold;
  }

  /**
   * Calculate fee ratio
   */
  static calculateFeeRatio(amount: MicroTari, fee: MicroTari): number {
    return Number(fee) / Number(amount);
  }

  /**
   * Format validation errors for display
   */
  static formatErrors(errors: TransactionValidationError[]): string {
    return errors.map(e => `${e.field ? `${e.field}: ` : ''}${e.message}`).join('; ');
  }

  /**
   * Format validation warnings for display
   */
  static formatWarnings(warnings: TransactionValidationWarning[]): string {
    return warnings.map(w => `${w.field ? `${w.field}: ` : ''}${w.message}`).join('; ');
  }
}
