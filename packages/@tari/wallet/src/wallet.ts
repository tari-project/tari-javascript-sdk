import {
  AddressHandle,
  Network,
  TransactionStatus,
  WalletHandle,
  ffi,
  initialize as initCore,
} from '@tari-project/core';
import { EventEmitter } from 'eventemitter3';
import pRetry from 'p-retry';
import {
  Balance,
  ConnectionStatus,
  ScanProgress,
  Transaction,
  WalletConfig,
  WalletEvent,
  WalletEventMap,
} from './types';

export class TariWallet extends EventEmitter<WalletEventMap> {
  private handle?: WalletHandle;
  private addressHandle?: AddressHandle;
  private config: WalletConfig & {
    seedWords: string;
    passphrase: string;
    dbPath: string;
    dbName: string;
  };
  private connectionStatus: ConnectionStatus = { connected: false };
  private closed = false;
  private balancePoller?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(config: WalletConfig) {
    super();
    // Ensure core is initialized
    initCore();

    // Set defaults
    this.config = {
      network: config.network,
      seedWords: config.seedWords || this.generateSeedWords(),
      passphrase: config.passphrase || '',
      dbPath: config.dbPath || './tari-wallet-db',
      dbName: config.dbName || 'wallet',
      baseNode: config.baseNode,
    };
  }

  /**
   * Initialize wallet and connect to base node
   */
  async connect(): Promise<void> {
    if (this.handle) {
      throw new Error('Wallet already connected');
    }

    try {
      this.handle = await pRetry(
        () => {
          return ffi.createWallet({
            seedWords: this.config.seedWords,
            network: this.config.network,
            dbPath: this.config.dbPath,
            dbName: this.config.dbName,
            passphrase: this.config.passphrase,
          });
        },
        {
          retries: 3,
          onFailedAttempt: (error) => {
            console.warn(`Wallet creation attempt ${error.attemptNumber} failed:`, error.message);
          },
        }
      );

      // Get wallet address
      const address = ffi.getAddress(this.handle);
      this.addressHandle = address.handle;

      // Connect to base node if configured
      if (this.config.baseNode) {
        await this.connectToBaseNode(this.config.baseNode.address, this.config.baseNode.publicKey);
      }

      // Start monitoring
      this.startMonitoring();

      // Update status
      this.connectionStatus = {
        connected: true,
        baseNode: this.config.baseNode?.address,
        lastSeen: new Date(),
      };

      this.emit(WalletEvent.Connected, this.connectionStatus);
    } catch (error) {
      this.cleanup();
      throw new Error(`Failed to connect wallet: ${(error as Error).message}`);
    }
  }

