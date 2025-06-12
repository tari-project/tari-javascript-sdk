/**
 * @fileoverview Core TariWallet class with proper FFI integration and lifecycle management
 * 
 * This is the main wallet class that applications will use to interact with
 * the Tari network. It provides a clean, type-safe interface over the FFI
 * bindings with comprehensive error handling and resource management.
 */

import { EventEmitter } from 'node:events';
import { 
  getFFIBindings,
  WalletError, 
  WalletErrorCode, 
  ErrorSeverity,
  type FFIWalletConfig
} from '@tari-project/tarijs-core';
import type { WalletHandle } from '@tari-project/tarijs-core';
import type { 
  WalletConfig, 
  TransactionInfo, 
  SendTransactionOptions,
  WalletEventHandlers,
  Contact,
  PeerInfo,
  Balance,
  BalanceInfo
} from './types/index.js';
import { TariAddress, WalletBalance, TransactionId } from './models/index.js';
import { 
  WalletState, 
  WalletStateManager
} from './wallet-state.js';
import { 
  WalletLifecycleManager, 
  type LifecycleHooks,
  createAsyncDisposableResource 
} from './lifecycle.js';
import {
  SeedManager,
  SecureBuffer,
  type SeedValidationResult
} from './seed/index.js';
import {
  BalanceService,
  type BalanceServiceConfig,
  type BalanceChangeListener
} from './balance/index.js';

/**
 * Main Tari wallet class providing high-level wallet operations
 * 
 * This class provides the primary interface for applications to interact
 * with Tari wallet functionality through properly integrated FFI calls.
 */
export class TariWallet implements AsyncDisposable {
  private readonly handle: WalletHandle;
  private readonly config: WalletConfig;
  private readonly eventEmitter: EventEmitter;
  private readonly stateManager: WalletStateManager;
  private readonly lifecycleManager: WalletLifecycleManager;
  private readonly balanceService: BalanceService;
  private readonly instanceId: string;

