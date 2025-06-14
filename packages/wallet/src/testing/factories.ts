/**
 * Test data factories for wallet testing
 * Provides deterministic test data generation
 */

import { randomBytes } from 'crypto';

// Transaction status constants
export enum TransactionStatus {
  Pending = 'pending',
  Broadcast = 'broadcast',
  MinedUnconfirmed = 'mined_unconfirmed',
  MinedConfirmed = 'mined_confirmed',
  Cancelled = 'cancelled',
  Rejected = 'rejected',
}

// Network types
export enum NetworkType {
  Mainnet = 'mainnet',
  Testnet = 'testnet',
  Localnet = 'localnet',
}

// Balance structure
export interface Balance {
  available: bigint;
  pendingIncoming: bigint;
  pendingOutgoing: bigint;
  timelocked: bigint;
}

// Transaction structure
export interface Transaction {
  id: string;
  amount: bigint;
  fee: bigint;
  status: TransactionStatus;
  message: string;
  timestamp: Date;
  isInbound: boolean;
  address: string;
  confirmations: number;
}

// Pending transaction structure
export interface PendingTransaction {
  id: string;
  amount: bigint;
  fee: bigint;
  message: string;
  timestamp: Date;
  recipientAddress: string;
  status: TransactionStatus;
}

// Wallet configuration
export interface WalletConfig {
  network: NetworkType;
  storagePath: string;
  logPath?: string;
  logLevel?: number;
  passphrase?: string;
  seedWords?: string[];
}

/**
 * Factory for creating test wallet configurations
 */
export class WalletConfigFactory {
  static create(overrides?: Partial<WalletConfig>): WalletConfig {
    return {
      network: NetworkType.Testnet,
      storagePath: `/tmp/test-wallet-${randomBytes(8).toString('hex')}`,
      logLevel: 2, // Info level
      ...overrides,
    };
  }

  static mainnet(overrides?: Partial<WalletConfig>): WalletConfig {
    return this.create({
      network: NetworkType.Mainnet,
      ...overrides,
    });
  }

  static testnet(overrides?: Partial<WalletConfig>): WalletConfig {
    return this.create({
      network: NetworkType.Testnet,
      ...overrides,
    });
  }

  static withSeedWords(seedWords: string[], overrides?: Partial<WalletConfig>): WalletConfig {
    return this.create({
      seedWords,
      ...overrides,
    });
  }

  static withPassphrase(passphrase: string, overrides?: Partial<WalletConfig>): WalletConfig {
    return this.create({
      passphrase,
      ...overrides,
    });
  }
}

/**
 * Factory for creating test balances
 */
export class BalanceFactory {
  static create(overrides?: Partial<Balance>): Balance {
    return {
      available: 1000000000n, // 1 Tari in µT
      pendingIncoming: 0n,
      pendingOutgoing: 0n,
      timelocked: 0n,
      ...overrides,
    };
  }

  static empty(): Balance {
    return this.create({
      available: 0n,
      pendingIncoming: 0n,
      pendingOutgoing: 0n,
      timelocked: 0n,
    });
  }

  static withAvailable(amount: bigint): Balance {
    return this.create({
      available: amount,
    });
  }

  static withPending(incoming: bigint, outgoing: bigint): Balance {
    return this.create({
      pendingIncoming: incoming,
      pendingOutgoing: outgoing,
    });
  }

  static rich(): Balance {
    return this.create({
      available: 100000000000n, // 100 Tari
      pendingIncoming: 5000000000n, // 5 Tari
      pendingOutgoing: 2000000000n, // 2 Tari
      timelocked: 1000000000n, // 1 Tari
    });
  }
}

/**
 * Factory for creating test transactions
 */
export class TransactionFactory {
  static create(overrides?: Partial<Transaction>): Transaction {
    const id = randomBytes(16).toString('hex');
    return {
      id,
      amount: 1000000n, // 0.001 Tari
      fee: 5000n, // Standard fee
      status: TransactionStatus.Pending,
      message: `Test transaction ${id.slice(0, 8)}`,
      timestamp: new Date(),
      isInbound: false,
      address: `tari://testnet/mock_address_${randomBytes(8).toString('hex')}`,
      confirmations: 0,
      ...overrides,
    };
  }

  static pending(overrides?: Partial<Transaction>): Transaction {
    return this.create({
      status: TransactionStatus.Pending,
      confirmations: 0,
      ...overrides,
    });
  }

  static confirmed(overrides?: Partial<Transaction>): Transaction {
    return this.create({
      status: TransactionStatus.MinedConfirmed,
      confirmations: 5,
      timestamp: new Date(Date.now() - 3600000), // 1 hour ago
      ...overrides,
    });
  }

  static inbound(overrides?: Partial<Transaction>): Transaction {
    return this.create({
      isInbound: true,
      ...overrides,
    });
  }

  static outbound(overrides?: Partial<Transaction>): Transaction {
    return this.create({
      isInbound: false,
      ...overrides,
    });
  }

