/**
 * @fileoverview Balance types and interfaces for the Tari JavaScript SDK
 * 
 * Defines balance structures with computed properties and immutable operations
 * for wallet balance management and queries.
 */

import type { MicroTari } from './branded';
import type { UnixTimestamp } from './branded';

// Core balance interface
export interface Balance {
  /** Available balance for spending */
  readonly available: MicroTari;
  /** Incoming transactions pending confirmation */
  readonly pendingIncoming: MicroTari;
  /** Outgoing transactions pending confirmation */
  readonly pendingOutgoing: MicroTari;
  /** Time-locked balance not yet spendable */
  readonly timelocked: MicroTari;
}

// Enhanced balance with computed properties
export interface BalanceInfo extends Balance {
  /** Total balance including pending amounts */
  readonly total: MicroTari;
  /** Effective spendable balance (available - pending outgoing) */
  readonly spendable: MicroTari;
  /** Balance that will be available after pending transactions clear */
  readonly projected: MicroTari;
  /** Timestamp when balance was last updated */
  readonly lastUpdated: UnixTimestamp;
}

// Historical balance data point
export interface BalanceSnapshot {
  /** Balance at this point in time */
  readonly balance: BalanceInfo;
  /** Block height when snapshot was taken */
  readonly blockHeight: bigint;
  /** Timestamp when snapshot was created */
  readonly timestamp: UnixTimestamp;
  /** Change from previous snapshot */
  readonly change?: BalanceChange;
}

// Balance change information
export interface BalanceChange {
  /** Change in available balance */
  readonly available: MicroTari;
  /** Change in pending incoming balance */
  readonly pendingIncoming: MicroTari;
  /** Change in pending outgoing balance */
  readonly pendingOutgoing: MicroTari;
  /** Change in time-locked balance */
  readonly timelocked: MicroTari;
  /** Net change in total balance */
  readonly net: MicroTari;
  /** Reason for the balance change */
  readonly reason: BalanceChangeReason;
}

// Reasons for balance changes
export const BalanceChangeReason = {
  TransactionReceived: 'transaction_received',
  TransactionSent: 'transaction_sent',
  TransactionMined: 'transaction_mined',
  TransactionCancelled: 'transaction_cancelled',
  TimeLockExpired: 'timelock_expired',
  CoinbaseReceived: 'coinbase_received',
  Reorg: 'reorg',
  Sync: 'sync',
  Unknown: 'unknown'
} as const;

export type BalanceChangeReason = typeof BalanceChangeReason[keyof typeof BalanceChangeReason];

// Balance validation result
export interface BalanceValidation {
  /** Whether the balance is valid */
  readonly valid: boolean;
  /** Validation errors if any */
  readonly errors: BalanceValidationError[];
  /** Validation warnings if any */
  readonly warnings: BalanceValidationWarning[];
}

export interface BalanceValidationError {
  readonly code: string;
  readonly message: string;
  readonly field: keyof Balance;
}

export interface BalanceValidationWarning {
  readonly code: string;
  readonly message: string;
  readonly field: keyof Balance;
  readonly recommendation: string;
}

// Balance query options
export interface BalanceQueryOptions {
  /** Include pending transactions */
  includePending?: boolean;
  /** Include time-locked amounts */
  includeTimelocked?: boolean;
  /** Maximum age of cached balance data in milliseconds */
  maxAge?: number;
  /** Force refresh from source */
  forceRefresh?: boolean;
}

// Balance formatting options
export interface BalanceFormatOptions {
  /** Number of decimal places to show */
  decimals?: number;
  /** Whether to show the currency symbol */
  showSymbol?: boolean;
  /** Currency symbol to use */
  symbol?: string;
  /** Locale for number formatting */
  locale?: string;
  /** Whether to use group separators (commas) */
  useGrouping?: boolean;
  /** Minimum fraction digits */
  minimumFractionDigits?: number;
  /** Maximum fraction digits */
  maximumFractionDigits?: number;
}

// Immutable balance operations
export class BalanceCalculator {
  /**
   * Calculate total balance including all components
   */
  static calculateTotal(balance: Balance): MicroTari {
    return (balance.available + balance.pendingIncoming + balance.timelocked) as MicroTari;
  }

  /**
   * Calculate spendable balance (available minus pending outgoing)
   */
  static calculateSpendable(balance: Balance): MicroTari {
    return (balance.available - balance.pendingOutgoing) as MicroTari;
  }

