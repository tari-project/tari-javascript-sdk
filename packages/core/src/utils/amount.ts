/**
 * @fileoverview Amount utility functions for the Tari JavaScript SDK
 * 
 * Re-exports amount utilities from types for convenient access
 * and provides additional helper functions for amount operations.
 */

// Re-export main amount utilities
export {
  AmountUtils,
  AmountSerializer,
  Amount,
  TARI_PRECISION,
  MAX_TARI_SUPPLY,
  MIN_AMOUNT,
  DUST_THRESHOLD
} from '../types/amount.js';

export type {
  AmountValidationResult,
  AmountValidationError,
  AmountValidationWarning,
  AmountParseResult,
  FormattedAmount
} from '../types/amount.js';

// Additional utility functions

/**
 * Quick conversion from Tari to MicroTari
 */
export function toMicroTari(tari: number): bigint {
  return BigInt(Math.round(tari * 1_000_000));
}

/**
 * Quick conversion from MicroTari to Tari
 */
export function toTari(microTari: bigint): number {
  return Number(microTari) / 1_000_000;
}

/**
 * Format amount with default Tari formatting
 */
export function formatTari(microTari: bigint, decimals = 6): string {
  const tari = toTari(microTari);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
    useGrouping: true
  }).format(tari) + ' T';
}

/**
 * Format amount as MicroTari with default formatting
 */
export function formatMicroTari(microTari: bigint): string {
  return new Intl.NumberFormat('en-US', {
    useGrouping: true
  }).format(Number(microTari)) + ' µT';
}

/**
 * Parse amount string with automatic unit detection
 */
export function parseAmountString(amount: string): bigint {
  const trimmed = amount.trim().toLowerCase();
  
  // Check for MicroTari suffixes
  if (trimmed.endsWith('µt') || trimmed.endsWith('ut') || trimmed.endsWith('microtari')) {
    const numStr = trimmed.replace(/[µu]?t|microtari/gi, '').trim();
    return BigInt(parseFloat(numStr.replace(/,/g, '')));
  }
  
  // Check for Tari suffixes
  if (trimmed.endsWith('t') || trimmed.endsWith('tari')) {
    const numStr = trimmed.replace(/tari?$/gi, '').trim();
    return toMicroTari(parseFloat(numStr.replace(/,/g, '')));
  }
  
  // Default to Tari
  return toMicroTari(parseFloat(amount.replace(/,/g, '')));
}

/**
 * Validate that an amount is within reasonable bounds
 */
export function isValidAmount(microTari: bigint): boolean {
  return microTari >= 0n && microTari <= 21_000_000_000_000_000n;
}

/**
 * Check if amount is considered dust
 */
export function isDustAmount(microTari: bigint): boolean {
  return microTari > 0n && microTari < 100n;
}

/**
 * Round amount to avoid floating point precision issues
 */
export function roundToMicroTari(tari: number): bigint {
  return BigInt(Math.round(tari * 1_000_000));
}

/**
 * Add two amounts safely
 */
export function addAmounts(a: bigint, b: bigint): bigint {
  return a + b;
}

/**
 * Subtract amounts safely (throws if result would be negative)
 */
export function subtractAmounts(a: bigint, b: bigint): bigint {
  if (a < b) {
    throw new Error('Insufficient funds: cannot subtract larger amount from smaller amount');
  }
  return a - b;
}

/**
 * Calculate percentage of amount
 */
export function calculatePercentage(amount: bigint, percentage: number): bigint {
  if (percentage < 0 || percentage > 100) {
    throw new Error('Percentage must be between 0 and 100');
  }
  return (amount * BigInt(Math.round(percentage * 100))) / 10000n;
}

/**
 * Find the maximum spendable amount considering fees
 */
export function maxSpendableAmount(available: bigint, feePerGram: bigint, estimatedSize = 1000): bigint {
  const estimatedFee = feePerGram * BigInt(estimatedSize);
  return available > estimatedFee ? available - estimatedFee : 0n;
}

/**
 * Estimate transaction fee based on size
 */
export function estimateFee(feePerGram: bigint, sizeInGrams: number): bigint {
  return feePerGram * BigInt(Math.ceil(sizeInGrams));
}

/**
 * Split amount into multiple parts
 */
export function splitAmount(total: bigint, parts: number): bigint[] {
  if (parts <= 0) {
    throw new Error('Number of parts must be positive');
  }
  
  const baseAmount = total / BigInt(parts);
  const remainder = total % BigInt(parts);
  
  const result: bigint[] = [];
  for (let i = 0; i < parts; i++) {
    const amount = i < Number(remainder) ? baseAmount + 1n : baseAmount;
    result.push(amount);
  }
  
  return result;
}

/**
 * Calculate compound interest (for time-locked amounts)
 */
export function calculateCompoundInterest(
  principal: bigint,
  rate: number,
  periods: number
): bigint {
  if (rate <= 0 || periods <= 0) {
    return principal;
  }
  
  const multiplier = Math.pow(1 + rate, periods);
  return BigInt(Math.floor(Number(principal) * multiplier));
}

/**
 * Convert between different precision levels
 */
export function convertPrecision(
  amount: bigint,
  fromPrecision: number,
  toPrecision: number
): bigint {
  if (fromPrecision === toPrecision) {
    return amount;
  }
  
  if (fromPrecision > toPrecision) {
    const divisor = BigInt(Math.pow(10, fromPrecision - toPrecision));
    return amount / divisor;
  } else {
    const multiplier = BigInt(Math.pow(10, toPrecision - fromPrecision));
    return amount * multiplier;
  }
}

/**
 * Create amount with validation
 */
export function createAmount(value: bigint | number | string): bigint {
  if (typeof value === 'bigint') {
    if (!isValidAmount(value)) {
      throw new Error('Invalid amount: outside valid range');
    }
    return value;
  }
  
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('Invalid amount: must be a finite positive number');
    }
    return toMicroTari(value);
  }
  
  if (typeof value === 'string') {
    return parseAmountString(value);
  }
  
  throw new Error('Invalid amount type: must be bigint, number, or string');
}

/**
 * Safely compare two amounts
 */
export function compareAmounts(a: bigint, b: bigint): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Get the minimum of multiple amounts
 */
export function minAmount(...amounts: bigint[]): bigint {
  if (amounts.length === 0) {
    throw new Error('Cannot find minimum of empty array');
  }
  return amounts.reduce((min, current) => current < min ? current : min);
}

/**
 * Get the maximum of multiple amounts
 */
export function maxAmount(...amounts: bigint[]): bigint {
  if (amounts.length === 0) {
    throw new Error('Cannot find maximum of empty array');
  }
  return amounts.reduce((max, current) => current > max ? current : max);
}

/**
 * Sum multiple amounts
 */
export function sumAmounts(amounts: bigint[]): bigint {
  return amounts.reduce((sum, amount) => sum + amount, 0n);
}

/**
 * Calculate average amount
 */
export function averageAmount(amounts: bigint[]): bigint {
  if (amounts.length === 0) {
    throw new Error('Cannot calculate average of empty array');
  }
  const total = sumAmounts(amounts);
  return total / BigInt(amounts.length);
}
