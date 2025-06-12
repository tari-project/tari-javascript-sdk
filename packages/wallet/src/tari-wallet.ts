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
import { 
  TariAddress as CoreTariAddress
} from '@tari-project/tarijs-core';
import { TariAddress, WalletBalance, TransactionId } from './models/index.js';
import { 
  WalletState, 
  WalletStateManager
} from './wallet-state.js';
import { 
  WalletLifecycleManager, 
  type LifecycleHooks,
  createAsyncDisposableResource,
  ResourceManager,
  ResourceType,
  globalWalletFinalizer
} from './lifecycle/index.js';
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
import {
  AddressService,
  AddressFormatter,
  EmojiConverter,
  type AddressServiceConfig,
  type FormattingOptions,
  type EmojiConversionOptions
} from './address/index.js';
import {
  WalletInfoService,
  NetworkInfoService,
  VersionInfoService,
  type WalletInfoConfig,
  type NetworkInfoOptions,
  type VersionCompatibility,
  type WalletInfo,
  type NetworkInfo,
  type VersionInfo,
  type SyncStatus,
  type BaseNodeInfo,
  type WalletCapabilities,
  type WalletMetrics
} from './info/index.js';
import {
  MessageSigner,
  SignatureVerifier,
  type MessageSigningOptions,
  type SignedMessage,
  type SignatureVerificationOptions,
  type SignatureVerificationResult
} from './signing/index.js';
import {
  TransactionAPI,
  type TransactionAPIConfig,
  type TransactionAPIEvents,
  type StandardSendOptions,
  type TransactionQueryOptions,
  type TransactionAPIStatistics
} from './api/transaction-api.js';
import type {
  TransactionDetails,
  PendingInboundTransaction,
  PendingOutboundTransaction,
  CancellationResult,
  HistoryEntry
} from './transactions/index.js';

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
  private readonly addressService: AddressService;
  private readonly addressFormatter: AddressFormatter;
  private readonly emojiConverter: EmojiConverter;
  private readonly walletInfoService: WalletInfoService;
  private readonly networkInfoService: NetworkInfoService;
  private readonly versionInfoService: VersionInfoService;
  private readonly instanceId: string;
  private readonly resourceManager: ResourceManager;
  private readonly finalizerUnregister?: () => void;
  private readonly messageSigner: MessageSigner;
  private readonly signatureVerifier: SignatureVerifier;
  private readonly transactionAPI: TransactionAPI;

  /**
   * Private constructor - use WalletFactory.create() or WalletFactory.restore()
   */
  constructor(
    handle: WalletHandle, 
    config: WalletConfig, 
    hooks: LifecycleHooks = {},
    balanceConfig?: BalanceServiceConfig,
    addressConfig?: AddressServiceConfig,
    walletInfoConfig?: WalletInfoConfig,
    transactionConfig?: Partial<TransactionAPIConfig>
  ) {
    this.instanceId = `wallet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.handle = handle;
    this.config = { ...config };
    this.eventEmitter = new EventEmitter();
    this.stateManager = new WalletStateManager(this.instanceId);
    this.lifecycleManager = new WalletLifecycleManager(this.instanceId, this.stateManager, hooks);
    this.balanceService = new BalanceService(handle, balanceConfig);
    
    // Initialize resource management
    this.resourceManager = ResourceManager.getInstance();
    
    // Register this wallet with the resource manager
    const resourceId = this.resourceManager.registerResource(
      this,
      ResourceType.WalletHandle,
      handle,
      this.instanceId,
      ['primary-wallet']
    );
    
    // Register with FinalizationRegistry for automatic cleanup
    this.finalizerUnregister = globalWalletFinalizer.registerWalletResource(
      this,
      resourceId,
      ResourceType.WalletHandle,
      this.instanceId,
      handle,
      {
        id: resourceId,
        type: ResourceType.WalletHandle,
        handle,
        created: new Date(),
        lastAccessed: new Date(),
        refCount: 1,
        walletId: this.instanceId
      }
    );
    
    // Initialize address services
    const defaultAddressConfig: AddressServiceConfig = {
      network: config.network,
      cacheSize: 100,
      cacheTtl: 5 * 60 * 1000, // 5 minutes
      autoCleanup: true,
      ...addressConfig
    };
    this.addressService = new AddressService(defaultAddressConfig);
    this.addressFormatter = new AddressFormatter();
    this.emojiConverter = new EmojiConverter();
    
    // Initialize info services
    const defaultWalletInfoConfig: WalletInfoConfig = {
      includeSensitive: false,
      refreshInterval: 30 * 1000, // 30 seconds
      autoRefresh: true,
      networkTimeout: 10 * 1000, // 10 seconds
      ...walletInfoConfig
    };
    this.walletInfoService = new WalletInfoService(defaultWalletInfoConfig);
    this.networkInfoService = new NetworkInfoService();
    this.versionInfoService = new VersionInfoService();

    // Initialize signing services
    this.messageSigner = new MessageSigner(handle, this.instanceId);
    this.signatureVerifier = new SignatureVerifier();

    // Initialize transaction API
    this.transactionAPI = new TransactionAPI(handle, transactionConfig);

    // Initialize lifecycle
    this.initializeLifecycle();

    // Setup balance change forwarding
    this.setupBalanceEventForwarding();

    // Setup transaction event forwarding
    this.setupTransactionEventForwarding();
  }

  // Core wallet operations

  /**
   * Get wallet's primary address with caching
   */
  async getAddress(): Promise<CoreTariAddress> {
    this.ensureNotDestroyed();
    
    return this.addressService.getWalletAddress(this.handle);
  }

  /**
   * Format address for display
   */
  formatAddress(address: CoreTariAddress, options: FormattingOptions): string {
    this.ensureNotDestroyed();
    
    const formatted = this.addressFormatter.format(address, options);
    return formatted.formatted;
  }

  /**
   * Format wallet address for UI display
   */
  async formatWalletAddressForUI(maxLength = 20): Promise<string> {
    this.ensureNotDestroyed();
    
    const address = await this.getAddress();
    return this.formatAddress(address, {
      format: 'base58' as const,
      truncate: {
        maxLength,
        startChars: 8,
        endChars: 8,
        separator: '...'
      }
    });
  }

  /**
   * Get wallet address as emoji ID
   */
  async getAddressAsEmoji(): Promise<string> {
    this.ensureNotDestroyed();
    
    const address = await this.getAddress();
    const result = await this.emojiConverter.addressToEmoji(address, {
      network: this.config.network,
      useCache: true
    });
    return result.result;
  }

  /**
   * Convert emoji ID to address
   */
  async convertEmojiToAddress(emojiId: string): Promise<CoreTariAddress> {
    this.ensureNotDestroyed();
    
    const result = await this.emojiConverter.emojiToAddress(emojiId, {
      network: this.config.network,
      validateInput: true,
      useCache: true
    });
    
    return new CoreTariAddress(result.result);
  }

  /**
   * Validate a Tari address
   */
  async validateAddress(address: string): Promise<boolean> {
    this.ensureNotDestroyed();
    
    return this.addressService.validateAddress(address, {
      network: this.config.network
    });
  }

  // Wallet Information Methods

  /**
   * Get comprehensive wallet information
   */
  async getWalletInfo(forceRefresh = false): Promise<WalletInfo> {
    this.ensureNotDestroyed();
    
    return this.walletInfoService.getWalletInfo(this.handle, this.config.network, forceRefresh);
  }

  /**
   * Get wallet synchronization status
   */
  async getSyncStatus(): Promise<SyncStatus> {
    this.ensureNotDestroyed();
    
    return this.walletInfoService.getSyncStatus(this.handle);
  }

  /**
   * Check if wallet is fully synchronized
   */
  async isSynchronized(): Promise<boolean> {
    this.ensureNotDestroyed();
    
    return this.walletInfoService.isWalletSynchronized(this.handle);
  }

  /**
   * Get wallet capabilities
   */
  getWalletCapabilities(): WalletCapabilities {
    this.ensureNotDestroyed();
    
    return this.walletInfoService.getWalletCapabilities();
  }

  /**
   * Get wallet performance metrics
   */
  async getWalletMetrics(): Promise<WalletMetrics> {
    this.ensureNotDestroyed();
    
    return this.walletInfoService.getWalletMetrics(this.handle);
  }

  /**
   * Get network information
   */
  async getNetworkInfo(options: NetworkInfoOptions = {}): Promise<NetworkInfo> {
    this.ensureNotDestroyed();
    
    return this.networkInfoService.getNetworkInfo(this.handle, this.config.network, options);
  }

  /**
   * Get base node connection information
   */
  async getBaseNodeInfo(): Promise<BaseNodeInfo> {
    this.ensureNotDestroyed();
    
    return this.networkInfoService.getBaseNodeInfo(this.handle);
  }

  /**
   * Check if wallet is connected to the network
   */
  async isNetworkConnected(): Promise<boolean> {
    this.ensureNotDestroyed();
    
    return this.networkInfoService.isNetworkConnected(this.handle);
  }

  /**
   * Get network connectivity status
   */
  async getConnectivityStatus(): Promise<{
    isConnected: boolean;
    peerCount: number;
    latency?: number;
    lastConnected?: Date;
  }> {
    this.ensureNotDestroyed();
    
    return this.networkInfoService.getConnectivityStatus(this.handle);
  }

  /**
   * Start network monitoring
   */
  startNetworkMonitoring(intervalMs = 10000): void {
    this.ensureNotDestroyed();
    
    this.networkInfoService.startMonitoring(this.handle, this.config.network, intervalMs);
  }

  /**
   * Stop network monitoring
   */
  stopNetworkMonitoring(): void {
    this.ensureNotDestroyed();
    
    this.networkInfoService.stopMonitoring();
  }

  /**
   * Get version information and compatibility
   */
  async getVersionInfo(options: VersionCompatibility = {}): Promise<VersionInfo> {
    this.ensureNotDestroyed();
    
    return this.versionInfoService.getVersionInfo(options);
  }

  /**
   * Check if current versions are compatible
   */
  async isVersionCompatible(options: VersionCompatibility = {}): Promise<boolean> {
    this.ensureNotDestroyed();
    
    return this.versionInfoService.isCompatible(options);
  }

  /**
   * Check if an upgrade is required
   */
  async requiresUpgrade(options: VersionCompatibility = {}): Promise<boolean> {
    this.ensureNotDestroyed();
    
    return this.versionInfoService.requiresUpgrade(options);
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

  // Transaction Operations

  /**
   * Send a standard transaction to another address
   */
  async sendTransaction(
    address: string | TariAddress,
    amount: bigint,
    options: StandardSendOptions = {}
  ): Promise<TransactionId> {
    this.ensureNotDestroyed();
    
    // Convert amount to MicroTari type
    const microTariAmount = amount as any; // Type assertion for compatibility
    
    return await this.transactionAPI.sendTransaction(address, microTariAmount, options);
  }

  /**
   * Send a one-sided transaction
   */
  async sendOneSidedTransaction(
    address: string | TariAddress,
    amount: bigint,
    options: Omit<StandardSendOptions, 'oneSided'> = {}
  ): Promise<TransactionId> {
    this.ensureNotDestroyed();
    
    const microTariAmount = amount as any;
    return await this.transactionAPI.sendOneSidedTransaction(address, microTariAmount, options);
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(transactionId: TransactionId): Promise<TransactionInfo | null> {
    this.ensureNotDestroyed();
    
    return await this.transactionAPI.getTransaction(transactionId);
  }

  /**
   * Get detailed transaction information
   */
  async getTransactionDetails(
    transactionId: TransactionId,
    forceRefresh: boolean = false
  ): Promise<TransactionDetails> {
    this.ensureNotDestroyed();
    
    return await this.transactionAPI.getTransactionDetails(transactionId, forceRefresh);
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(
    options: TransactionQueryOptions = {}
  ): Promise<HistoryEntry[]> {
    this.ensureNotDestroyed();
    
    return await this.transactionAPI.getTransactionHistory(options);
  }

  /**
   * Search transaction history
   */
  async searchTransactionHistory(
    searchText: string,
    options: TransactionQueryOptions = {}
  ): Promise<HistoryEntry[]> {
    this.ensureNotDestroyed();
    
    return await this.transactionAPI.searchTransactionHistory(searchText, options);
  }

  /**
   * Export transaction history
   */
  async exportTransactionHistory(
    format: 'csv' | 'json' = 'csv',
    options: TransactionQueryOptions = {}
  ): Promise<string> {
    this.ensureNotDestroyed();
    
    return await this.transactionAPI.exportTransactionHistory(format, options);
  }

  /**
   * Get pending transactions
   */
  async getPendingTransactions(forceRefresh: boolean = false): Promise<{
    inbound: PendingInboundTransaction[];
    outbound: PendingOutboundTransaction[];
  }> {
    this.ensureNotDestroyed();
    
    return await this.transactionAPI.getPendingTransactions(forceRefresh);
  }

  /**
   * Cancel a pending transaction
   */
  async cancelTransaction(transactionId: TransactionId): Promise<CancellationResult> {
    this.ensureNotDestroyed();
    
    return await this.transactionAPI.cancelTransaction(transactionId);
  }

  /**
   * Check if a transaction can be cancelled
   */
  async canCancelTransaction(transactionId: TransactionId): Promise<{
    canCancel: boolean;
    reason?: string;
  }> {
    this.ensureNotDestroyed();
    
    return await this.transactionAPI.canCancelTransaction(transactionId);
  }

  /**
   * Get all cancellable transactions
   */
  async getCancellableTransactions(): Promise<PendingOutboundTransaction[]> {
    this.ensureNotDestroyed();
    
    return await this.transactionAPI.getCancellableTransactions();
  }

  /**
   * Update transaction memo
   */
  async updateTransactionMemo(transactionId: TransactionId, memo: string): Promise<void> {
    this.ensureNotDestroyed();
    
    await this.transactionAPI.updateTransactionMemo(transactionId, memo);
  }

  /**
   * Get transaction memo
   */
  async getTransactionMemo(transactionId: TransactionId): Promise<string | null> {
    this.ensureNotDestroyed();
    
    return await this.transactionAPI.getTransactionMemo(transactionId);
  }

  /**
   * Get confirmation count for a transaction
   */
  async getConfirmationCount(transactionId: TransactionId): Promise<number> {
    this.ensureNotDestroyed();
    
    return await this.transactionAPI.getConfirmationCount(transactionId);
  }

  /**
   * Start tracking confirmations for a transaction
   */
  async startConfirmationTracking(transactionId: TransactionId): Promise<void> {
    this.ensureNotDestroyed();
    
    await this.transactionAPI.startConfirmationTracking(transactionId);
  }

  /**
   * Stop tracking confirmations for a transaction
   */
  stopConfirmationTracking(transactionId: TransactionId): boolean {
    this.ensureNotDestroyed();
    
    return this.transactionAPI.stopConfirmationTracking(transactionId);
  }

  /**
   * Get comprehensive transaction statistics
   */
  async getTransactionStatistics(): Promise<TransactionAPIStatistics> {
    this.ensureNotDestroyed();
    
    return await this.transactionAPI.getStatistics();
  }

  /**
   * Refresh all transaction data
   */
  async refreshTransactionData(): Promise<void> {
    this.ensureNotDestroyed();
    
    await this.transactionAPI.refreshAllData();
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
  async signMessage(
    message: string, 
    options: MessageSigningOptions = {}
  ): Promise<string> {
    this.ensureNotDestroyed();
    
    const signedMessage = await this.messageSigner.signMessage(message, options);
    return signedMessage.signature;
  }

  /**
   * Sign a message and return full signed message object
   */
  async signMessageDetailed(
    message: string,
    options: MessageSigningOptions = {}
  ): Promise<SignedMessage> {
    this.ensureNotDestroyed();
    
    return this.messageSigner.signMessage(message, options);
  }

  /**
   * Sign multiple messages in batch
   */
  async signMessages(
    messages: string[],
    options: MessageSigningOptions = {}
  ): Promise<SignedMessage[]> {
    this.ensureNotDestroyed();
    
    return this.messageSigner.signMessages(messages, options);
  }

  /**
   * Verify a message signature
   */
  async verifySignature(
    message: string,
    signature: string,
    publicKey: string,
    options: SignatureVerificationOptions = {}
  ): Promise<SignatureVerificationResult> {
    this.ensureNotDestroyed();
    
    return this.signatureVerifier.verifySignature(message, signature, publicKey, options);
  }

  /**
   * Verify a signed message object
   */
  async verifySignedMessage(
    signedMessage: SignedMessage,
    options: SignatureVerificationOptions = {}
  ): Promise<SignatureVerificationResult> {
    this.ensureNotDestroyed();
    
    return this.signatureVerifier.verifySignedMessage(signedMessage, options);
  }

  /**
   * Get public key for message verification
   */
  async getPublicKey(): Promise<string> {
    this.ensureNotDestroyed();
    
    return this.messageSigner.getPublicKey();
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
      lifecycle: this.lifecycleManager.getStats(),
      resources: this.resourceManager.getStats(),
      finalizer: globalWalletFinalizer.getStats()
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

    // Unregister from FinalizationRegistry (proper cleanup)
    if (this.finalizerUnregister) {
      this.finalizerUnregister();
    }

    // Cleanup all wallet resources through resource manager
    await this.resourceManager.cleanupWalletResources(this.instanceId);

    // Cleanup address services
    this.addressService.destroy();
    this.addressFormatter.destroy();
    this.emojiConverter.destroy();
    
    // Cleanup info services
    this.walletInfoService.destroy();
    this.networkInfoService.destroy();
    this.versionInfoService.destroy();

    // Cleanup transaction API
    await this.transactionAPI.dispose();

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

  private setupTransactionEventForwarding(): void {
    // Forward transaction API events through the wallet event emitter
    this.transactionAPI.on('transaction:sent', (txId, amount) => {
      this.eventEmitter.emit('transactionSent', txId, amount);
    });

    this.transactionAPI.on('transaction:received', (txId, amount) => {
      this.eventEmitter.emit('transactionReceived', txId, amount);
    });

    this.transactionAPI.on('transaction:confirmed', (txId, blockHeight) => {
      this.eventEmitter.emit('transactionConfirmed', txId, blockHeight);
    });

    this.transactionAPI.on('transaction:finalized', (txId, details) => {
      this.eventEmitter.emit('transactionFinalized', txId, details);
    });

    this.transactionAPI.on('pending:updated', (pending) => {
      this.eventEmitter.emit('pendingTransactionsUpdated', pending);
    });

    this.transactionAPI.on('pending:timeout', (txId, timeoutSeconds) => {
      this.eventEmitter.emit('transactionTimeout', txId, timeoutSeconds);
    });

    this.transactionAPI.on('cancellation:completed', (txId, refundAmount) => {
      this.eventEmitter.emit('transactionCancelled', txId, refundAmount);
    });

    this.transactionAPI.on('confirmations:changed', (txId, newCount, oldCount) => {
      this.eventEmitter.emit('confirmationsChanged', txId, newCount, oldCount);
    });

    this.transactionAPI.on('details:enriched', (txId, details) => {
      this.eventEmitter.emit('transactionDetailsEnriched', txId, details);
    });

    this.transactionAPI.on('history:updated', (entries) => {
      this.eventEmitter.emit('transactionHistoryUpdated', entries);
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
