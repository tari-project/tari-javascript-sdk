/**
 * @fileoverview Validation utilities for the Tari JavaScript SDK
 * 
 * Provides comprehensive validation functions with detailed error messages
 * for all wallet data types and operations.
 */

import {
  isNetworkType,
  isLogLevel,
  isTransactionStatus,
  isMicroTari,
  isTransactionId,
  isTariAddressString,
  isUnixTimestamp,
  isBlockHeight,
  isBalance,
  isTransactionInfo,
  isContact,
  isUtxoInfo,

  isObject,
  isNonEmptyString,
  isPositiveNumber,
  isPositiveInteger,
  isStringArray
} from './guards.js';

import { isWalletConfig } from './wallet-config.js';

// Validation result types
export interface ValidatorResult {
  /** Whether validation passed */
  readonly valid: boolean;
  /** Validation errors */
  readonly errors: ValidationError[];
  /** Validation warnings */
  readonly warnings: ValidationWarning[];
  /** Field path where validation occurred */
  readonly path?: string;
}

export interface ValidationError {
  /** Error code */
  readonly code: string;
  /** Error message */
  readonly message: string;
  /** Field path */
  readonly path: string;
  /** Invalid value */
  readonly value?: unknown;
  /** Expected type or constraint */
  readonly expected?: string;
}

export interface ValidationWarning {
  /** Warning code */
  readonly code: string;
  /** Warning message */
  readonly message: string;
  /** Field path */
  readonly path: string;
  /** Recommendation */
  readonly recommendation: string;
}

// Validation options
export interface ValidationOptions {
  /** Whether to stop on first error */
  stopOnFirstError?: boolean;
  /** Whether to include warnings */
  includeWarnings?: boolean;
  /** Maximum depth for nested validation */
  maxDepth?: number;
  /** Custom error messages */
  customMessages?: Record<string, string>;
  /** Strict mode for additional checks */
  strict?: boolean;
}

// Base validator class
export abstract class BaseValidator<T> {
  protected path: string;
  protected options: ValidationOptions;

  constructor(path = '', options: ValidationOptions = {}) {
    this.path = path;
    this.options = {
      stopOnFirstError: false,
      includeWarnings: true,
      maxDepth: 10,
      strict: false,
      ...options
    };
  }

  /**
   * Validate a value
   */
  abstract validate(value: unknown): ValidatorResult;

  /**
   * Create validation error
   */
  protected createError(
    code: string,
    message: string,
    value?: unknown,
    expected?: string
  ): ValidationError {
    return {
      code,
      message: this.options.customMessages?.[code] || message,
      path: this.path,
      value,
      expected
    };
  }

  /**
   * Create validation warning
   */
  protected createWarning(
    code: string,
    message: string,
    recommendation: string
  ): ValidationWarning {
    return {
      code,
      message,
      path: this.path,
      recommendation
    };
  }

  /**
   * Create successful validation result
   */
  protected createSuccess(warnings: ValidationWarning[] = []): ValidatorResult {
    return {
      valid: true,
      errors: [],
      warnings: this.options.includeWarnings ? warnings : [],
      path: this.path
    };
  }

  /**
   * Create failed validation result
   */
  protected createFailure(
    errors: ValidationError[],
    warnings: ValidationWarning[] = []
  ): ValidatorResult {
    return {
      valid: false,
      errors,
      warnings: this.options.includeWarnings ? warnings : [],
      path: this.path
    };
  }

  /**
   * Get nested path
   */
  protected getNestedPath(field: string): string {
    return this.path ? `${this.path}.${field}` : field;
  }
}

// Primitive validators

export class StringValidator extends BaseValidator<string> {
  constructor(
    private constraints: {
      minLength?: number;
      maxLength?: number;
      pattern?: RegExp;
      allowEmpty?: boolean;
    } = {},
    path = '',
    options: ValidationOptions = {}
  ) {
    super(path, options);
  }

  validate(value: unknown): ValidatorResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (typeof value !== 'string') {
      errors.push(this.createError(
        'INVALID_TYPE',
        'Value must be a string',
        value,
        'string'
      ));
      return this.createFailure(errors, warnings);
    }

    // Check if empty string is allowed
    if (!this.constraints.allowEmpty && value.length === 0) {
      errors.push(this.createError(
        'EMPTY_STRING',
        'String cannot be empty',
        value
      ));
    }

