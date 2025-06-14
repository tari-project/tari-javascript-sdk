/**
 * Test data builders using the builder pattern for complex test scenarios
 */

import {
  WalletConfig,
  Balance,
  Transaction,
  PendingTransaction,
  TransactionStatus,
  NetworkType,
} from './factories';
import { randomBytes } from 'crypto';

/**
 * Builder for creating complex wallet configurations
 */
export class WalletConfigBuilder {
  private config: Partial<WalletConfig> = {};

  static create(): WalletConfigBuilder {
    return new WalletConfigBuilder();
  }

  network(network: NetworkType): this {
    this.config.network = network;
    return this;
  }

  testnet(): this {
    return this.network(NetworkType.Testnet);
  }

  mainnet(): this {
    return this.network(NetworkType.Mainnet);
  }

  storagePath(path: string): this {
    this.config.storagePath = path;
    return this;
  }

  temporaryStorage(): this {
    return this.storagePath(`/tmp/test-wallet-${randomBytes(8).toString('hex')}`);
  }

  logPath(path: string): this {
    this.config.logPath = path;
    return this;
  }

  logLevel(level: number): this {
    this.config.logLevel = level;
    return this;
  }

  debug(): this {
    return this.logLevel(3); // Debug level
  }

  quiet(): this {
    return this.logLevel(0); // Error level
  }

  withPassphrase(passphrase: string): this {
    this.config.passphrase = passphrase;
    return this;
  }

  withSeedWords(seedWords: string[]): this {
    this.config.seedWords = seedWords;
    return this;
  }

  withRecovery(seedWords: string[], passphrase?: string): this {
    this.config.seedWords = seedWords;
    if (passphrase) {
      this.config.passphrase = passphrase;
    }
    return this;
  }

  build(): WalletConfig {
    // Set defaults
    const defaults: WalletConfig = {
      network: NetworkType.Testnet,
      storagePath: `/tmp/test-wallet-${randomBytes(8).toString('hex')}`,
      logLevel: 2, // Info level
    };

    return { ...defaults, ...this.config };
  }
}

/**
 * Builder for creating complex balance scenarios
 */
export class BalanceBuilder {
  private balance: Partial<Balance> = {};

  static create(): BalanceBuilder {
    return new BalanceBuilder();
  }

  available(amount: bigint): this {
    this.balance.available = amount;
    return this;
  }

  pendingIncoming(amount: bigint): this {
    this.balance.pendingIncoming = amount;
    return this;
  }

  pendingOutgoing(amount: bigint): this {
    this.balance.pendingOutgoing = amount;
    return this;
  }

  timelocked(amount: bigint): this {
    this.balance.timelocked = amount;
    return this;
  }

  empty(): this {
    this.balance.available = 0n;
    this.balance.pendingIncoming = 0n;
    this.balance.pendingOutgoing = 0n;
    this.balance.timelocked = 0n;
    return this;
  }

  rich(): this {
    this.balance.available = 100000000000n; // 100 Tari
    this.balance.pendingIncoming = 5000000000n; // 5 Tari
    this.balance.pendingOutgoing = 2000000000n; // 2 Tari
    this.balance.timelocked = 1000000000n; // 1 Tari
    return this;
  }

  justEnough(amount: bigint, fee: bigint = 5000n): this {
    this.balance.available = amount + fee;
    this.balance.pendingIncoming = 0n;
    this.balance.pendingOutgoing = 0n;
    this.balance.timelocked = 0n;
    return this;
  }

  insufficient(amount: bigint, fee: bigint = 5000n): this {
    this.balance.available = amount + fee - 1n;
    this.balance.pendingIncoming = 0n;
    this.balance.pendingOutgoing = 0n;
    this.balance.timelocked = 0n;
    return this;
  }

  withPendingActivity(): this {
    this.balance.pendingIncoming = 1000000000n; // 1 Tari
    this.balance.pendingOutgoing = 500000000n; // 0.5 Tari
    return this;
  }

  build(): Balance {
    const defaults: Balance = {
      available: 1000000000n, // 1 Tari
      pendingIncoming: 0n,
      pendingOutgoing: 0n,
      timelocked: 0n,
    };

    return { ...defaults, ...this.balance };
  }
}

/**
 * Builder for creating complex transaction scenarios
 */
export class TransactionBuilder {
  private transaction: Partial<Transaction> = {};

  static create(): TransactionBuilder {
    return new TransactionBuilder();
  }

  id(id: string): this {
    this.transaction.id = id;
    return this;
  }

