/**
 * @fileoverview Balance mapping utilities for FFI to TypeScript conversion
 * 
 * This module provides mapping functions to convert between FFI balance
 * representations and TypeScript balance types with proper validation.
 */

import {
  WalletError,
  WalletErrorCode,
  ErrorSeverity,
  type FFIBalance
} from '@tari-project/tarijs-core';
import type { Balance, BalanceInfo } from '../types/index.js';

// Re-export FFI balance from core
export type { FFIBalance } from '@tari-project/tarijs-core';

/**
 * Balance validation rules
 */
interface BalanceValidationRules {
  /** Minimum valid balance value */
  minValue: bigint;
  /** Maximum valid balance value */
  maxValue: bigint;
  /** Whether negative values are allowed */
  allowNegative: boolean;
}

/**
 * Default validation rules for balance values
 */
const DEFAULT_VALIDATION_RULES: BalanceValidationRules = {
  minValue: 0n,
  maxValue: BigInt('18446744073709551615'), // u64 max
  allowNegative: false,
};

/**
 * Balance mapper for converting between FFI and TypeScript types
 */
export class BalanceMapper {
  private readonly validationRules: BalanceValidationRules;

  constructor(validationRules: Partial<BalanceValidationRules> = {}) {
    this.validationRules = { ...DEFAULT_VALIDATION_RULES, ...validationRules };
  }