    // Check minimum length
    if (this.constraints.minLength && value.length < this.constraints.minLength) {
      errors.push(this.createError(
        'MIN_LENGTH',
        `String must be at least ${this.constraints.minLength} characters`,
        value,
        `>= ${this.constraints.minLength} characters`
      ));
    }

    // Check maximum length
    if (this.constraints.maxLength && value.length > this.constraints.maxLength) {
      errors.push(this.createError(
        'MAX_LENGTH',
        `String must be at most ${this.constraints.maxLength} characters`,
        value,
        `<= ${this.constraints.maxLength} characters`
      ));
    }

    // Check pattern
    if (this.constraints.pattern && !this.constraints.pattern.test(value)) {
      errors.push(this.createError(
        'PATTERN_MISMATCH',
        'String does not match required pattern',
        value,
        this.constraints.pattern.toString()
      ));
    }

    // Warnings
    if (this.options.strict) {
      if (value.includes('  ')) {
        warnings.push(this.createWarning(
          'MULTIPLE_SPACES',
          'String contains multiple consecutive spaces',
          'Consider normalizing whitespace'
        ));
      }

      if (value !== value.trim()) {
        warnings.push(this.createWarning(
          'LEADING_TRAILING_SPACES',
          'String has leading or trailing spaces',
          'Consider trimming the string'
        ));
      }
    }

    return errors.length > 0 
      ? this.createFailure(errors, warnings)
      : this.createSuccess(warnings);
  }
}

export class NumberValidator extends BaseValidator<number> {
  constructor(
    private constraints: {
      min?: number;
      max?: number;
      integer?: boolean;
      positive?: boolean;
      allowNaN?: boolean;
      allowInfinity?: boolean;
    } = {},
    path = '',
    options: ValidationOptions = {}
  ) {
    super(path, options);
  }

  validate(value: unknown): ValidatorResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (typeof value !== 'number') {
      errors.push(this.createError(
        'INVALID_TYPE',
        'Value must be a number',
        value,
        'number'
      ));
      return this.createFailure(errors, warnings);
    }

    // Check for NaN
    if (Number.isNaN(value) && !this.constraints.allowNaN) {
      errors.push(this.createError(
        'NAN_VALUE',
        'Value cannot be NaN',
        value
      ));
    }

    // Check for infinity
    if (!Number.isFinite(value) && !this.constraints.allowInfinity) {
      errors.push(this.createError(
        'INFINITE_VALUE',
        'Value cannot be infinite',
        value
      ));
    }

    // Check if must be integer
    if (this.constraints.integer && !Number.isInteger(value)) {
      errors.push(this.createError(
        'NOT_INTEGER',
        'Value must be an integer',
        value,
        'integer'
      ));
    }

    // Check if must be positive
    if (this.constraints.positive && value <= 0) {
      errors.push(this.createError(
        'NOT_POSITIVE',
        'Value must be positive',
        value,
        '> 0'
      ));
    }

    // Check minimum value
    if (this.constraints.min !== undefined && value < this.constraints.min) {
      errors.push(this.createError(
        'MIN_VALUE',
        `Value must be at least ${this.constraints.min}`,
        value,
        `>= ${this.constraints.min}`
      ));
    }

    // Check maximum value
    if (this.constraints.max !== undefined && value > this.constraints.max) {
      errors.push(this.createError(
        'MAX_VALUE',
        `Value must be at most ${this.constraints.max}`,
        value,
        `<= ${this.constraints.max}`
      ));
    }

    return errors.length > 0 
      ? this.createFailure(errors, warnings)
      : this.createSuccess(warnings);
  }
}

export class BigIntValidator extends BaseValidator<bigint> {
  constructor(
    private constraints: {
      min?: bigint;
      max?: bigint;
      positive?: boolean;
    } = {},
    path = '',
    options: ValidationOptions = {}
  ) {
    super(path, options);
  }

  validate(value: unknown): ValidatorResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (typeof value !== 'bigint') {
      errors.push(this.createError(
        'INVALID_TYPE',
        'Value must be a bigint',
        value,
        'bigint'
      ));
      return this.createFailure(errors, warnings);
    }

    // Check if must be positive
    if (this.constraints.positive && value <= 0n) {
      errors.push(this.createError(
        'NOT_POSITIVE',
        'Value must be positive',
        value,
        '> 0'
      ));
    }