  /**
   * Calculate projected balance after pending transactions clear
   */
  static calculateProjected(balance: Balance): MicroTari {
    return (balance.available + balance.pendingIncoming - balance.pendingOutgoing) as MicroTari;
  }

  /**
   * Add two balances together
   */
  static add(a: Balance, b: Balance): Balance {
    return {
      available: (a.available + b.available) as MicroTari,
      pendingIncoming: (a.pendingIncoming + b.pendingIncoming) as MicroTari,
      pendingOutgoing: (a.pendingOutgoing + b.pendingOutgoing) as MicroTari,
      timelocked: (a.timelocked + b.timelocked) as MicroTari
    };
  }

  /**
   * Subtract one balance from another
   */
  static subtract(a: Balance, b: Balance): Balance {
    return {
      available: (a.available - b.available) as MicroTari,
      pendingIncoming: (a.pendingIncoming - b.pendingIncoming) as MicroTari,
      pendingOutgoing: (a.pendingOutgoing - b.pendingOutgoing) as MicroTari,
      timelocked: (a.timelocked - b.timelocked) as MicroTari
    };
  }

  /**
   * Calculate the difference between two balances
   */
  static diff(current: Balance, previous: Balance): BalanceChange {
    const availableChange = (current.available - previous.available) as MicroTari;
    const pendingIncomingChange = (current.pendingIncoming - previous.pendingIncoming) as MicroTari;
    const pendingOutgoingChange = (current.pendingOutgoing - previous.pendingOutgoing) as MicroTari;
    const timelockedChange = (current.timelocked - previous.timelocked) as MicroTari;
    
    const net = (availableChange + pendingIncomingChange - pendingOutgoingChange + timelockedChange) as MicroTari;

    return {
      available: availableChange,
      pendingIncoming: pendingIncomingChange,
      pendingOutgoing: pendingOutgoingChange,
      timelocked: timelockedChange,
      net,
      reason: BalanceChangeReason.Unknown
    };
  }

  /**
   * Check if balance has sufficient funds for an amount
   */
  static hasSufficientFunds(balance: Balance, amount: MicroTari, includePending = false): boolean {
    const availableAmount = includePending 
      ? this.calculateSpendable(balance)
      : balance.available;
    return availableAmount >= amount;
  }

  /**
   * Create a balance with all zero values
   */
  static zero(): Balance {
    return {
      available: 0n as MicroTari,
      pendingIncoming: 0n as MicroTari,
      pendingOutgoing: 0n as MicroTari,
      timelocked: 0n as MicroTari
    };
  }

  /**
   * Check if balance is effectively zero
   */
  static isZero(balance: Balance): boolean {
    return balance.available === 0n &&
           balance.pendingIncoming === 0n &&
           balance.pendingOutgoing === 0n &&
           balance.timelocked === 0n;
  }