  randomId(): this {
    return this.id(randomBytes(16).toString('hex'));
  }

  amount(amount: bigint): this {
    this.transaction.amount = amount;
    return this;
  }

  microTari(amount: number): this {
    return this.amount(BigInt(amount));
  }

  tari(amount: number): this {
    return this.amount(BigInt(amount * 1000000));
  }

  fee(fee: bigint): this {
    this.transaction.fee = fee;
    return this;
  }

  standardFee(): this {
    return this.fee(5000n);
  }

  highFee(): this {
    return this.fee(25000n);
  }

  status(status: TransactionStatus): this {
    this.transaction.status = status;
    return this;
  }

  pending(): this {
    this.transaction.status = TransactionStatus.Pending;
    this.transaction.confirmations = 0;
    return this;
  }

  confirmed(): this {
    this.transaction.status = TransactionStatus.MinedConfirmed;
    this.transaction.confirmations = 5;
    return this;
  }

  cancelled(): this {
    this.transaction.status = TransactionStatus.Cancelled;
    return this;
  }

  message(message: string): this {
    this.transaction.message = message;
    return this;
  }

  timestamp(timestamp: Date): this {
    this.transaction.timestamp = timestamp;
    return this;
  }

  recent(): this {
    return this.timestamp(new Date());
  }

  old(): this {
    return this.timestamp(new Date(Date.now() - 24 * 60 * 60 * 1000)); // 24 hours ago
  }

  ancient(): this {
    return this.timestamp(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)); // 30 days ago
  }

  inbound(): this {
    this.transaction.isInbound = true;
    return this;
  }

  outbound(): this {
    this.transaction.isInbound = false;
    return this;
  }

  address(address: string): this {
    this.transaction.address = address;
    return this;
  }

  testnetAddress(): this {
    const hash = randomBytes(32).toString('hex');
    return this.address(`tari://testnet/${hash}`);
  }

  confirmations(count: number): this {
    this.transaction.confirmations = count;
    return this;
  }

  // Scenario builders
  successfulPayment(): this {
    return this
      .randomId()
      .outbound()
      .tari(1)
      .standardFee()
      .confirmed()
      .recent()
      .testnetAddress()
      .confirmations(5)
      .message('Payment for services');
  }

  failedPayment(): this {
    return this
      .randomId()
      .outbound()
      .tari(1)
      .standardFee()
      .cancelled()
      .recent()
      .testnetAddress()
      .confirmations(0)
      .message('Failed payment');
  }

  receivedPayment(): this {
    return this
      .randomId()
      .inbound()
      .tari(0.5)
      .fee(0n) // Receiver doesn't pay fee
      .confirmed()
      .recent()
      .testnetAddress()
      .confirmations(3)
      .message('Payment received');
  }

  largePendingTransaction(): this {
    return this
      .randomId()
      .outbound()
      .tari(100)
      .highFee()
      .pending()
      .recent()
      .testnetAddress()
      .confirmations(0)
      .message('Large pending transfer');
  }

  build(): Transaction {
    const defaults: Transaction = {
      id: randomBytes(16).toString('hex'),
      amount: 1000000n, // 0.001 Tari
      fee: 5000n,
      status: TransactionStatus.Pending,
      message: 'Test transaction',
      timestamp: new Date(),
      isInbound: false,
      address: `tari://testnet/${randomBytes(32).toString('hex')}`,
      confirmations: 0,
    };

    return { ...defaults, ...this.transaction };
  }
}

/**
 * Builder for creating complex pending transaction scenarios
 */
export class PendingTransactionBuilder {
  private transaction: Partial<PendingTransaction> = {};

  static create(): PendingTransactionBuilder {
    return new PendingTransactionBuilder();
  }

  id(id: string): this {
    this.transaction.id = id;
    return this;
  }

  randomId(): this {
    return this.id(randomBytes(16).toString('hex'));
  }

  amount(amount: bigint): this {
    this.transaction.amount = amount;
    return this;
  }

  tari(amount: number): this {
    return this.amount(BigInt(amount * 1000000));
  }

  fee(fee: bigint): this {
    this.transaction.fee = fee;
    return this;
  }

  standardFee(): this {
    return this.fee(5000n);
  }

  message(message: string): this {
    this.transaction.message = message;
    return this;
  }

  timestamp(timestamp: Date): this {
    this.transaction.timestamp = timestamp;
    return this;
  }

  recent(): this {
    return this.timestamp(new Date());
  }