    // Check minimum value
    if (this.constraints.min !== undefined && value < this.constraints.min) {
      errors.push(this.createError(
        'MIN_VALUE',
        `Value must be at least ${this.constraints.min}`,
        value,
        `>= ${this.constraints.min}`
      ));
    }

    // Check maximum value
    if (this.constraints.max !== undefined && value > this.constraints.max) {
      errors.push(this.createError(
        'MAX_VALUE',
        `Value must be at most ${this.constraints.max}`,
        value,
        `<= ${this.constraints.max}`
      ));
    }

    return errors.length > 0 
      ? this.createFailure(errors, warnings)
      : this.createSuccess(warnings);
  }
}

export class ArrayValidator<T> extends BaseValidator<T[]> {
  constructor(
    private itemValidator: BaseValidator<T>,
    private constraints: {
      minLength?: number;
      maxLength?: number;
      unique?: boolean;
    } = {},
    path = '',
    options: ValidationOptions = {}
  ) {
    super(path, options);
  }

  validate(value: unknown): ValidatorResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!Array.isArray(value)) {
      errors.push(this.createError(
        'INVALID_TYPE',
        'Value must be an array',
        value,
        'array'
      ));
      return this.createFailure(errors, warnings);
    }

    // Check minimum length
    if (this.constraints.minLength && value.length < this.constraints.minLength) {
      errors.push(this.createError(
        'MIN_LENGTH',
        `Array must have at least ${this.constraints.minLength} items`,
        value,
        `>= ${this.constraints.minLength} items`
      ));
    }

    // Check maximum length
    if (this.constraints.maxLength && value.length > this.constraints.maxLength) {
      errors.push(this.createError(
        'MAX_LENGTH',
        `Array must have at most ${this.constraints.maxLength} items`,
        value,
        `<= ${this.constraints.maxLength} items`
      ));
    }

    // Check uniqueness
    if (this.constraints.unique) {
      const seen = new Set();
      const duplicates = new Set();
      
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) {
          duplicates.add(item);
        } else {
          seen.add(key);
        }
      }

      if (duplicates.size > 0) {
        errors.push(this.createError(
          'DUPLICATE_ITEMS',
          'Array contains duplicate items',
          Array.from(duplicates)
        ));
      }
    }

    // Validate each item
    if (this.options.stopOnFirstError && errors.length > 0) {
      return this.createFailure(errors, warnings);
    }

    for (let i = 0; i < value.length; i++) {
      const itemValidator = new (this.itemValidator.constructor as any)(
        this.getNestedPath(`[${i}]`),
        this.options
      );
      
      const result = itemValidator.validate(value[i]);
      
      if (!result.valid) {
        errors.push(...result.errors);
        if (this.options.stopOnFirstError) {
          break;
        }
      }
      
      warnings.push(...result.warnings);
    }

    return errors.length > 0 
      ? this.createFailure(errors, warnings)
      : this.createSuccess(warnings);
  }
}

export class ObjectValidator<T extends Record<string, unknown>> extends BaseValidator<T> {
  constructor(
    private schema: {
      [K in keyof T]: {
        validator: BaseValidator<T[K]>;
        required?: boolean;
        default?: T[K];
      };
    },
    private allowAdditionalProperties = false,
    path = '',
    options: ValidationOptions = {}
  ) {
    super(path, options);
  }

  validate(value: unknown): ValidatorResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!isObject(value)) {
      errors.push(this.createError(
        'INVALID_TYPE',
        'Value must be an object',
        value,
        'object'
      ));
      return this.createFailure(errors, warnings);
    }

    // Check required fields
    for (const [key, config] of Object.entries(this.schema)) {
      const fieldPath = this.getNestedPath(key);
      const fieldValue = value[key];

      if (config.required && fieldValue === undefined) {
        errors.push(this.createError(
          'REQUIRED_FIELD_MISSING',
          `Required field '${key}' is missing`,
          undefined,
          'required'
        ));
        continue;
      }

      if (fieldValue !== undefined) {
        const fieldValidator = new (config.validator.constructor as any)(
          fieldPath,
          this.options
        );
        
        const result = fieldValidator.validate(fieldValue);
        
        if (!result.valid) {
          errors.push(...result.errors);
          if (this.options.stopOnFirstError) {
            break;
          }
        }
        
        warnings.push(...result.warnings);
      }
    }

    // Check for additional properties
    if (!this.allowAdditionalProperties) {
      const allowedKeys = new Set(Object.keys(this.schema));
      const actualKeys = Object.keys(value);
      
      for (const key of actualKeys) {
        if (!allowedKeys.has(key)) {
          warnings.push(this.createWarning(
            'UNKNOWN_PROPERTY',
            `Unknown property '${key}' found`,
            'Remove unknown property or update schema'
          ));
        }
      }
    }

    return errors.length > 0 
      ? this.createFailure(errors, warnings)
      : this.createSuccess(warnings);
  }
}

