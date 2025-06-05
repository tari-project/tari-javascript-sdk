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
  private listeners: Array<() => void> = [];

  constructor(private wallet: TariWallet) {
    super();
    // No side effects in constructor
  }

  /**
   * Initialize the deposit manager and start listening for events.
   * Must be called after construction before using the manager.
   */
  initialize(): void {
    // Store bound functions for later cleanup
    const transactionReceivedHandler = (tx: any) => this.handleIncomingTransaction(tx);
    const transactionConfirmedHandler = (tx: any) => this.handleConfirmedTransaction(tx);
    
    // Attach listeners
    this.wallet.on(WalletEvent.TransactionReceived, transactionReceivedHandler);
    this.wallet.on(WalletEvent.TransactionConfirmed, transactionConfirmedHandler);
    
    // Store cleanup functions
    this.listeners.push(
      () => this.wallet.off(WalletEvent.TransactionReceived, transactionReceivedHandler),
      () => this.wallet.off(WalletEvent.TransactionConfirmed, transactionConfirmedHandler)
    );
  }

  /**
   * Clean up all event listeners and resources.
   * Should be called before discarding the manager instance.
   */
  teardown(): void {
    // Clean up all listeners
    this.listeners.forEach(cleanup => cleanup());
    this.listeners = [];
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
  private handleIncomingTransaction(tx: any): void {
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
  private handleConfirmedTransaction(tx: any): void {
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
}
