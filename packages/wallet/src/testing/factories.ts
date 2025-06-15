/**
 * Test data factories for wallet testing
 * Provides deterministic test data generation
 */

import { randomBytes } from 'crypto';
import { 
  NetworkType,
  TransactionStatus,
  createMicroTari, 
  MicroTari, 
  TariAddressString, 
  createTransactionId, 
  TransactionId,
  WalletPath
} from '@tari-project/tarijs-core';

// Balance structure
export interface Balance {
  available: MicroTari;
  pendingIncoming: MicroTari;
  pendingOutgoing: MicroTari;
  timelocked: MicroTari;
}

// Transaction structure
export interface Transaction {
  id: TransactionId;
  amount: MicroTari;
  fee: MicroTari;
  status: TransactionStatus;
  message: string;
  timestamp: Date;
  isInbound: boolean;
  address: TariAddressString;
  confirmations: number;
}

// Pending transaction structure
export interface PendingTransaction {
  id: TransactionId;
  amount: MicroTari;
  fee: MicroTari;
  message: string;
  timestamp: Date;
  recipientAddress: TariAddressString;
  status: TransactionStatus;
}

// Wallet configuration
export interface WalletConfig {
  network: NetworkType;
  storagePath: WalletPath;
  logPath?: WalletPath;
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
      storagePath: `/tmp/test-wallet-${randomBytes(8).toString('hex')}` as WalletPath,
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
      available: createMicroTari(1000000000n), // 1 Tari in µT
      pendingIncoming: createMicroTari(0n),
      pendingOutgoing: createMicroTari(0n),
      timelocked: createMicroTari(0n),
      ...overrides,
    };
  }

  static empty(): Balance {
    return this.create({
      available: createMicroTari(0n),
      pendingIncoming: createMicroTari(0n),
      pendingOutgoing: createMicroTari(0n),
      timelocked: createMicroTari(0n),
    });
  }

  static withAvailable(amount: MicroTari): Balance {
    return this.create({
      available: amount,
    });
  }

  static withPending(incoming: MicroTari, outgoing: MicroTari): Balance {
    return this.create({
      pendingIncoming: incoming,
      pendingOutgoing: outgoing,
    });
  }

  static rich(): Balance {
    return this.create({
      available: createMicroTari(100000000000n), // 100 Tari
      pendingIncoming: createMicroTari(5000000000n), // 5 Tari
      pendingOutgoing: createMicroTari(2000000000n), // 2 Tari
      timelocked: createMicroTari(1000000000n), // 1 Tari
    });
  }
}

/**
 * Factory for creating test transactions
 */
export class TransactionFactory {
  static create(overrides?: Partial<Transaction>): Transaction {
    const idStr = randomBytes(16).toString('hex');
    return {
      id: createTransactionId(BigInt(`0x${idStr}`)),
      amount: createMicroTari(1000000n), // 0.001 Tari
      fee: createMicroTari(5000n), // Standard fee
      status: TransactionStatus.Pending,
      message: `Test transaction ${idStr.slice(0, 8)}`,
      timestamp: new Date(),
      isInbound: false,
      address: AddressFactory.base58() as TariAddressString,
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
      amount: createMicroTari(10000000000n), // 10 Tari
      fee: createMicroTari(25000n), // Higher fee for large amount
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
    const idStr = randomBytes(16).toString('hex');
    return {
      id: createTransactionId(BigInt(`0x${idStr}`)),
      amount: createMicroTari(1000000n), // 0.001 Tari
      fee: createMicroTari(5000n),
      message: `Test pending transaction ${idStr.slice(0, 8)}`,
      timestamp: new Date(),
      recipientAddress: AddressFactory.base58() as TariAddressString,
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
  // Base58 alphabet for Tari addresses
  private static readonly BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  
  // Tari emoji set for emoji addresses
  private static readonly TARI_EMOJIS = [
    '🐀', '🐁', '🐂', '🐃', '🐄', '🐅', '🐆', '🐇', '🐈', '🐉', '🐊', '🐋', '🐌', '🐍', '🐎', '🐏',
    '🐐', '🐑', '🐒', '🐓', '🐔', '🐕', '🐖', '🐗', '🐘', '🐙', '🐚', '🐛', '🐜', '🐝', '🐞', '🐟',
    '🐠'
  ];

  static create(_network: NetworkType = NetworkType.Testnet): string {
    return this.base58();
  }

  static testnet(): string {
    return this.base58();
  }

  static mainnet(): string {
    return this.base58();
  }

  static base58(): string {
    // Generate a valid base58 address (32-64 characters based on types/address.ts)
    const length = 50; // Good middle ground between 32-64
    let result = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * this.BASE58_ALPHABET.length);
      result += this.BASE58_ALPHABET[randomIndex];
    }
    return result;
  }

  static hex(): string {
    // Generate a valid hex address (64 characters = 32 bytes based on types/address.ts)
    return randomBytes(32).toString('hex');
  }

  static hexWithViewKey(): string {
    // Generate a valid hex address with view key (140 characters = 70 bytes)
    return randomBytes(70).toString('hex');
  }

  static emoji(): string {
    // Generate exactly 33 emojis for a valid emoji address
    return Array.from({ length: 33 }, () => 
      this.TARI_EMOJIS[Math.floor(Math.random() * this.TARI_EMOJIS.length)]
    ).join('');
  }

  static invalid(): string {
    return 'invalid_address_format';
  }

  static tooShortBase58(): string {
    return 'shortaddr'; // Only 9 characters, invalid
  }

  static tooLongBase58(): string {
    return this.BASE58_ALPHABET.repeat(3); // Way too long
  }

  static invalidHex(): string {
    return randomBytes(16).toString('hex'); // Only 32 chars, should be 76 or 140
  }

  static invalidEmoji(): string {
    return '🌟🎯🚀'; // Only 3 emojis, should be 33
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
