/**
 * @fileoverview Amount types and utilities for the Tari JavaScript SDK
 * 
 * Provides amount conversion, validation, and formatting utilities
 * with proper bigint handling and JSON serialization support.
 */

import type { MicroTari, Tari } from './branded.js';
import type { BalanceFormatOptions } from './balance.js';

// Import constants to avoid conflicts
import { TARI_PRECISION, MAX_TARI_SUPPLY, DUST_THRESHOLD } from './constants.js';

// Amount-specific constants
export const MIN_AMOUNT = 1n; // Minimum 1 MicroTari

// Amount validation result
export interface AmountValidationResult {
  /** Whether the amount is valid */
  readonly valid: boolean;
  /** Validation errors */
  readonly errors: AmountValidationError[];
  /** Validation warnings */
  readonly warnings: AmountValidationWarning[];
}

export interface AmountValidationError {
  readonly code: string;
  readonly message: string;
  readonly value: string;
}

export interface AmountValidationWarning {
  readonly code: string;
  readonly message: string;
  readonly value: string;
  readonly recommendation: string;
}

// Amount parsing result
export interface AmountParseResult {
  /** Whether parsing was successful */
  readonly success: boolean;
  /** Parsed amount in MicroTari */
  readonly amount?: MicroTari;
  /** Parse error if any */
  readonly error?: string;
}

// Amount formatting result
export interface FormattedAmount {
  /** Formatted amount string */
  readonly formatted: string;
  /** Raw numeric value */
  readonly value: number;
  /** Original amount in MicroTari */
  readonly microTari: MicroTari;
  /** Amount in Tari */
  readonly tari: number;
}

// Core amount utilities
export class AmountUtils {
  /**
   * Convert MicroTari to Tari
   */
  static microTariToTari(microTari: MicroTari): number {
    return Number(microTari) / Number(TARI_PRECISION);
  }

  /**
   * Convert Tari to MicroTari
   */
  static tariToMicroTari(tari: number): MicroTari {
    if (!Number.isFinite(tari) || tari < 0) {
      throw new Error('Invalid Tari amount');
    }
    return BigInt(Math.round(tari * Number(TARI_PRECISION))) as MicroTari;
  }

  /**
   * Convert string amount to MicroTari
   */
  static parseAmount(amount: string, unit: 'tari' | 'microtari' = 'tari'): AmountParseResult {
    try {
      const trimmed = amount.trim();
      
      if (trimmed === '') {
        return {
          success: false,
          error: 'Amount cannot be empty'
        };
      }

      // Remove commas and other formatting
      const cleaned = trimmed.replace(/[,\s]/g, '');
      
      // Check for valid number format
      if (!/^-?\d*\.?\d+$/.test(cleaned)) {
        return {
          success: false,
          error: 'Invalid number format'
        };
      }

      const numValue = parseFloat(cleaned);
      
      if (!Number.isFinite(numValue)) {
        return {
          success: false,
          error: 'Invalid numeric value'
        };
      }

      if (numValue < 0) {
        return {
          success: false,
          error: 'Amount cannot be negative'
        };
      }

      let microTari: MicroTari;
      
      if (unit === 'tari') {
        microTari = this.tariToMicroTari(numValue);
      } else {
        microTari = BigInt(Math.round(numValue)) as MicroTari;
      }

      return {
        success: true,
        amount: microTari
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown parsing error'
      };
    }
  }