// Specific wallet type validators

export class MicroTariValidator extends BigIntValidator {
  constructor(path = '', options: ValidationOptions = {}) {
    super(
      {
        min: 0n,
        max: 21_000_000_000_000_000n, // Max Tari supply in MicroTari
        positive: false // Allow zero
      },
      path,
      options
    );
  }

  validate(value: unknown): ValidatorResult {
    const result = super.validate(value);
    
    if (result.valid && typeof value === 'bigint') {
      const warnings = [...result.warnings];
      
      // Check for dust amounts
      if (value > 0n && value < 100n) {
        warnings.push(this.createWarning(
          'DUST_AMOUNT',
          'Amount is below dust threshold (100 MicroTari)',
          'Consider using larger amounts for better network efficiency'
        ));
      }
      
      return this.createSuccess(warnings);
    }
    
    return result;
  }
}

export class TariAddressValidator extends StringValidator {
  constructor(path = '', options: ValidationOptions = {}) {
    super({
      allowEmpty: false
    }, path, options);
  }

  validate(value: unknown): ValidatorResult {
    const stringResult = super.validate(value);
    if (!stringResult.valid) {
      return stringResult;
    }

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [...stringResult.warnings];

    if (!isTariAddressString(value)) {
      errors.push(this.createError(
        'INVALID_ADDRESS_FORMAT',
        'Invalid Tari address format',
        value,
        'valid Tari address (emoji, base58, or hex)'
      ));
    }

    return errors.length > 0 
      ? this.createFailure(errors, warnings)
      : this.createSuccess(warnings);
  }
}

export class TransactionIdValidator extends BigIntValidator {
  constructor(path = '', options: ValidationOptions = {}) {
    super(
      {
        min: 1n,
        positive: true
      },
      path,
      options
    );
  }
}

export class BlockHeightValidator extends BigIntValidator {
  constructor(path = '', options: ValidationOptions = {}) {
    super(
      {
        min: 0n,
        positive: false // Allow genesis block (height 0)
      },
      path,
      options
    );
  }
}

export class TimestampValidator extends NumberValidator {
  constructor(path = '', options: ValidationOptions = {}) {
    const now = Date.now();
    super(
      {
        min: 0,
        max: now + 86400000, // Allow up to 1 day in future
        integer: true,
        positive: false // Allow epoch (0)
      },
      path,
      options
    );
  }

  validate(value: unknown): ValidatorResult {
    const result = super.validate(value);
    
    if (result.valid && typeof value === 'number') {
      const warnings = [...result.warnings];
      const now = Date.now();
      
      // Check if timestamp is too far in the past
      if (value < now - (365 * 24 * 60 * 60 * 1000)) { // 1 year ago
        warnings.push(this.createWarning(
          'OLD_TIMESTAMP',
          'Timestamp is more than 1 year old',
          'Verify the timestamp is correct'
        ));
      }
      
      // Check if timestamp is in the future
      if (value > now) {
        warnings.push(this.createWarning(
          'FUTURE_TIMESTAMP',
          'Timestamp is in the future',
          'Verify system clock is correct'
        ));
      }
      
      return this.createSuccess(warnings);
    }
    
    return result;
  }
}

// Composite validators for complex types

