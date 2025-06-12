/**
 * @fileoverview Balance event mappers
 * 
 * This module provides mappers for converting FFI balance events
 * to TypeScript balance event types.
 */

import { BaseEventMapper, ValidationUtils } from './base-mapper.js';
import type { Balance } from '../../types/index.js';

/**
 * FFI balance event data structure
 */
interface FFIBalanceData {
  available?: unknown;
  pendingIncoming?: unknown;
  pending_incoming?: unknown; // Alternative naming
  pendingOutgoing?: unknown;
  pending_outgoing?: unknown; // Alternative naming
  total?: unknown;
  lastUpdated?: unknown;
  last_updated?: unknown; // Alternative naming
  timeLocked?: unknown;
  time_locked?: unknown; // Alternative naming
  confirmed?: unknown;
  unconfirmed?: unknown;
  height?: unknown;
}

/**
 * Mapper for balance update events
 */
export class BalanceMapper extends BaseEventMapper<Balance> {
  constructor() {
    super('balance:updated');
  }

  validate(data: unknown): boolean {
    if (!ValidationUtils.hasRequiredProperties(data, ['available'])) {
      return false;
    }

    const ffi = data as FFIBalanceData;
    return (
      ValidationUtils.isBigIntString(ffi.available) &&
      (!ffi.pendingIncoming || ValidationUtils.isBigIntString(ffi.pendingIncoming)) &&
      (!ffi.pending_incoming || ValidationUtils.isBigIntString(ffi.pending_incoming)) &&
      (!ffi.pendingOutgoing || ValidationUtils.isBigIntString(ffi.pendingOutgoing)) &&
      (!ffi.pending_outgoing || ValidationUtils.isBigIntString(ffi.pending_outgoing)) &&
      (!ffi.total || ValidationUtils.isBigIntString(ffi.total)) &&
      (!ffi.lastUpdated || ValidationUtils.isValidTimestamp(ffi.lastUpdated)) &&
      (!ffi.last_updated || ValidationUtils.isValidTimestamp(ffi.last_updated))
    );
  }

  map(data: unknown): Balance {
    const ffi = data as FFIBalanceData;
    
    const available = ValidationUtils.toBigInt(ffi.available);
    
    // Handle different naming conventions
    const pendingIncoming = this.extractBigInt(
      ffi.pendingIncoming || ffi.pending_incoming, 
      0n
    );
    const pendingOutgoing = this.extractBigInt(
      ffi.pendingOutgoing || ffi.pending_outgoing, 
      0n
    );
    
    // Calculate total if not provided
    let total = ffi.total ? ValidationUtils.toBigInt(ffi.total) : available + pendingIncoming;
    
    // Handle different timestamp naming conventions
    const lastUpdated = ffi.lastUpdated || ffi.last_updated;
    
    return {
      available,
      pendingIncoming,
      pendingOutgoing,
      total,
      lastUpdated: lastUpdated ? ValidationUtils.toDate(lastUpdated) : new Date()
    };
  }

  getValidationError(data: unknown): string {
    const ffi = data as FFIBalanceData;
    
    if (!ValidationUtils.isBigIntString(ffi.available)) {
      return ValidationUtils.createValidationError(this.eventType, 'available', 'bigint string', ffi.available);
    }
    
    // Check pending incoming (both naming conventions)
    const pendingIncoming = ffi.pendingIncoming || ffi.pending_incoming;
    if (pendingIncoming && !ValidationUtils.isBigIntString(pendingIncoming)) {
      return ValidationUtils.createValidationError(this.eventType, 'pendingIncoming', 'bigint string', pendingIncoming);
    }
    
    // Check pending outgoing (both naming conventions)
    const pendingOutgoing = ffi.pendingOutgoing || ffi.pending_outgoing;
    if (pendingOutgoing && !ValidationUtils.isBigIntString(pendingOutgoing)) {
      return ValidationUtils.createValidationError(this.eventType, 'pendingOutgoing', 'bigint string', pendingOutgoing);
    }
    
    if (ffi.total && !ValidationUtils.isBigIntString(ffi.total)) {
      return ValidationUtils.createValidationError(this.eventType, 'total', 'bigint string', ffi.total);
    }
    
    return `Invalid data for ${this.eventType}`;
  }

  /**
   * Helper to extract BigInt value with fallback
   */
  private extractBigInt(value: unknown, fallback: bigint): bigint {
    if (value === null || value === undefined) return fallback;
    try {
      return ValidationUtils.toBigInt(value);
    } catch {
      return fallback;
    }
  }
}

/**
 * Enhanced balance mapper that includes extended balance information
 */
