import { TariWallet } from '../wallet';
import { EventEmitter } from 'eventemitter3';
import { WalletEvent } from '../types';
import { Lifecycle } from '@tari-project/core';

export interface DepositAddress {
  userId: string;
  address: string;
  created: Date;
  lastSeen?: Date;
  totalReceived: bigint;
}

export interface DepositEvent {
  userId: string;
  address: string;
  amount: bigint;
  txId: string;
  confirmations: number;
}

export interface DepositStatistics {
  totalUsers: number;
  totalDeposits: number;
  totalVolume: bigint;
  averageDeposit: bigint;
}

export class DepositManager extends EventEmitter<{
  deposit: DepositEvent;
  confirmed: DepositEvent;
}> implements Lifecycle {
  private addresses = new Map<string, DepositAddress>();
  private addressToUser = new Map<string, string>();
  private cleanupFunctions: Array<() => void> = [];
  private isInitialized = false;

  constructor(private wallet: TariWallet) {
    super();
    // No side effects in constructor
  }

  /**
   * Initialize the deposit manager and start listening for events.
   * Must be called after construction before using the manager.
   * This method is idempotent - safe to call multiple times.
   */
  initialize(): void {
    // Return early if already initialized (idempotent)
    if (this.isInitialized) {
      return;
    }

    // Store bound functions for later cleanup
    const transactionReceivedHandler = (tx: unknown) => this.handleIncomingTransaction(tx);
    const transactionConfirmedHandler = (tx: unknown) => this.handleConfirmedTransaction(tx);
    
    // Attach listeners
    this.wallet.on(WalletEvent.TransactionReceived, transactionReceivedHandler);
    this.wallet.on(WalletEvent.TransactionConfirmed, transactionConfirmedHandler);
    
    // Store cleanup functions
    this.cleanupFunctions.push(
      () => this.wallet.off(WalletEvent.TransactionReceived, transactionReceivedHandler),
      () => this.wallet.off(WalletEvent.TransactionConfirmed, transactionConfirmedHandler)
    );

    this.isInitialized = true;
  }

  /**
   * Clean up all event listeners and resources.
   * Should be called before discarding the manager instance.
   * This method is idempotent - safe to call multiple times or before initialize().
   */
  teardown(): void {
    // Safe to call even if not initialized (idempotent)
    if (!this.isInitialized) {
      return;
    }

    // Clean up all listeners
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions = [];
    this.isInitialized = false;
  }

  /**
   * Legacy method for cleanup. Use teardown() instead.
   * @deprecated Use teardown() instead
   */
  destroy(): void {
    this.teardown();
  }

  /**
   * Generate a new deposit address for a user
   */
  async generateAddress(userId: string): Promise<string> {
    if (!userId || userId.trim().length === 0) {
      throw new Error('User ID is required');
    }

    // Check if address already exists for this user
    const existing = this.addresses.get(userId);
    if (existing) {
      return existing.address;
    }

    // For one-sided payments, we can reuse the same address
    // In production, might want to generate unique addresses
    const address = this.wallet.getReceiveAddress();
    
    const deposit: DepositAddress = {
      userId,
      address,
      created: new Date(),
      totalReceived: 0n,
    };
    
    this.addresses.set(userId, deposit);
    this.addressToUser.set(address, userId);
    
    return address;
  }

  /**
   * Get deposit address for user
   */
  getAddress(userId: string): DepositAddress | undefined {
    return this.addresses.get(userId);
  }

  /**
   * Get all addresses
   */
  getAllAddresses(): DepositAddress[] {
    return Array.from(this.addresses.values());
  }

  /**
   * Get deposit statistics
   */
  getStatistics(): DepositStatistics {
    const addresses = Array.from(this.addresses.values());
    const totalVolume = addresses.reduce((sum, addr) => sum + addr.totalReceived, 0n);
    const totalUsers = addresses.length;
    const totalDeposits = addresses.filter(addr => addr.totalReceived > 0n).length;
    const averageDeposit = totalDeposits > 0 ? totalVolume / BigInt(totalDeposits) : 0n;

    return {
      totalUsers,
      totalDeposits,
      totalVolume,
      averageDeposit,
    };
  }

  /**
   * Handle incoming transaction
   */
  private handleIncomingTransaction(tx: unknown): void {
    // Type guard for transaction object
    if (!this.isValidTransaction(tx)) return;

    // Check if transaction is to one of our addresses
    const userId = this.addressToUser.get(tx.destination);
    if (!userId) return;
    
    const deposit = this.addresses.get(userId);
    if (!deposit) return;
    
    // Update deposit info
    deposit.lastSeen = new Date();
    deposit.totalReceived += tx.amount;
    
    // Emit deposit event
    this.emit('deposit', {
      userId,
      address: deposit.address,
      amount: tx.amount,
      txId: tx.id,
      confirmations: tx.confirmations,
    });
  }

  /**
   * Handle confirmed transaction
   */
  private handleConfirmedTransaction(tx: unknown): void {
    // Type guard for transaction object
    if (!this.isValidTransaction(tx)) return;

    const userId = this.addressToUser.get(tx.destination);
    if (!userId) return;
    
    this.emit('confirmed', {
      userId,
      address: tx.destination,
      amount: tx.amount,
      txId: tx.id,
      confirmations: tx.confirmations,
    });
  }

  /**
   * Type guard to check if object is a valid transaction
   */
  private isValidTransaction(tx: unknown): tx is {
    destination: string;
    amount: bigint;
    id: string;
    confirmations: number;
  } {
    if (typeof tx !== 'object' || tx === null) {
      return false;
    }

    const transaction = tx as Record<string, unknown>;
    
    return (
      'destination' in transaction &&
      'amount' in transaction &&
      'id' in transaction &&
      'confirmations' in transaction &&
      typeof transaction.destination === 'string' &&
      typeof transaction.amount === 'bigint' &&
      typeof transaction.id === 'string' &&
      typeof transaction.confirmations === 'number'
    );
  }
}