  /**
   * Validate balance integrity
   */
  static validate(balance: Balance): BalanceValidation {
    const errors: BalanceValidationError[] = [];
    const warnings: BalanceValidationWarning[] = [];

    // Check for negative values
    if (balance.available < 0n) {
      errors.push({
        code: 'NEGATIVE_AVAILABLE',
        message: 'Available balance cannot be negative',
        field: 'available'
      });
    }

    if (balance.pendingIncoming < 0n) {
      errors.push({
        code: 'NEGATIVE_PENDING_INCOMING',
        message: 'Pending incoming balance cannot be negative',
        field: 'pendingIncoming'
      });
    }

    if (balance.pendingOutgoing < 0n) {
      errors.push({
        code: 'NEGATIVE_PENDING_OUTGOING',
        message: 'Pending outgoing balance cannot be negative',
        field: 'pendingOutgoing'
      });
    }

    if (balance.timelocked < 0n) {
      errors.push({
        code: 'NEGATIVE_TIMELOCKED',
        message: 'Time-locked balance cannot be negative',
        field: 'timelocked'
      });
    }

    // Check for unreasonably large values
    const MAX_TARI = 21_000_000_000_000_000n; // 21 billion Tari in MicroTari
    
    if (balance.available > MAX_TARI) {
      warnings.push({
        code: 'LARGE_AVAILABLE',
        message: 'Available balance exceeds maximum Tari supply',
        field: 'available',
        recommendation: 'Verify the balance calculation'
      });
    }

    // Check for spendable balance being negative
    const spendable = this.calculateSpendable(balance);
    if (spendable < 0n) {
      warnings.push({
        code: 'NEGATIVE_SPENDABLE',
        message: 'Spendable balance is negative due to high pending outgoing',
        field: 'pendingOutgoing',
        recommendation: 'Consider the impact of pending transactions'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// Enhanced balance info implementation
export class BalanceInfoImpl implements BalanceInfo {
  constructor(
    public readonly available: MicroTari,
    public readonly pendingIncoming: MicroTari,
    public readonly pendingOutgoing: MicroTari,
    public readonly timelocked: MicroTari,
    public readonly lastUpdated: UnixTimestamp = Date.now() as UnixTimestamp
  ) {}

  get total(): MicroTari {
    return BalanceCalculator.calculateTotal(this);
  }

  get spendable(): MicroTari {
    return BalanceCalculator.calculateSpendable(this);
  }

  get projected(): MicroTari {
    return BalanceCalculator.calculateProjected(this);
  }

  /**
   * Create a new BalanceInfo with updated values
   */
  update(updates: Partial<Balance>): BalanceInfoImpl {
    return new BalanceInfoImpl(
      updates.available ?? this.available,
      updates.pendingIncoming ?? this.pendingIncoming,
      updates.pendingOutgoing ?? this.pendingOutgoing,
      updates.timelocked ?? this.timelocked,
      Date.now() as UnixTimestamp
    );
  }

  /**
   * Calculate change from another balance
   */
  changeFrom(other: Balance): BalanceChange {
    return BalanceCalculator.diff(this, other);
  }

  /**
   * Check if this balance is sufficient for an amount
   */
  canSpend(amount: MicroTari, includePending = false): boolean {
    return BalanceCalculator.hasSufficientFunds(this, amount, includePending);
  }

  /**
   * Validate this balance
   */
  validate(): BalanceValidation {
    return BalanceCalculator.validate(this);
  }

  /**
   * Convert to plain Balance object
   */
  toBalance(): Balance {
    return {
      available: this.available,
      pendingIncoming: this.pendingIncoming,
      pendingOutgoing: this.pendingOutgoing,
      timelocked: this.timelocked
    };
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): object {
    return {
      available: this.available.toString(),
      pendingIncoming: this.pendingIncoming.toString(),
      pendingOutgoing: this.pendingOutgoing.toString(),
      timelocked: this.timelocked.toString(),
      total: this.total.toString(),
      spendable: this.spendable.toString(),
      projected: this.projected.toString(),
      lastUpdated: this.lastUpdated
    };
  }

  /**
   * Create from JSON representation
   */
  static fromJSON(json: any): BalanceInfoImpl {
    return new BalanceInfoImpl(
      BigInt(json.available) as MicroTari,
      BigInt(json.pendingIncoming) as MicroTari,
      BigInt(json.pendingOutgoing) as MicroTari,
      BigInt(json.timelocked) as MicroTari,
      json.lastUpdated as UnixTimestamp
    );
  }
}

// Balance snapshot implementation
export class BalanceSnapshotImpl implements BalanceSnapshot {
  constructor(
    public readonly balance: BalanceInfoImpl,
    public readonly blockHeight: bigint,
    public readonly timestamp: UnixTimestamp = Date.now() as UnixTimestamp,
    public readonly change?: BalanceChange
  ) {}

  /**
   * Create snapshot with change from previous
   */
  static withChange(
    balance: BalanceInfoImpl,
    blockHeight: bigint,
    previous?: BalanceSnapshot
  ): BalanceSnapshotImpl {
    const change = previous ? balance.changeFrom(previous.balance) : undefined;
    return new BalanceSnapshotImpl(balance, blockHeight, Date.now() as UnixTimestamp, change);
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): object {
    return {
      balance: this.balance.toJSON(),
      blockHeight: this.blockHeight.toString(),
      timestamp: this.timestamp,
      change: this.change ? {
        available: this.change.available.toString(),
        pendingIncoming: this.change.pendingIncoming.toString(),
        pendingOutgoing: this.change.pendingOutgoing.toString(),
        timelocked: this.change.timelocked.toString(),
        net: this.change.net.toString(),
        reason: this.change.reason
      } : undefined
    };
  }
}

// Export all types and utilities
export {
  BalanceCalculator as Calculator
};