export class ExtendedBalanceMapper extends BaseEventMapper<Balance & {
  timeLocked?: bigint;
  confirmed?: bigint;
  unconfirmed?: bigint;
  height?: number;
}> {
  constructor() {
    super('balance:updated:extended');
  }

  validate(data: unknown): boolean {
    // First validate basic balance fields
    const baseMapper = new BalanceMapper();
    if (!baseMapper.validate(data)) {
      return false;
    }

    const ffi = data as FFIBalanceData;
    return (
      (!ffi.timeLocked || ValidationUtils.isBigIntString(ffi.timeLocked)) &&
      (!ffi.time_locked || ValidationUtils.isBigIntString(ffi.time_locked)) &&
      (!ffi.confirmed || ValidationUtils.isBigIntString(ffi.confirmed)) &&
      (!ffi.unconfirmed || ValidationUtils.isBigIntString(ffi.unconfirmed)) &&
      (!ffi.height || ValidationUtils.isValidNumber(ffi.height))
    );
  }

  map(data: unknown): Balance & {
    timeLocked?: bigint;
    confirmed?: bigint;
    unconfirmed?: bigint;
    height?: number;
  } {
    const baseMapper = new BalanceMapper();
    const baseBalance = baseMapper.map(data);
    
    const ffi = data as FFIBalanceData;
    
    // Handle different naming conventions for time_locked
    const timeLocked = ffi.timeLocked || ffi.time_locked;
    
    return {
      ...baseBalance,
      timeLocked: timeLocked ? ValidationUtils.toBigInt(timeLocked) : undefined,
      confirmed: ffi.confirmed ? ValidationUtils.toBigInt(ffi.confirmed) : undefined,
      unconfirmed: ffi.unconfirmed ? ValidationUtils.toBigInt(ffi.unconfirmed) : undefined,
      height: ffi.height ? ValidationUtils.toNumber(ffi.height) : undefined
    };
  }

  getValidationError(data: unknown): string {
    // First check base balance validation
    const baseMapper = new BalanceMapper();
    const baseError = baseMapper.getValidationError(data);
    if (baseError !== `Invalid data for ${baseMapper.eventType}`) {
      return baseError;
    }

    const ffi = data as FFIBalanceData;
    
    const timeLocked = ffi.timeLocked || ffi.time_locked;
    if (timeLocked && !ValidationUtils.isBigIntString(timeLocked)) {
      return ValidationUtils.createValidationError(this.eventType, 'timeLocked', 'bigint string', timeLocked);
    }
    
    if (ffi.confirmed && !ValidationUtils.isBigIntString(ffi.confirmed)) {
      return ValidationUtils.createValidationError(this.eventType, 'confirmed', 'bigint string', ffi.confirmed);
    }
    
    if (ffi.unconfirmed && !ValidationUtils.isBigIntString(ffi.unconfirmed)) {
      return ValidationUtils.createValidationError(this.eventType, 'unconfirmed', 'bigint string', ffi.unconfirmed);
    }
    
    if (ffi.height && !ValidationUtils.isValidNumber(ffi.height)) {
      return ValidationUtils.createValidationError(this.eventType, 'height', 'number', ffi.height);
    }
    
    return `Invalid data for ${this.eventType}`;
  }
}

/**
 * Create and return all balance mappers
 */
export function createBalanceMappers(): {
  balance: BalanceMapper;
  extended: ExtendedBalanceMapper;
} {
  return {
    balance: new BalanceMapper(),
    extended: new ExtendedBalanceMapper()
  };
}

/**
 * Register balance mappers with a registry
 */
export function registerBalanceMappers(registry: any): void {
  const mappers = createBalanceMappers();
  
  registry.register(mappers.balance);
  registry.register(mappers.extended);
}

/**
 * Helper function to validate balance consistency
 */
export function validateBalanceConsistency(balance: Balance): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check for negative values
  if (balance.available < 0n) {
    errors.push('Available balance cannot be negative');
  }
  
  if (balance.pendingIncoming < 0n) {
    errors.push('Pending incoming balance cannot be negative');
  }
  
  if (balance.pendingOutgoing < 0n) {
    errors.push('Pending outgoing balance cannot be negative');
  }

  // Check total calculation
  const expectedTotal = balance.available + balance.pendingIncoming;
  if (balance.total !== expectedTotal) {
    warnings.push(
      `Total balance (${balance.total}) doesn't match calculated total (${expectedTotal})`
    );
  }

  // Check if amounts are reasonable (not excessively large)
  const maxReasonableAmount = BigInt('1000000000000000000'); // 1 quintillion microTari
  if (balance.total > maxReasonableAmount) {
    warnings.push('Total balance seems unreasonably large');
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors
  };
}

/**
 * Helper function to format balance for display
 */
export function formatBalance(balance: Balance): {
  available: string;
  pendingIncoming: string;
  pendingOutgoing: string;
  total: string;
  formatted: {
    available: string;
    pendingIncoming: string;
    pendingOutgoing: string;
    total: string;
  };
} {
  // Convert microTari to Tari (divide by 1,000,000)
  const toTari = (microTari: bigint): string => {
    const tari = Number(microTari) / 1_000_000;
    return tari.toFixed(6);
  };

  return {
    available: balance.available.toString(),
    pendingIncoming: balance.pendingIncoming.toString(),
    pendingOutgoing: balance.pendingOutgoing.toString(),
    total: balance.total.toString(),
    formatted: {
      available: `${toTari(balance.available)} XTR`,
      pendingIncoming: `${toTari(balance.pendingIncoming)} XTR`,
      pendingOutgoing: `${toTari(balance.pendingOutgoing)} XTR`,
      total: `${toTari(balance.total)} XTR`
    }
  };
}

/**
 * Helper function to calculate balance changes
 */
export function calculateBalanceChange(
  previous: Balance,
  current: Balance
): {
  availableChange: bigint;
  pendingIncomingChange: bigint;
  pendingOutgoingChange: bigint;
  totalChange: bigint;
  hasChanges: boolean;
} {
  const availableChange = current.available - previous.available;
  const pendingIncomingChange = current.pendingIncoming - previous.pendingIncoming;
  const pendingOutgoingChange = current.pendingOutgoing - previous.pendingOutgoing;
  const totalChange = current.total - previous.total;

  return {
    availableChange,
    pendingIncomingChange,
    pendingOutgoingChange,
    totalChange,
    hasChanges: availableChange !== 0n || pendingIncomingChange !== 0n || 
                pendingOutgoingChange !== 0n || totalChange !== 0n
  };
}