export class BalanceValidator extends BaseValidator<any> {
  validate(value: unknown): ValidatorResult {
    if (!isBalance(value)) {
      return this.createFailure([
        this.createError(
          'INVALID_BALANCE',
          'Value is not a valid Balance object',
          value,
          'Balance object with available, pendingIncoming, pendingOutgoing, timelocked'
        )
      ]);
    }

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate individual fields
    const fields = [
      { name: 'available', value: value.available },
      { name: 'pendingIncoming', value: value.pendingIncoming },
      { name: 'pendingOutgoing', value: value.pendingOutgoing },
      { name: 'timelocked', value: value.timelocked }
    ];

    for (const field of fields) {
      const validator = new MicroTariValidator(
        this.getNestedPath(field.name),
        this.options
      );
      
      const result = validator.validate(field.value);
      
      if (!result.valid) {
        errors.push(...result.errors);
      }
      
      warnings.push(...result.warnings);
    }

    // Additional balance-specific validation
    const total = value.available + value.pendingIncoming + value.timelocked;
    if (total < 0n) {
      errors.push(this.createError(
        'NEGATIVE_TOTAL_BALANCE',
        'Total balance cannot be negative',
        total
      ));
    }

    const spendable = value.available - value.pendingOutgoing;
    if (spendable < 0n) {
      warnings.push(this.createWarning(
        'NEGATIVE_SPENDABLE',
        'Spendable balance is negative due to high pending outgoing',
        'Monitor pending transactions'
      ));
    }

    return errors.length > 0 
      ? this.createFailure(errors, warnings)
      : this.createSuccess(warnings);
  }
}

// Validation utilities

export class ValidationUtils {
  /**
   * Validate multiple values with their validators
   */
  static validateMultiple(
    validations: Array<{
      value: unknown;
      validator: BaseValidator<any>;
      name: string;
    }>,
    options: ValidationOptions = {}
  ): ValidatorResult {
    const allErrors: ValidationError[] = [];
    const allWarnings: ValidationWarning[] = [];

    for (const { value, validator, name } of validations) {
      const result = validator.validate(value);
      
      // Prefix errors and warnings with field name
      const prefixedErrors = result.errors.map(error => ({
        ...error,
        path: name + (error.path ? `.${error.path}` : '')
      }));
      
      const prefixedWarnings = result.warnings.map(warning => ({
        ...warning,
        path: name + (warning.path ? `.${warning.path}` : '')
      }));

      allErrors.push(...prefixedErrors);
      allWarnings.push(...prefixedWarnings);

      if (options.stopOnFirstError && prefixedErrors.length > 0) {
        break;
      }
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: options.includeWarnings !== false ? allWarnings : [],
      path: ''
    };
  }

  /**
   * Create conditional validator
   */
  static conditional<T>(
    condition: (value: unknown) => boolean,
    validator: BaseValidator<T>,
    defaultValidator?: BaseValidator<any>
  ): BaseValidator<T | any> {
    return new (class extends BaseValidator<T | any> {
      validate(value: unknown): ValidatorResult {
        if (condition(value)) {
          return validator.validate(value);
        } else if (defaultValidator) {
          return defaultValidator.validate(value);
        } else {
          return this.createSuccess();
        }
      }
    })();
  }

  /**
   * Create union validator (value must match at least one validator)
   */
  static union<T extends any[]>(
    ...validators: { [K in keyof T]: BaseValidator<T[K]> }
  ): BaseValidator<T[number]> {
    return new (class extends BaseValidator<T[number]> {
      validate(value: unknown): ValidatorResult {
        const results = validators.map(v => v.validate(value));
        
        // If any validator passes, the union passes
        const successResult = results.find(r => r.valid);
        if (successResult) {
          return successResult;
        }
        
        // If all fail, combine errors
        const allErrors = results.flatMap(r => r.errors);
        const allWarnings = results.flatMap(r => r.warnings);
        
        return this.createFailure(allErrors, allWarnings);
      }
    })();
  }

  /**
   * Create optional validator
   */
  static optional<T>(validator: BaseValidator<T>): BaseValidator<T | undefined> {
    return new (class extends BaseValidator<T | undefined> {
      validate(value: unknown): ValidatorResult {
        if (value === undefined) {
          return this.createSuccess();
        }
        return validator.validate(value);
      }
    })();
  }

  /**
   * Create nullable validator
   */
  static nullable<T>(validator: BaseValidator<T>): BaseValidator<T | null> {
    return new (class extends BaseValidator<T | null> {
      validate(value: unknown): ValidatorResult {
        if (value === null) {
          return this.createSuccess();
        }
        return validator.validate(value);
      }
    })();
  }
}

// All validators are already exported with their class declarations
