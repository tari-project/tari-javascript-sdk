/**
 * @fileoverview Wallet data models and domain objects
 * 
 * This module contains wallet-specific domain models that encapsulate
 * business logic and provide clean interfaces for wallet operations.
 */

import { TariError, ErrorCode, NetworkType } from '@tari-project/tarijs-core';
import type { 
  TariAddressComponents, 
  Balance
} from '../types/index';

/**
 * Represents a Tari address with validation and utility methods
 */
class TariAddress {
  private readonly components: TariAddressComponents;

  constructor(components: TariAddressComponents) {
    this.validateComponents(components);
    this.components = { ...components };
  }

  /**
   * Create TariAddress from base58 string
   */
  static fromBase58(_address: string): TariAddress {
    // Placeholder implementation - will be replaced with FFI
    throw new TariError(
      ErrorCode.NotImplemented,
      'Address parsing from base58 not yet implemented'
    );
  }

  /**
   * Create TariAddress from emoji ID
   */
  static fromEmojiId(_emojiId: string): TariAddress {
    // Placeholder implementation - will be replaced with FFI
    throw new TariError(
      ErrorCode.NotImplemented,
      'Address parsing from emoji ID not yet implemented'
    );
  }

  /**
   * Get the public key component
   */
  get publicKey(): string {
    return this.components.publicKey;
  }

  /**
   * Get the network this address is for
   */
  get network(): NetworkType {
    return this.components.network;
  }

  /**
   * Convert to base58 string representation
   */
  toBase58(): string {
    // Placeholder implementation - will be replaced with FFI
    throw new TariError(
      ErrorCode.NotImplemented,
      'Address conversion to base58 not yet implemented'
    );
  }

  /**
   * Convert to emoji ID representation
   */
  toEmojiId(): string {
    // Placeholder implementation - will be replaced with FFI
    throw new TariError(
      ErrorCode.NotImplemented,
      'Address conversion to emoji ID not yet implemented'
    );
  }

  /**
   * Get string representation (defaults to base58)
   */
  toString(): string {
    return this.toBase58();
  }

  /**
   * Check if two addresses are equal
   */
  equals(other: TariAddress): boolean {
    return (
      this.components.publicKey === other.components.publicKey &&
      this.components.network === other.components.network
    );
  }

  private validateComponents(components: TariAddressComponents): void {
    if (!components.publicKey) {
      throw new TariError(
        ErrorCode.InvalidConfig,
        'Address public key is required'
      );
    }
    if (!components.network) {
      throw new TariError(
        ErrorCode.InvalidConfig,
        'Address network is required'
      );
    }
  }
}

/**
 * Enhanced balance model with computed properties
 */
class WalletBalance {
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
export { TariAddress, WalletBalance, TransactionId };
