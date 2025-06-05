import { EventEmitter } from 'eventemitter3';
import { WalletEvent } from '../types';
import { TariWallet } from '../wallet';

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

export class DepositManager extends EventEmitter<{
  deposit: DepositEvent;
  confirmed: DepositEvent;
}> {
  private addresses = new Map<string, DepositAddress>();
  private addressToUser = new Map<string, string>();

  constructor(private wallet: TariWallet) {
    super();

    // Listen for incoming transactions
    wallet.on(WalletEvent.TransactionReceived, (tx) => {
      this.handleIncomingTransaction(tx);
    });

    wallet.on(WalletEvent.TransactionConfirmed, (tx) => {
      this.handleConfirmedTransaction(tx);
    });
  }

  /**
   * Generate a new deposit address for a user
   */
  async generateAddress(userId: string): Promise<string> {
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

  getStatistics() {
    let totalDeposits = 0;
    let totalVolume = 0n;

    for (const deposit of this.addresses.values()) {
      if (deposit.totalReceived > 0n) {
        totalDeposits += 1;
        totalVolume += deposit.totalReceived;
      }
    }

    return {
      totalDeposits,
      totalVolume,
    };
  }
}