  /**
   * Connect to a base node
   */
  private async connectToBaseNode(address: string, publicKey: string): Promise<void> {
    // In real implementation, this would call FFI setBaseNodePeer
    console.log(`Connecting to base node: ${address}`);

    // Mock connection delay
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  /**
   * Get wallet's receive address
   */
  getReceiveAddress(): string {
    this.ensureConnected();

    const address = ffi.getAddress(this.handle!);
    const emojiId = address.emojiId;

    // Clean up temporary handle
    if (address.handle !== this.addressHandle) {
      ffi.destroyAddress(address.handle);
    }

    return emojiId;
  }

  /**
   * Get current balance
   */
  async getBalance(): Promise<Balance> {
    this.ensureConnected();

    const balance = ffi.getBalance(this.handle!);

    // Emit balance update event
    this.emit(WalletEvent.BalanceUpdated, balance);

    return balance;
  }

  /**
   * Send a transaction
   */
  async sendTransaction(params: {
    destination: string;
    amount: bigint;
    feePerGram?: bigint;
    message?: string;
  }): Promise<Transaction> {
    console.log('Sending transaction with params:', params);
    this.ensureConnected();

    const { destination, amount, feePerGram = 5n, message = '' } = params;

    // Validate inputs
    if (!destination) {
      throw new Error('Destination address required');
    }

    if (amount <= 0n) {
      throw new Error('Amount must be greater than 0');
    }

    // Check balance
    const balance = await this.getBalance();
    console.log('check balance:', balance);

    if (balance.available < amount + feePerGram * 1000n) {
      throw new Error('Insufficient balance');
    }

    // console.log('check balance:', balance);
    // Send transaction
    const txId = await ffi.sendTransaction(this.handle!, destination, amount, feePerGram, message);

    // Create transaction object
    const transaction: Transaction = {
      id: txId,
      amount,
      fee: feePerGram * 1000n, // Estimate
      destination,
      status: TransactionStatus.Broadcast,
      message,
      timestamp: new Date(),
      confirmations: 0,
      isOutbound: true,
    };

    // Emit event
    this.emit(WalletEvent.TransactionSent, transaction);

    return transaction;
  }

  /**
   * Monitor a transaction for confirmations
   */
  watchTransaction(txId: string, callback: (tx: Transaction) => void): () => void {
    const interval = setInterval(async () => {
      try {
        // In real implementation, would check transaction status via FFI
        const mockTx: Transaction = {
          id: txId,
          amount: 1000000n,
          fee: 5000n,
          destination: 'mock',
          status: TransactionStatus.Confirmed,
          message: '',
          timestamp: new Date(),
          confirmations: Math.floor(Math.random() * 10),
          isOutbound: true,
        };

        callback(mockTx);

        if (mockTx.confirmations >= 3) {
          clearInterval(interval);
          this.emit(WalletEvent.TransactionConfirmed, mockTx);
        }
      } catch (error) {
        console.error('Error watching transaction:', error);
      }
    }, 30000); // Check every 30 seconds

    // Return cleanup function
    return () => clearInterval(interval);
  }

  /**
   * Scan for UTXOs
   */
  async scanForUtxos(onProgress?: (progress: ScanProgress) => void): Promise<void> {
    this.ensureConnected();

    // Mock scanning process
    const total = 100;
    for (let i = 0; i <= total; i += 10) {
      const progress = {
        current: i,
        total,
        percentage: (i / total) * 100,
      };

      if (onProgress) {
        onProgress(progress);
      }

      this.emit(WalletEvent.ScanProgress, progress);

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Update balance after scan
    await this.getBalance();
  }

  /**
   * Get seed words
   */
  getSeedWords(): string {
    this.ensureConnected();
    return ffi.getSeedWords(this.handle!);
  }

  /**
   * Close wallet and cleanup resources
   */
  async close(): Promise<void> {
    if (this.closed) return;

    this.closed = true;
    this.stopMonitoring();
    this.cleanup();

    this.connectionStatus = { connected: false };
    this.emit(WalletEvent.Disconnected, { reason: 'User requested' });
  }

  /**
   * Start monitoring tasks
   */
  private startMonitoring(): void {
    // Poll balance every minute
    this.balancePoller = setInterval(async () => {
      try {
        await this.getBalance();
      } catch (error) {
        console.error('Balance polling error:', error);
      }
    }, 60000);
  }

  /**
   * Stop monitoring tasks
   */
  private stopMonitoring(): void {
    if (this.balancePoller) {
      clearInterval(this.balancePoller);
      this.balancePoller = undefined;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.addressHandle) {
      ffi.destroyAddress(this.addressHandle);
      this.addressHandle = undefined;
    }

    if (this.handle) {
      ffi.destroyWallet(this.handle);
      this.handle = undefined;
    }
  }

  /**
   * Ensure wallet is connected
   */
  private ensureConnected(): void {
    if (!this.handle || this.closed) {
      throw new Error('Wallet not connected');
    }
  }

  /**
   * Generate seed words (mock)
   */
  private generateSeedWords(): string {
    // In real implementation, would use BIP39
    const words = [];
    for (let i = 0; i < 24; i++) {
      words.push(`word${i + 1}`);
    }
    return words.join(' ');
  }

  /**
   * Create wallet with builder pattern
   */
  static builder() {
    return new WalletBuilder();
  }
}

/**
 * Wallet builder for fluent configuration
 */
export class WalletBuilder {
  private config: Partial<WalletConfig> = {};

  network(network: Network): this {
    this.config.network = network;
    return this;
  }

  seedWords(words: string): this {
    this.config.seedWords = words;
    return this;
  }

  passphrase(passphrase: string): this {
    this.config.passphrase = passphrase;
    return this;
  }

  dataDirectory(path: string): this {
    this.config.dbPath = path;
    return this;
  }

  baseNode(address: string, publicKey: string): this {
    this.config.baseNode = { address, publicKey };
    return this;
  }

  build(): TariWallet {
    if (!this.config.network) {
      throw new Error('Network is required');
    }

    return new TariWallet(this.config as WalletConfig);
  }
}