  /**
   * Private constructor - use WalletFactory.create() or WalletFactory.restore()
   */
  constructor(
    handle: WalletHandle, 
    config: WalletConfig, 
    hooks: LifecycleHooks = {},
    balanceConfig?: BalanceServiceConfig
  ) {
    this.instanceId = `wallet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.handle = handle;
    this.config = { ...config };
    this.eventEmitter = new EventEmitter();
    this.stateManager = new WalletStateManager(this.instanceId);
    this.lifecycleManager = new WalletLifecycleManager(this.instanceId, this.stateManager, hooks);
    this.balanceService = new BalanceService(handle, balanceConfig);

    // Initialize lifecycle
    this.initializeLifecycle();

    // Setup balance change forwarding
    this.setupBalanceEventForwarding();
  }

  // Core wallet operations

  /**
   * Get wallet's primary address
   */
  async getAddress(): Promise<TariAddress> {
    try {
      const bindings = getFFIBindings();
      const addressStr = await bindings.getAddress(this.handle);
      
      // Convert FFI address string to TariAddress object
      // TODO: Implement proper address parsing when address utilities are ready
      return new TariAddress({
        publicKey: addressStr,
        network: this.config.network,
        checksum: 0 // Will be calculated properly in address implementation
      });
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to retrieve wallet address',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error
        }
      );
    }
  }

  /**
   * Get wallet balance with caching support
   * 
   * @param force - Force refresh from FFI, bypassing cache
   * @returns Promise resolving to current wallet balance
   */
  async getBalance(force: boolean = false): Promise<Balance> {
    this.ensureNotDestroyed();
    return this.balanceService.getBalance(force);
  }

  /**
   * Get detailed balance information including time-locked funds
   * 
   * @param force - Force refresh from FFI, bypassing cache
   * @returns Promise resolving to detailed balance information
   */
  async getDetailedBalance(force: boolean = false): Promise<BalanceInfo> {
    this.ensureNotDestroyed();
    return this.balanceService.getDetailedBalance(force);
  }

  /**
   * Get available spendable balance
   * 
   * @returns Promise resolving to available balance in microTari
   */
  async getAvailableBalance(): Promise<bigint> {
    this.ensureNotDestroyed();
    return this.balanceService.getAvailableBalance();
  }

  /**
   * Get pending incoming balance
   * 
   * @returns Promise resolving to pending incoming balance in microTari
   */
  async getPendingIncomingBalance(): Promise<bigint> {
    this.ensureNotDestroyed();
    return this.balanceService.getPendingIncomingBalance();
  }

  /**
   * Get pending outgoing balance
   * 
   * @returns Promise resolving to pending outgoing balance in microTari
   */
  async getPendingOutgoingBalance(): Promise<bigint> {
    this.ensureNotDestroyed();
    return this.balanceService.getPendingOutgoingBalance();
  }

  /**
   * Check if wallet has sufficient balance for a transaction
   * 
   * @param amount - Amount to send in microTari
   * @param fee - Transaction fee in microTari (optional)
   * @returns Promise resolving to true if sufficient balance exists
   */
  async hasSufficientBalance(amount: bigint, fee: bigint = 0n): Promise<boolean> {
    this.ensureNotDestroyed();
    return this.balanceService.hasSufficientBalance(amount, fee);
  }

  /**
   * Get maximum spendable amount (available balance minus estimated fee)
   * 
   * @param estimatedFee - Estimated transaction fee in microTari
   * @returns Promise resolving to maximum spendable amount
   */
  async getMaxSpendableAmount(estimatedFee: bigint = 1000000n): Promise<bigint> {
    this.ensureNotDestroyed();
    return this.balanceService.getMaxSpendableAmount(estimatedFee);
  }

  /**
   * Add a balance change listener
   * 
   * @param listener - Function to call when balance changes
   */
  addBalanceChangeListener(listener: BalanceChangeListener): void {
    this.balanceService.addChangeListener(listener);
  }

  /**
   * Remove a balance change listener
   * 
   * @param listener - Previously added listener function
   */
  removeBalanceChangeListener(listener: BalanceChangeListener): void {
    this.balanceService.removeChangeListener(listener);
  }

  /**
   * Clear the balance cache to force fresh data on next query
   */
  clearBalanceCache(): void {
    this.balanceService.clearCache();
  }

  /**
   * Get balance cache statistics
   * 
   * @returns Cache performance statistics
   */
  getBalanceCacheStats() {
    return this.balanceService.getCacheStats();
  }

  /**
   * Send a transaction to another address
   */
  async sendTransaction(
    recipient: string | TariAddress,
    amount: bigint,
    options: SendTransactionOptions = {}
  ): Promise<TransactionId> {
    // Validate inputs
    if (amount <= 0n) {
      throw new WalletError(
        WalletErrorCode.InvalidAmount,
        'Transaction amount must be positive',
        {
          severity: ErrorSeverity.Error
        }
      );
    }

    try {
      // Convert recipient to address string
      const recipientAddress = typeof recipient === 'string' 
        ? recipient 
        : recipient.toString();

      const bindings = getFFIBindings();
      const txIdStr = await bindings.sendTransaction(
        this.handle,
        recipientAddress,
        amount.toString(),
        {
          feePerGram: options.feePerGram?.toString(),
          message: options.message || '',
          isOneSided: options.isOneSided || false
        }
      );

      return new TransactionId(txIdStr);
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.TransactionFailed,
        'Failed to send transaction',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error
        }
      );
    }
  }

  /**
   * Get wallet seed words with BIP39 validation and secure handling
   * 
   * @param passphrase - Optional passphrase for encrypted wallets
   * @returns Promise resolving to array of seed words
   */
  async getSeedWords(passphrase?: string): Promise<string[]> {
    this.ensureNotDestroyed();

    const secureBuffer = await this.getSeedWordsSecure(passphrase);
    try {
      return secureBuffer.toWords();
    } finally {
      // Always clean up the secure buffer
      secureBuffer.destroy();
    }
  }

  /**
   * Get wallet seed words in a secure buffer for advanced handling
   * 
   * @param passphrase - Optional passphrase for encrypted wallets
   * @returns Promise resolving to SecureBuffer containing seed words
   */
  async getSeedWordsSecure(passphrase?: string): Promise<SecureBuffer> {
    this.ensureNotDestroyed();

    try {
      const bindings = getFFIBindings();
      
      // Get raw seed words from FFI
      const seedWords = await bindings.getSeedWords(this.handle);
      
      // Validate the seed words using our BIP39 system
      const validationResult = await SeedManager.validateSeedPhrase(seedWords);
      if (!validationResult.isValid) {
        throw new WalletError(
          WalletErrorCode.CryptoError,
          `Retrieved seed words failed validation: ${validationResult.errors.join(', ')}`,
          { severity: ErrorSeverity.Error }
        );
      }

      // Create secure buffer with normalized words
      return SeedManager.createSecureBuffer(validationResult.normalizedWords!);
    } catch (error) {
      if (error instanceof WalletError) {
        throw error;
      }
      
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to retrieve wallet seed words',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error
        }
      );
    }
  }

  /**
   * Validate wallet seed words against BIP39 standards
   * 
   * @param words - Seed words to validate
   * @returns Promise resolving to validation result
   */
  static async validateSeedWords(words: string[]): Promise<SeedValidationResult> {
    return SeedManager.validateSeedPhrase(words);
  }

  /**
   * Generate a new BIP39 seed phrase
   * 
   * @param wordCount - Number of words (12, 15, 18, 21, or 24)
   * @returns Promise resolving to new seed phrase
   */
  static async generateSeedPhrase(wordCount: 12 | 15 | 18 | 21 | 24 = 24): Promise<string[]> {
    const seedPhrase = await SeedManager.generateSeedPhrase({ wordCount });
    return Array.from(seedPhrase);
  }

  /**
   * Sign a message with wallet's private key
   */
  async signMessage(message: string): Promise<string> {
    if (!message || typeof message !== 'string') {
      throw new WalletError(
        WalletErrorCode.InvalidFormat,
        'Message must be a non-empty string',
        { severity: ErrorSeverity.Error }
      );
    }

    try {
      // TODO: Implement when message signing FFI is available
      throw new WalletError(
        WalletErrorCode.NotImplemented,
        'Message signing not yet implemented'
      );
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.SigningFailed,
        'Failed to sign message',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          
        }
      );
    }
  }

  // Transaction and history operations

  /**
   * Get transaction history
   */
  async getTransactions(): Promise<TransactionInfo[]> {
    try {
      // TODO: Implement when transaction history FFI is available
      throw new WalletError(
        WalletErrorCode.NotImplemented,
        'Transaction history not yet implemented'
      );
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.TransactionNotFound,
        'Failed to retrieve transaction history',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          
        }
      );
    }
  }

  /**
   * Cancel a pending transaction
   */
  async cancelTransaction(_transactionId: TransactionId): Promise<void> {
    try {
      // TODO: Implement when transaction cancellation FFI is available
      throw new WalletError(
        WalletErrorCode.NotImplemented,
        'Transaction cancellation not yet implemented'
      );
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.TransactionFailed,
        'Failed to cancel transaction',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          
        }
      );
    }
  }

  // Contact management

  /**
   * Add a contact to the wallet
   */
  async addContact(_contact: Contact): Promise<void> {
    try {
      // TODO: Implement when contact management FFI is available
      throw new WalletError(
        WalletErrorCode.NotImplemented,
        'Contact management not yet implemented'
      );
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InvalidConfig,
        'Failed to add contact',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          
        }
      );
    }
  }

  /**
   * Get all contacts
   */
  async getContacts(): Promise<Contact[]> {
    try {
      // TODO: Implement when contact management FFI is available
      throw new WalletError(
        WalletErrorCode.NotImplemented,
        'Contact retrieval not yet implemented'
      );
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InvalidConfig,
        'Failed to retrieve contacts',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          
        }
      );
    }
  }

  // Network operations

  /**
   * Set the base node for network communication
   */
  async setBaseNode(peer: PeerInfo): Promise<void> {
    try {
      const bindings = getFFIBindings();
      await bindings.setBaseNode(this.handle, {
        publicKey: peer.publicKey,
        address: peer.address
      });
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.ConnectionFailed,
        'Failed to set base node',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,

        }
      );
    }
  }

  /**
   * Sync wallet with the network
   */
  async sync(): Promise<void> {
    try {
      // TODO: Implement when wallet sync FFI is available
      throw new WalletError(
        WalletErrorCode.NotImplemented,
        'Network sync not yet implemented'
      );
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.SyncFailed,
        'Failed to sync wallet with network',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          
        }
      );
    }
  }

  // Event handling

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

  // Wallet information and state

  /**
   * Get wallet configuration (without sensitive data)
   */
  getConfig(): Omit<WalletConfig, 'passphrase' | 'seedWords'> {
    const { passphrase: _passphrase, seedWords: _seedWords, ...safeConfig } = this.config;
    return safeConfig;
  }

  /**
   * Get wallet state
   */
  get state(): WalletState {
    return this.stateManager.state;
  }

  /**
   * Check if wallet is destroyed
   */
  get isDestroyed(): boolean {
    return this.stateManager.isDestroyed;
  }

  /**
   * Check if wallet is usable
   */
  get isUsable(): boolean {
    return this.stateManager.isUsable;
  }

  /**
   * Get wallet instance identifier
   */
  get id(): string {
    return this.instanceId;
  }

  /**
   * Ensure wallet is not destroyed before operations
   */
  private ensureNotDestroyed(): void {
    if (this.isDestroyed) {
      throw new WalletError(
        WalletErrorCode.UseAfterFree,
        'Cannot use wallet after it has been destroyed',
        { severity: ErrorSeverity.Error }
      );
    }
  }

  /**
   * Get wallet statistics
   */
  getStats() {
    return {
      ...this.stateManager.getStats(),
      lifecycle: this.lifecycleManager.getStats()
    };
  }

  // Resource management and cleanup

  /**
   * Destroy wallet and clean up resources
   */
  async destroy(): Promise<void> {
    if (this.stateManager.isDestroyed) {
      return; // Already destroyed
    }

    await this.lifecycleManager.destroy();
  }

  /**
   * TypeScript 5.2+ async disposal support
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.destroy();
  }

  // Private implementation

  private async initializeLifecycle(): Promise<void> {
    // Add FFI handle cleanup
    this.lifecycleManager.addCleanup(async () => {
      try {
        const bindings = getFFIBindings();
        await bindings.destroyWallet(this.handle);
      } catch (error) {
        console.warn(`Failed to destroy FFI wallet handle for ${this.instanceId}:`, error);
      }
    });

    // Add event emitter cleanup
    this.lifecycleManager.addCleanup(async () => {
      this.eventEmitter.removeAllListeners();
    });

    // Add balance service cleanup
    this.lifecycleManager.addCleanup(async () => {
      this.balanceService.dispose();
    });

    // Initialize the lifecycle
    await this.lifecycleManager.initialize(this.handle);
  }

  /**
   * Setup balance event forwarding to wallet event emitter
   */
  private setupBalanceEventForwarding(): void {
    this.balanceService.addChangeListener((event) => {
      // Forward balance change events through the wallet event emitter
      this.eventEmitter.emit('balanceUpdated', event.currentBalance);
      this.eventEmitter.emit('balanceChanged', event);
    });
  }
}

// Create async disposable version
export function createDisposableWallet(
  handle: WalletHandle, 
  config: WalletConfig, 
  hooks?: LifecycleHooks
): TariWallet & AsyncDisposable {
  const wallet = new TariWallet(handle, config, hooks);
  return createAsyncDisposableResource(wallet, () => wallet.destroy());
}
