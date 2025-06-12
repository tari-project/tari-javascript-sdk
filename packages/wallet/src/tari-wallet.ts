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
  withErrorContext,
  withRetry,
  type WalletHandle
} from '@tari-project/tarijs-core';
import type { 
  WalletConfig, 
  TransactionInfo, 
  SendTransactionOptions,
  WalletEventHandlers,
  Contact,
  PeerInfo,
  Balance
} from './types/index.js';
import { TariAddress, WalletBalance, TransactionId } from './models/index.js';
import { 
  WalletState, 
  WalletStateManager, 
  requireUsableState,
  withStateTransition 
} from './wallet-state.js';
import { 
  WalletLifecycleManager, 
  type LifecycleHooks,
  createAsyncDisposableResource 
} from './lifecycle.js';

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
  private readonly instanceId: string;

  /**
   * Private constructor - use WalletFactory.create() or WalletFactory.restore()
   */
  constructor(handle: WalletHandle, config: WalletConfig, hooks: LifecycleHooks = {}) {
    this.instanceId = `wallet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.handle = handle;
    this.config = { ...config };
    this.eventEmitter = new EventEmitter();
    this.stateManager = new WalletStateManager(this.instanceId);
    this.lifecycleManager = new WalletLifecycleManager(this.instanceId, this.stateManager, hooks);

    // Initialize lifecycle
    this.initializeLifecycle();
  }

  // Core wallet operations

  /**
   * Get wallet's primary address
   */
  @requireUsableState
  @withStateTransition()
  @withErrorContext('get_address', 'wallet')
  @withRetry('wallet_get_address')
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
        WalletErrorCode.AddressRetrievalFailed,
        'Failed to retrieve wallet address',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          metadata: { walletId: this.instanceId }
        }
      );
    }
  }

  /**
   * Get current wallet balance
   */
  @requireUsableState
  @withStateTransition()
  @withErrorContext('get_balance', 'wallet')
  @withRetry('wallet_get_balance')
  async getBalance(): Promise<WalletBalance> {
    try {
      const bindings = getFFIBindings();
      const ffiBalance = await bindings.getBalance(this.handle);
      
      const balance: Balance = {
        available: BigInt(ffiBalance.available),
        pendingIncoming: BigInt(ffiBalance.pendingIncoming),
        pendingOutgoing: BigInt(ffiBalance.pendingOutgoing),
        timelocked: BigInt(ffiBalance.timelocked)
      };
      
      return new WalletBalance(balance);
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.BalanceRetrievalFailed,
        'Failed to retrieve wallet balance',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          metadata: { walletId: this.instanceId }
        }
      );
    }
  }

  /**
   * Send a transaction to another address
   */
  @requireUsableState
  @withStateTransition()
  @withErrorContext('send_transaction', 'wallet')
  @withRetry('wallet_send_transaction')
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
          severity: ErrorSeverity.Error,
          metadata: { amount: amount.toString() }
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
        WalletErrorCode.TransactionSendFailed,
        'Failed to send transaction',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          metadata: {
            walletId: this.instanceId,
            amount: amount.toString(),
            recipient: typeof recipient === 'string' ? recipient : recipient.toString()
          }
        }
      );
    }
  }

  /**
   * Get wallet seed words (requires passphrase if set)
   */
  @requireUsableState
  @withStateTransition()
  @withErrorContext('get_seed_words', 'wallet')
  @withRetry('wallet_get_seed_words')
  async getSeedWords(_passphrase?: string): Promise<string[]> {
    try {
      const bindings = getFFIBindings();
      const seedWords = await bindings.getSeedWords(this.handle);
      
      return seedWords;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.SeedWordsRetrievalFailed,
        'Failed to retrieve wallet seed words',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          metadata: { walletId: this.instanceId }
        }
      );
    }
  }

  /**
   * Sign a message with wallet's private key
   */
  @requireUsableState
  @withStateTransition()
  @withErrorContext('sign_message', 'wallet')
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
        WalletErrorCode.MessageSigningFailed,
        'Failed to sign message',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          metadata: { walletId: this.instanceId }
        }
      );
    }
  }

  // Transaction and history operations

  /**
   * Get transaction history
   */
  @requireUsableState
  @withStateTransition()
  @withErrorContext('get_transactions', 'wallet')
  async getTransactions(): Promise<TransactionInfo[]> {
    try {
      // TODO: Implement when transaction history FFI is available
      throw new WalletError(
        WalletErrorCode.NotImplemented,
        'Transaction history not yet implemented'
      );
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.TransactionHistoryFailed,
        'Failed to retrieve transaction history',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          metadata: { walletId: this.instanceId }
        }
      );
    }
  }

  /**
   * Cancel a pending transaction
   */
  @requireUsableState
  @withStateTransition()
  @withErrorContext('cancel_transaction', 'wallet')
  async cancelTransaction(_transactionId: TransactionId): Promise<void> {
    try {
      // TODO: Implement when transaction cancellation FFI is available
      throw new WalletError(
        WalletErrorCode.NotImplemented,
        'Transaction cancellation not yet implemented'
      );
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.TransactionCancelFailed,
        'Failed to cancel transaction',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          metadata: { walletId: this.instanceId }
        }
      );
    }
  }

  // Contact management

  /**
   * Add a contact to the wallet
   */
  @requireUsableState
  @withErrorContext('add_contact', 'wallet')
  async addContact(_contact: Contact): Promise<void> {
    try {
      // TODO: Implement when contact management FFI is available
      throw new WalletError(
        WalletErrorCode.NotImplemented,
        'Contact management not yet implemented'
      );
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.ContactAddFailed,
        'Failed to add contact',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          metadata: { walletId: this.instanceId }
        }
      );
    }
  }

  /**
   * Get all contacts
   */
  @requireUsableState
  @withErrorContext('get_contacts', 'wallet')
  async getContacts(): Promise<Contact[]> {
    try {
      // TODO: Implement when contact management FFI is available
      throw new WalletError(
        WalletErrorCode.NotImplemented,
        'Contact retrieval not yet implemented'
      );
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.ContactRetrievalFailed,
        'Failed to retrieve contacts',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          metadata: { walletId: this.instanceId }
        }
      );
    }
  }

  // Network operations

  /**
   * Set the base node for network communication
   */
  @requireUsableState
  @withStateTransition()
  @withErrorContext('set_base_node', 'wallet')
  async setBaseNode(peer: PeerInfo): Promise<void> {
    try {
      const bindings = getFFIBindings();
      await bindings.setBaseNode(this.handle, {
        publicKey: peer.publicKey,
        address: peer.address
      });
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.BaseNodeSetFailed,
        'Failed to set base node',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          metadata: { 
            walletId: this.instanceId,
            baseNode: peer
          }
        }
      );
    }
  }

  /**
   * Sync wallet with the network
   */
  @requireUsableState
  @withStateTransition()
  @withErrorContext('sync_wallet', 'wallet')
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
          metadata: { walletId: this.instanceId }
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

    // Initialize the lifecycle
    await this.lifecycleManager.initialize(this.handle);
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