  static cancelled(overrides?: Partial<Transaction>): Transaction {
    return this.create({
      status: TransactionStatus.Cancelled,
      ...overrides,
    });
  }

  static largeAmount(overrides?: Partial<Transaction>): Transaction {
    return this.create({
      amount: 10000000000n, // 10 Tari
      fee: 25000n, // Higher fee for large amount
      ...overrides,
    });
  }

  static withMessage(message: string, overrides?: Partial<Transaction>): Transaction {
    return this.create({
      message,
      ...overrides,
    });
  }
}

/**
 * Factory for creating pending transactions
 */
export class PendingTransactionFactory {
  static create(overrides?: Partial<PendingTransaction>): PendingTransaction {
    const id = randomBytes(16).toString('hex');
    return {
      id,
      amount: 1000000n, // 0.001 Tari
      fee: 5000n,
      message: `Test pending transaction ${id.slice(0, 8)}`,
      timestamp: new Date(),
      recipientAddress: `tari://testnet/recipient_${randomBytes(8).toString('hex')}`,
      status: TransactionStatus.Pending,
      ...overrides,
    };
  }

  static outbound(overrides?: Partial<PendingTransaction>): PendingTransaction {
    return this.create({
      status: TransactionStatus.Pending,
      ...overrides,
    });
  }

  static broadcast(overrides?: Partial<PendingTransaction>): PendingTransaction {
    return this.create({
      status: TransactionStatus.Broadcast,
      timestamp: new Date(Date.now() - 300000), // 5 minutes ago
      ...overrides,
    });
  }
}

/**
 * Factory for creating test addresses
 */
export class AddressFactory {
  static create(network: NetworkType = NetworkType.Testnet): string {
    const hash = randomBytes(32).toString('hex');
    return `tari://${network}/${hash}`;
  }

  static testnet(): string {
    return this.create(NetworkType.Testnet);
  }

  static mainnet(): string {
    return this.create(NetworkType.Mainnet);
  }

  static invalid(): string {
    return 'invalid_address_format';
  }

  static emoji(): string {
    const emojis = ['🌟', '🎯', '🚀', '💎', '🔥', '⚡', '🎨', '🌈'];
    return Array.from({ length: 32 }, () => 
      emojis[Math.floor(Math.random() * emojis.length)]
    ).join('');
  }
}

/**
 * Factory for creating seed words
 */
export class SeedWordsFactory {
  private static readonly WORD_LIST = [
    'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
    'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
    'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
    'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
    'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'against', 'agent',
    'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album',
  ];

  static create(count: number = 24): string[] {
    if (count !== 12 && count !== 15 && count !== 18 && count !== 21 && count !== 24) {
      throw new Error('Seed word count must be 12, 15, 18, 21, or 24');
    }

    const words: string[] = [];
    for (let i = 0; i < count; i++) {
      words.push(this.WORD_LIST[i % this.WORD_LIST.length]);
    }
    return words;
  }

  static valid24Words(): string[] {
    return this.create(24);
  }

  static valid12Words(): string[] {
    return this.create(12);
  }

  static deterministic(seed: string, count: number = 24): string[] {
    // Create deterministic seed words based on input seed
    const words: string[] = [];
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash + seed.charCodeAt(i)) & 0xffffffff;
    }

    for (let i = 0; i < count; i++) {
      const index = Math.abs(hash + i) % this.WORD_LIST.length;
      words.push(this.WORD_LIST[index]);
    }
    return words;
  }

  static alice(): string[] {
    return this.deterministic('alice', 24);
  }

  static bob(): string[] {
    return this.deterministic('bob', 24);
  }

  static charlie(): string[] {
    return this.deterministic('charlie', 24);
  }

  static invalid(): string[] {
    return ['invalid', 'seed', 'words', 'that', 'should', 'not', 'work'];
  }
}

/**
 * Factory for creating test public keys
 */
export class PublicKeyFactory {
  static create(): string {
    return randomBytes(32).toString('hex');
  }

  static deterministic(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash + seed.charCodeAt(i)) & 0xffffffff;
    }
    return hash.toString(16).padStart(64, '0');
  }

  static alice(): string {
    return this.deterministic('alice');
  }

  static bob(): string {
    return this.deterministic('bob');
  }

  static charlie(): string {
    return this.deterministic('charlie');
  }
}

/**
 * Factory for creating test error scenarios
 */
export class ErrorFactory {
  static insufficientFunds(): Error {
    return new Error('Insufficient funds for transaction');
  }

  static invalidAddress(): Error {
    return new Error('Invalid recipient address');
  }

  static networkError(): Error {
    return new Error('Network connection failed');
  }

  static walletLocked(): Error {
    return new Error('Wallet is locked');
  }

  static ffiError(operation: string): Error {
    return new Error(`FFI operation failed: ${operation}`);
  }

  static timeoutError(operation: string): Error {
    return new Error(`Operation timeout: ${operation}`);
  }
}