  recipientAddress(address: string): this {
    this.transaction.recipientAddress = address;
    return this;
  }

  testnetRecipient(): this {
    const hash = randomBytes(32).toString('hex');
    return this.recipientAddress(`tari://testnet/${hash}`);
  }

  status(status: TransactionStatus): this {
    this.transaction.status = status;
    return this;
  }

  pending(): this {
    return this.status(TransactionStatus.Pending);
  }

  broadcast(): this {
    return this.status(TransactionStatus.Broadcast);
  }

  // Scenario builders
  standardPendingPayment(): this {
    return this
      .randomId()
      .tari(1)
      .standardFee()
      .pending()
      .recent()
      .testnetRecipient()
      .message('Standard payment');
  }

  broadcastPayment(): this {
    return this
      .randomId()
      .tari(0.5)
      .standardFee()
      .broadcast()
      .recent()
      .testnetRecipient()
      .message('Broadcast payment');
  }

  largePendingPayment(): this {
    return this
      .randomId()
      .tari(50)
      .fee(25000n)
      .pending()
      .recent()
      .testnetRecipient()
      .message('Large pending payment');
  }

  build(): PendingTransaction {
    const defaults: PendingTransaction = {
      id: randomBytes(16).toString('hex'),
      amount: 1000000n, // 0.001 Tari
      fee: 5000n,
      message: 'Test pending transaction',
      timestamp: new Date(),
      recipientAddress: `tari://testnet/${randomBytes(32).toString('hex')}`,
      status: TransactionStatus.Pending,
    };

    return { ...defaults, ...this.transaction };
  }
}

/**
 * Builder for creating wallet test scenarios
 */
export class WalletScenarioBuilder {
  private scenario: {
    config?: WalletConfig;
    balance?: Balance;
    transactions?: Transaction[];
    pendingTransactions?: PendingTransaction[];
  } = {};

  static create(): WalletScenarioBuilder {
    return new WalletScenarioBuilder();
  }

  config(config: WalletConfig): this {
    this.scenario.config = config;
    return this;
  }

  balance(balance: Balance): this {
    this.scenario.balance = balance;
    return this;
  }

  transactions(transactions: Transaction[]): this {
    this.scenario.transactions = transactions;
    return this;
  }

  pendingTransactions(transactions: PendingTransaction[]): this {
    this.scenario.pendingTransactions = transactions;
    return this;
  }

  // Pre-built scenarios
  newWallet(): this {
    this.scenario.config = WalletConfigBuilder.create().testnet().temporaryStorage().build();
    this.scenario.balance = BalanceBuilder.create().empty().build();
    this.scenario.transactions = [];
    this.scenario.pendingTransactions = [];
    return this;
  }

  activeWallet(): this {
    this.scenario.config = WalletConfigBuilder.create().testnet().temporaryStorage().build();
    this.scenario.balance = BalanceBuilder.create().rich().withPendingActivity().build();
    
    this.scenario.transactions = [
      TransactionBuilder.create().successfulPayment().build(),
      TransactionBuilder.create().receivedPayment().build(),
      TransactionBuilder.create().old().confirmed().tari(2).build(),
    ];
    
    this.scenario.pendingTransactions = [
      PendingTransactionBuilder.create().standardPendingPayment().build(),
      PendingTransactionBuilder.create().broadcastPayment().build(),
    ];
    
    return this;
  }

  recoveredWallet(seedWords: string[]): this {
    this.scenario.config = WalletConfigBuilder.create()
      .testnet()
      .temporaryStorage()
      .withSeedWords(seedWords)
      .build();
    
    this.scenario.balance = BalanceBuilder.create().available(5000000000n).build();
    
    this.scenario.transactions = [
      TransactionBuilder.create().ancient().confirmed().tari(10).build(),
      TransactionBuilder.create().old().confirmed().tari(3).build(),
    ];
    
    this.scenario.pendingTransactions = [];
    
    return this;
  }

  problematicWallet(): this {
    this.scenario.config = WalletConfigBuilder.create().testnet().temporaryStorage().build();
    this.scenario.balance = BalanceBuilder.create().insufficient(1000000n).build();
    
    this.scenario.transactions = [
      TransactionBuilder.create().failedPayment().build(),
      TransactionBuilder.create().cancelled().tari(5).build(),
    ];
    
    this.scenario.pendingTransactions = [
      PendingTransactionBuilder.create().largePendingPayment().build(),
    ];
    
    return this;
  }

  build() {
    return this.scenario;
  }
}
