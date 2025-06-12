/**
 * @fileoverview Wallet data models and domain objects
 * 
 * This module contains wallet-specific domain models that encapsulate
 * business logic and provide clean interfaces for wallet operations.
 */

import { TariError, ErrorCode, TariAddress } from '@tari-project/tarijs-core';
import type { 
  Balance
} from '../types/index';

/**
 * Enhanced balance model with computed properties
 */
class Balance {
  private readonly balance: Balance;

  constructor(balance: Balance) {
    this.balance = { ...balance };
  }

  /**
   * Available balance for spending
   */
  get available(): bigint {
    return this.balance.available;
  }

  /**
   * Incoming pending transactions
   */
  get pendingIncoming(): bigint {
    return this.balance.pendingIncoming;
  }

  /**
   * Outgoing pending transactions
   */
  get pendingOutgoing(): bigint {
    return this.balance.pendingOutgoing;
  }



  /**
   * Total balance including pending incoming
   */
  get total(): bigint {
    return this.balance.available + this.balance.pendingIncoming;
  }

  /**
   * Effective spendable balance (available minus pending outgoing)
   */
  get spendable(): bigint {
    return this.balance.available - this.balance.pendingOutgoing;
  }

  /**
   * Check if wallet has sufficient balance for amount
   */
  hasEnoughFor(amount: bigint): boolean {
    return this.spendable >= amount;
  }

  /**
   * Get balance as plain object
   */
  toJSON(): Balance {
    return { ...this.balance };
  }
}

/**
 * Transaction ID wrapper with validation
 */
class TransactionId {
  private readonly id: bigint;

  constructor(id: bigint | string | number) {
    this.id = typeof id === 'bigint' ? id : BigInt(id);
    if (this.id < 0n) {
      throw new TariError(
        ErrorCode.InvalidConfig,
        'Transaction ID must be non-negative'
      );
    }
  }

  /**
   * Get the transaction ID as bigint
   */
  toBigInt(): bigint {
    return this.id;
  }

  /**
   * Get the transaction ID as string
   */
  toString(): string {
    return this.id.toString();
  }

  /**
   * Check if two transaction IDs are equal
   */
  equals(other: TransactionId): boolean {
    return this.id === other.id;
  }
}

// Export all models
export { TariAddress, Balance, TransactionId };