  /**
   * Map FFI balance to TypeScript Balance type
   */
  mapFromFFI(ffiBalance: FFIBalance): Balance {
    try {
      // Parse and validate all balance fields
      const available = this.parseAndValidateAmount(ffiBalance.available, 'available');
      const pendingIncoming = this.parseAndValidateAmount(ffiBalance.pendingIncoming, 'pendingIncoming');
      const pendingOutgoing = this.parseAndValidateAmount(ffiBalance.pendingOutgoing, 'pendingOutgoing');
      const timelocked = this.parseAndValidateAmount(ffiBalance.timelocked, 'timelocked');

      // Calculate total as available + pending incoming (standard convention)
      const total = available + pendingIncoming;

      // Create balance object
      const balance: Balance = {
        available,
        pendingIncoming,
        pendingOutgoing,
        total,
        lastUpdated: new Date()
      };

      return balance;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.TypeConversionFailed,
        'Failed to map FFI balance to TypeScript balance',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error
        }
      );
    }
  }

  /**
   * Map FFI balance to detailed BalanceInfo type
   */
  mapToDetailedBalance(ffiBalance: FFIBalance): BalanceInfo {
    try {
      // Get basic balance first
      const baseBalance = this.mapFromFFI(ffiBalance);

      // Parse time locked amount
      const timeLocked = this.parseAndValidateAmount(ffiBalance.timelocked, 'timelocked');
      
      // For detailed balance, assume confirmed = available and unconfirmed = pending
      const confirmed = baseBalance.available;
      const unconfirmed = baseBalance.pendingIncoming;

      // Create detailed balance info
      const balanceInfo: BalanceInfo = {
        ...baseBalance,
        timeLocked,
        confirmed,
        unconfirmed,
        height: 0, // Height information not available from basic FFI balance
        lastUpdated: new Date()
      };

      return balanceInfo;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.TypeConversionFailed,
        'Failed to map FFI balance to detailed balance info',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error
        }
      );
    }
  }

  /**
   * Convert Balance type to FFI format (for testing/mocking)
   */
  mapToFFI(balance: Balance): FFIBalance {
    return {
      available: balance.available.toString(),
      pendingIncoming: balance.pendingIncoming.toString(),
      pendingOutgoing: balance.pendingOutgoing.toString(),
      timelocked: '0' // Default to 0 for basic balance
    };
  }

  /**
   * Create a balance with all fields set to zero
   */
  createZeroBalance(): Balance {
    return {
      available: 0n,
      pendingIncoming: 0n,
      pendingOutgoing: 0n,
      total: 0n,
      lastUpdated: new Date()
    };
  }

  /**
   * Add two balances together
   */
  addBalances(balance1: Balance, balance2: Balance): Balance {
    return {
      available: balance1.available + balance2.available,
      pendingIncoming: balance1.pendingIncoming + balance2.pendingIncoming,
      pendingOutgoing: balance1.pendingOutgoing + balance2.pendingOutgoing,
      total: balance1.total + balance2.total,
      lastUpdated: new Date()
    };
  }

  /**
   * Subtract one balance from another
   */
  subtractBalances(balance1: Balance, balance2: Balance): Balance {
    return {
      available: balance1.available - balance2.available,
      pendingIncoming: balance1.pendingIncoming - balance2.pendingIncoming,
      pendingOutgoing: balance1.pendingOutgoing - balance2.pendingOutgoing,
      total: balance1.total - balance2.total,
      lastUpdated: new Date()
    };
  }

  /**
   * Compare two balances for equality
   */
  areBalancesEqual(balance1: Balance, balance2: Balance): boolean {
    return (
      balance1.available === balance2.available &&
      balance1.pendingIncoming === balance2.pendingIncoming &&
      balance1.pendingOutgoing === balance2.pendingOutgoing &&
      balance1.total === balance2.total
    );
  }

  /**
   * Format balance amount as human-readable string
   */
  formatAmount(amount: bigint, decimals: number = 6): string {
    if (amount === 0n) {
      return '0';
    }

    const divisor = BigInt(10 ** decimals);
    const wholePart = amount / divisor;
    const fractionalPart = amount % divisor;

    if (fractionalPart === 0n) {
      return wholePart.toString();
    }

    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    const trimmedFractional = fractionalStr.replace(/0+$/, '');
    
    return trimmedFractional.length > 0 
      ? `${wholePart}.${trimmedFractional}`
      : wholePart.toString();
  }

  /**
   * Parse string amount to bigint with validation
   */
  private parseAndValidateAmount(value: string, fieldName: string): bigint {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new WalletError(
        WalletErrorCode.InvalidFormat,
        `Balance field '${fieldName}' must be a non-empty string`,
        { severity: ErrorSeverity.Error }
      );
    }

    let amount: bigint;
    try {
      amount = BigInt(value.trim());
    } catch {
      throw new WalletError(
        WalletErrorCode.InvalidFormat,
        `Balance field '${fieldName}' contains invalid numeric value: ${value}`,
        { severity: ErrorSeverity.Error }
      );
    }

    // Validate against rules
    if (!this.validationRules.allowNegative && amount < 0n) {
      throw new WalletError(
        WalletErrorCode.ValueOutOfRange,
        `Balance field '${fieldName}' cannot be negative: ${amount}`,
        { severity: ErrorSeverity.Error }
      );
    }

    if (amount < this.validationRules.minValue) {
      throw new WalletError(
        WalletErrorCode.ValueOutOfRange,
        `Balance field '${fieldName}' below minimum value: ${amount} < ${this.validationRules.minValue}`,
        { severity: ErrorSeverity.Error }
      );
    }

    if (amount > this.validationRules.maxValue) {
      throw new WalletError(
        WalletErrorCode.ValueOutOfRange,
        `Balance field '${fieldName}' above maximum value: ${amount} > ${this.validationRules.maxValue}`,
        { severity: ErrorSeverity.Error }
      );
    }

    return amount;
  }

  /**
   * Validate balance consistency (total should equal sum of components)
   */
  private validateBalanceConsistency(balance: Balance): void {
    // Calculate expected total
    const expectedTotal = balance.available + balance.pendingIncoming;
    
    // Allow some tolerance for rounding differences
    const tolerance = 1n;
    const difference = balance.total > expectedTotal 
      ? balance.total - expectedTotal 
      : expectedTotal - balance.total;

    if (difference > tolerance) {
      console.warn(
        `Balance inconsistency detected: total (${balance.total}) ` +
        `does not match sum of components (${expectedTotal})`
      );
      // Note: We log a warning but don't throw an error to handle edge cases
      // in the native wallet where calculations might differ slightly
    }
  }

  /**
   * Create a new mapper with different validation rules
   */
  withValidationRules(rules: Partial<BalanceValidationRules>): BalanceMapper {
    return new BalanceMapper({ ...this.validationRules, ...rules });
  }

  /**
   * Validate a balance object structure
   */
  validateBalance(balance: any): balance is Balance {
    if (!balance || typeof balance !== 'object') {
      return false;
    }

    const requiredFields = ['available', 'pendingIncoming', 'pendingOutgoing', 'total', 'lastUpdated'];
    
    for (const field of requiredFields) {
      if (!(field in balance)) {
        return false;
      }
    }

    // Check that numeric fields are bigint
    if (
      typeof balance.available !== 'bigint' ||
      typeof balance.pendingIncoming !== 'bigint' ||
      typeof balance.pendingOutgoing !== 'bigint' ||
      typeof balance.total !== 'bigint'
    ) {
      return false;
    }

    // Check that lastUpdated is a Date
    if (!(balance.lastUpdated instanceof Date)) {
      return false;
    }

    return true;
  }
}