  /**
   * Format amount for display
   */
  static formatAmount(
    microTari: MicroTari, 
    options: BalanceFormatOptions = {}
  ): FormattedAmount {
    const {
      decimals = 6,
      showSymbol = true,
      symbol = 'T',
      locale = 'en-US',
      useGrouping = true,
      minimumFractionDigits = 0,
      maximumFractionDigits = decimals
    } = options;

    const tariValue = this.microTariToTari(microTari);
    
    const formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits,
      maximumFractionDigits,
      useGrouping
    });

    const formattedNumber = formatter.format(tariValue);
    const formatted = showSymbol ? `${formattedNumber} ${symbol}` : formattedNumber;

    return {
      formatted,
      value: tariValue,
      microTari,
      tari: tariValue
    };
  }

  /**
   * Format amount as MicroTari
   */
  static formatMicroTari(microTari: MicroTari, options: Omit<BalanceFormatOptions, 'decimals'> = {}): string {
    const {
      showSymbol = true,
      symbol = 'µT',
      locale = 'en-US',
      useGrouping = true
    } = options;

    const formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping
    });

    const formattedNumber = formatter.format(Number(microTari));
    return showSymbol ? `${formattedNumber} ${symbol}` : formattedNumber;
  }

  /**
   * Validate amount
   */
  static validate(microTari: MicroTari): AmountValidationResult {
    const errors: AmountValidationError[] = [];
    const warnings: AmountValidationWarning[] = [];
    const value = microTari.toString();

    // Check for negative amounts
    if (microTari < 0n) {
      errors.push({
        code: 'NEGATIVE_AMOUNT',
        message: 'Amount cannot be negative',
        value
      });
    }

    // Check for zero amounts
    if (microTari === 0n) {
      warnings.push({
        code: 'ZERO_AMOUNT',
        message: 'Amount is zero',
        value,
        recommendation: 'Consider using a positive amount'
      });
    }

    // Check for dust amounts
    if (microTari > 0n && microTari < DUST_THRESHOLD) {
      warnings.push({
        code: 'DUST_AMOUNT',
        message: 'Amount is below dust threshold',
        value,
        recommendation: `Consider using at least ${DUST_THRESHOLD} MicroTari`
      });
    }

    // Check for amounts exceeding maximum supply
    if (microTari > MAX_TARI_SUPPLY) {
      errors.push({
        code: 'EXCEEDS_MAX_SUPPLY',
        message: 'Amount exceeds maximum Tari supply',
        value
      });
    }

    // Check for precision loss in JavaScript numbers
    const tariValue = this.microTariToTari(microTari);
    const reconstructed = this.tariToMicroTari(tariValue);
    
    if (reconstructed !== microTari) {
      warnings.push({
        code: 'PRECISION_LOSS',
        message: 'Amount may lose precision when converted to JavaScript number',
        value,
        recommendation: 'Use bigint operations for precise calculations'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Add two amounts
   */
  static add(a: MicroTari, b: MicroTari): MicroTari {
    return (a + b) as MicroTari;
  }

  /**
   * Subtract two amounts
   */
  static subtract(a: MicroTari, b: MicroTari): MicroTari {
    return (a - b) as MicroTari;
  }

  /**
   * Multiply amount by a factor
   */
  static multiply(amount: MicroTari, factor: number): MicroTari {
    if (!Number.isFinite(factor) || factor < 0) {
      throw new Error('Invalid multiplication factor');
    }
    return (amount * BigInt(Math.round(factor * 1000)) / 1000n) as MicroTari;
  }

  /**
   * Divide amount by a divisor
   */
  static divide(amount: MicroTari, divisor: number): MicroTari {
    if (!Number.isFinite(divisor) || divisor <= 0) {
      throw new Error('Invalid division factor');
    }
    return (amount * 1000n / BigInt(Math.round(divisor * 1000))) as MicroTari;
  }

  /**
   * Calculate percentage of amount
   */
  static percentage(amount: MicroTari, percent: number): MicroTari {
    return this.multiply(amount, percent / 100);
  }

  /**
   * Find minimum of multiple amounts
   */
  static min(...amounts: MicroTari[]): MicroTari {
    if (amounts.length === 0) {
      throw new Error('Cannot find minimum of empty array');
    }
    return amounts.reduce((min, current) => current < min ? current : min);
  }

  /**
   * Find maximum of multiple amounts
   */
  static max(...amounts: MicroTari[]): MicroTari {
    if (amounts.length === 0) {
      throw new Error('Cannot find maximum of empty array');
    }
    return amounts.reduce((max, current) => current > max ? current : max);
  }

  /**
   * Sum multiple amounts
   */
  static sum(amounts: MicroTari[]): MicroTari {
    return amounts.reduce((sum, current) => this.add(sum, current), 0n as MicroTari);
  }

  /**
   * Calculate average of multiple amounts
   */
  static average(amounts: MicroTari[]): MicroTari {
    if (amounts.length === 0) {
      throw new Error('Cannot calculate average of empty array');
    }
    const total = this.sum(amounts);
    return (total / BigInt(amounts.length)) as MicroTari;
  }

  /**
   * Compare two amounts
   */
  static compare(a: MicroTari, b: MicroTari): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  /**
   * Check if amount is zero
   */
  static isZero(amount: MicroTari): boolean {
    return amount === 0n;
  }

  /**
   * Check if amount is positive
   */
  static isPositive(amount: MicroTari): boolean {
    return amount > 0n;
  }

  /**
   * Check if amount is dust
   */
  static isDust(amount: MicroTari): boolean {
    return amount > 0n && amount < DUST_THRESHOLD;
  }

  /**
   * Create zero amount
   */
  static zero(): MicroTari {
    return 0n as MicroTari;
  }

  /**
   * Create amount from Tari value
   */
  static fromTari(tari: number): MicroTari {
    return this.tariToMicroTari(tari);
  }

  /**
   * Create amount from string
   */
  static fromString(amount: string, unit: 'tari' | 'microtari' = 'tari'): MicroTari {
    const result = this.parseAmount(amount, unit);
    if (!result.success) {
      throw new Error(result.error);
    }
    return result.amount!;
  }
}

// JSON serialization utilities for amounts
export class AmountSerializer {
  /**
   * Serialize amount for JSON
   */
  static serialize(amount: MicroTari): string {
    return amount.toString();
  }

  /**
   * Deserialize amount from JSON
   */
  static deserialize(serialized: string): MicroTari {
    try {
      return BigInt(serialized) as MicroTari;
    } catch (error) {
      throw new Error(`Invalid serialized amount: ${serialized}`);
    }
  }

  /**
   * Custom JSON replacer for amounts
   */
  static replacer(key: string, value: unknown): unknown {
    if (typeof value === 'bigint') {
      return `BIGINT::${value.toString()}`;
    }
    return value;
  }

  /**
   * Custom JSON reviver for amounts
   */
  static reviver(key: string, value: unknown): unknown {
    if (typeof value === 'string' && value.startsWith('BIGINT::')) {
      return BigInt(value.slice(8));
    }
    return value;
  }

  /**
   * Stringify object with bigint support
   */
  static stringify(obj: unknown): string {
    return JSON.stringify(obj, this.replacer);
  }

  /**
   * Parse JSON with bigint support
   */
  static parse(json: string): unknown {
    return JSON.parse(json, this.reviver);
  }
}

// Amount class for object-oriented usage
export class Amount {
  constructor(private readonly _microTari: MicroTari) {
    const validation = AmountUtils.validate(_microTari);
    if (!validation.valid) {
      throw new Error(`Invalid amount: ${validation.errors[0]?.message}`);
    }
  }

  /**
   * Get amount in MicroTari
   */
  get microTari(): MicroTari {
    return this._microTari;
  }

  /**
   * Get amount in Tari
   */
  get tari(): number {
    return AmountUtils.microTariToTari(this._microTari);
  }

  /**
   * Add another amount
   */
  add(other: Amount | MicroTari): Amount {
    const otherMicroTari = other instanceof Amount ? other.microTari : other;
    return new Amount(AmountUtils.add(this._microTari, otherMicroTari));
  }

  /**
   * Subtract another amount
   */
  subtract(other: Amount | MicroTari): Amount {
    const otherMicroTari = other instanceof Amount ? other.microTari : other;
    return new Amount(AmountUtils.subtract(this._microTari, otherMicroTari));
  }

  /**
   * Multiply by a factor
   */
  multiply(factor: number): Amount {
    return new Amount(AmountUtils.multiply(this._microTari, factor));
  }

  /**
   * Divide by a factor
   */
  divide(divisor: number): Amount {
    return new Amount(AmountUtils.divide(this._microTari, divisor));
  }

  /**
   * Calculate percentage
   */
  percentage(percent: number): Amount {
    return new Amount(AmountUtils.percentage(this._microTari, percent));
  }

  /**
   * Compare with another amount
   */
  compare(other: Amount | MicroTari): number {
    const otherMicroTari = other instanceof Amount ? other.microTari : other;
    return AmountUtils.compare(this._microTari, otherMicroTari);
  }

  /**
   * Check if equal to another amount
   */
  equals(other: Amount | MicroTari): boolean {
    return this.compare(other) === 0;
  }

  /**
   * Check if greater than another amount
   */
  greaterThan(other: Amount | MicroTari): boolean {
    return this.compare(other) > 0;
  }

  /**
   * Check if less than another amount
   */
  lessThan(other: Amount | MicroTari): boolean {
    return this.compare(other) < 0;
  }

  /**
   * Check if amount is zero
   */
  isZero(): boolean {
    return AmountUtils.isZero(this._microTari);
  }

  /**
   * Check if amount is positive
   */
  isPositive(): boolean {
    return AmountUtils.isPositive(this._microTari);
  }

  /**
   * Check if amount is dust
   */
  isDust(): boolean {
    return AmountUtils.isDust(this._microTari);
  }

  /**
   * Format amount for display
   */
  format(options?: BalanceFormatOptions): FormattedAmount {
    return AmountUtils.formatAmount(this._microTari, options);
  }

  /**
   * Validate amount
   */
  validate(): AmountValidationResult {
    return AmountUtils.validate(this._microTari);
  }

  /**
   * Convert to string
   */
  toString(): string {
    return this._microTari.toString();
  }

  /**
   * Convert to JSON
   */
  toJSON(): string {
    return AmountSerializer.serialize(this._microTari);
  }

  /**
   * Create from Tari value
   */
  static fromTari(tari: number): Amount {
    return new Amount(AmountUtils.fromTari(tari));
  }

  /**
   * Create from string
   */
  static fromString(amount: string, unit?: 'tari' | 'microtari'): Amount {
    return new Amount(AmountUtils.fromString(amount, unit));
  }

  /**
   * Create from MicroTari
   */
  static fromMicroTari(microTari: MicroTari): Amount {
    return new Amount(microTari);
  }

  /**
   * Create zero amount
   */
  static zero(): Amount {
    return new Amount(AmountUtils.zero());
  }

  /**
   * Create from JSON
   */
  static fromJSON(json: string): Amount {
    return new Amount(AmountSerializer.deserialize(json));
  }
}

// All utilities are already exported with their class declarations
