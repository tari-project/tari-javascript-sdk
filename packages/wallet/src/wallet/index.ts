/**
 * @fileoverview Main wallet implementation and factory methods
 * 
 * This module provides the primary TariWallet class that applications
 * will use to interact with the Tari network. It includes wallet creation,
 * transaction management, and event handling.
 */

import { EventEmitter } from 'node:events';
import { TariError, ErrorCode } from '@tari-project/tarijs-core';
import type { 
  WalletConfig, 
  TransactionInfo, 
  SendTransactionOptions,
  WalletEventHandlers,
  Contact,
  PeerInfo,
} from '../types/index';
import { TariAddress, WalletBalance, TransactionId } from '../models/index';

/**
 * Main Tari wallet class providing high-level wallet operations
 * 
 * This class will be the primary interface for applications to interact
 * with Tari wallet functionality. Currently contains placeholder implementations
 * that will be replaced with real FFI calls in later phases.
 */
export class TariWallet {
  private readonly config: WalletConfig;
  private readonly eventEmitter: EventEmitter;
  private destroyed = false;
  private readonly instanceId: string;

  private constructor(config: WalletConfig) {
    this.config = { ...config };
    this.eventEmitter = new EventEmitter();
    this.instanceId = `wallet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a new Tari wallet instance
   */
  static async create(config: WalletConfig): Promise<TariWallet> {
    this.validateConfig(config);
    
    // Placeholder implementation - will be replaced with FFI
    const wallet = new TariWallet(config);
    
    // In real implementation, this would:
    // 1. Initialize FFI wallet handle
    // 2. Set up database connection
    // 3. Configure logging
    // 4. Start background services
    
    return wallet;
  }

  /**
   * Restore wallet from seed words
   */
  static async restore(
    seedWords: string[], 
    config: WalletConfig
  ): Promise<TariWallet> {
    if (!seedWords || seedWords.length !== 24) {
      throw new TariError(
        ErrorCode.InvalidConfig,
        'Seed words must be exactly 24 words'
      );
    }

    const configWithSeed = { ...config, seedWords };
    return this.create(configWithSeed);
  }

  /**
   * Get wallet's primary address
   */
  async getAddress(): Promise<TariAddress> {
    this.ensureNotDestroyed();
    
    // Placeholder implementation - will be replaced with FFI
    throw new TariError(
      ErrorCode.NotImplemented,
      'Address retrieval not yet implemented'
    );
  }

  /**
   * Get current wallet balance
   */
  async getBalance(): Promise<WalletBalance> {
    this.ensureNotDestroyed();
    
    // Placeholder implementation - will be replaced with FFI
    throw new TariError(
      ErrorCode.NotImplemented,
      'Balance retrieval not yet implemented'
    );
  }

  /**
   * Send a transaction to another address
   */
  async sendTransaction(
    recipient: string | TariAddress,
    amount: bigint,
    _options: SendTransactionOptions = {}
  ): Promise<TransactionId> {
    this.ensureNotDestroyed();
    
    if (amount <= 0n) {
      throw new TariError(
        ErrorCode.InvalidConfig,
        'Transaction amount must be positive'
      );
    }

    // Convert string addresses to TariAddress objects
    const _recipientAddress = typeof recipient === 'string' 
      ? TariAddress.fromBase58(recipient)
      : recipient;

    // Placeholder implementation - will be replaced with FFI
    throw new TariError(
      ErrorCode.NotImplemented,
      'Transaction sending not yet implemented'
    );
  }

  /**
   * Get transaction history
   */
  async getTransactions(): Promise<TransactionInfo[]> {
    this.ensureNotDestroyed();
    
    // Placeholder implementation - will be replaced with FFI
    throw new TariError(
      ErrorCode.NotImplemented,
      'Transaction history not yet implemented'
    );
  }

  /**
   * Cancel a pending transaction
   */
  async cancelTransaction(_transactionId: TransactionId): Promise<void> {
    this.ensureNotDestroyed();
    
    // Placeholder implementation - will be replaced with FFI
    throw new TariError(
      ErrorCode.NotImplemented,
      'Transaction cancellation not yet implemented'
    );
  }

  /**
   * Add a contact to the wallet
   */
  async addContact(_contact: Contact): Promise<void> {
    this.ensureNotDestroyed();
    
    // Placeholder implementation - will be replaced with FFI
    throw new TariError(
      ErrorCode.NotImplemented,
      'Contact management not yet implemented'
    );
  }

  /**
   * Get all contacts
   */
  async getContacts(): Promise<Contact[]> {
    this.ensureNotDestroyed();
    
    // Placeholder implementation - will be replaced with FFI
    throw new TariError(
      ErrorCode.NotImplemented,
      'Contact retrieval not yet implemented'
    );
  }

  /**
   * Set the base node for network communication
   */
  async setBaseNode(_peer: PeerInfo): Promise<void> {
    this.ensureNotDestroyed();
    
    // Placeholder implementation - will be replaced with FFI
    throw new TariError(
      ErrorCode.NotImplemented,
      'Base node configuration not yet implemented'
    );
  }

  /**
   * Sync wallet with the network
   */
  async sync(): Promise<void> {
    this.ensureNotDestroyed();
    
    // Placeholder implementation - will be replaced with FFI
    throw new TariError(
      ErrorCode.NotImplemented,
      'Network sync not yet implemented'
    );
  }

  /**
   * Get wallet seed words (requires passphrase if set)
   */
  async getSeedWords(_passphrase?: string): Promise<string[]> {
    this.ensureNotDestroyed();
    
    // Placeholder implementation - will be replaced with FFI
    throw new TariError(
      ErrorCode.NotImplemented,
      'Seed word retrieval not yet implemented'
    );
  }

  /**
   * Sign a message with wallet's private key
   */
  async signMessage(_message: string): Promise<string> {
    this.ensureNotDestroyed();
    
    // Placeholder implementation - will be replaced with FFI
    throw new TariError(
      ErrorCode.NotImplemented,
      'Message signing not yet implemented'
    );
  }

  /**
   * Register event handlers
   */
  on<K extends keyof WalletEventHandlers>(
    event: K,
    handler: WalletEventHandlers[K]
  ): void {
    if (handler) {
      this.eventEmitter.on(event, handler);
    }
  }

  /**
   * Unregister event handlers
   */
  off<K extends keyof WalletEventHandlers>(
    event: K,
    handler: WalletEventHandlers[K]
  ): void {
    if (handler) {
      this.eventEmitter.off(event, handler);
    }
  }

  /**
   * Get wallet configuration (without sensitive data)
   */
  getConfig(): Omit<WalletConfig, 'passphrase' | 'seedWords'> {
    const { passphrase: _passphrase, seedWords: _seedWords, ...safeConfig } = this.config;
    return safeConfig;
  }

  /**
   * Check if wallet is destroyed
   */
  get isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Get wallet instance identifier
   */
  get id(): string {
    return this.instanceId;
  }

  /**
   * Destroy wallet and clean up resources
   */
  async destroy(): Promise<void> {
    if (this.destroyed) return;

    this.destroyed = true;
    this.eventEmitter.removeAllListeners();
    
    // In real implementation, this would:
    // 1. Close database connections
    // 2. Stop background services
    // 3. Clean up FFI handles
    // 4. Clear sensitive data from memory
  }

  private static validateConfig(config: WalletConfig): void {
    if (!config.network) {
      throw new TariError(
        ErrorCode.InvalidConfig,
        'Network configuration is required'
      );
    }
    
    if (!config.storagePath) {
      throw new TariError(
        ErrorCode.InvalidConfig,
        'Storage path is required'
      );
    }

    if (config.numRollingLogFiles !== undefined && config.numRollingLogFiles < 1) {
      throw new TariError(
        ErrorCode.InvalidConfig,
        'Number of rolling log files must be at least 1'
      );
    }

    if (config.rollingLogFileSize !== undefined && config.rollingLogFileSize < 1) {
      throw new TariError(
        ErrorCode.InvalidConfig,
        'Rolling log file size must be at least 1 byte'
      );
    }
  }

  private ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new TariError(
        ErrorCode.ResourceDestroyed,
        'Wallet instance has been destroyed'
      );
    }
  }
}

// Main wallet class is already exported above
