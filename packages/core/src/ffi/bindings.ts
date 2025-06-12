/**
 * TypeScript bindings interface for the native Tari wallet FFI
 * Provides type-safe wrappers around native functions with validation
 */

import { loadNativeModule } from './loader.js';
import type { NativeBindings } from './native.js';
import { executeFFICall, type CallOptions } from './call-manager.js';
import { getRetryPolicyForOperation, policyToCallOptions } from './retry.js';
import type {
  WalletHandle,
  FFIWalletConfig,
  FFIBalance,
  FFITransactionInfo,
  FFISendTransactionOptions,
  FFIBaseNodePeer,
} from './types.js';
import {
  createWalletHandle,
  unwrapWalletHandle,
  validateFFIWalletConfig,
  validateTransactionAmount,
  validateTariAddress,
} from './types.js';

/**
 * Type-safe FFI bindings wrapper
 */
export class FFIBindings {
  private nativeModule: NativeBindings | null = null;
  private initialized = false;

  /**
   * Initialize the FFI bindings
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.nativeModule = await loadNativeModule();
    
    // Initialize logging in the native module
    try {
      if (this.nativeModule) {
        await this.nativeModule.init_logging(2); // Info level
      }
    } catch (error) {
      console.warn('Failed to initialize native logging:', error);
    }

    this.initialized = true;
  }

  /**
   * Ensure the module is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.nativeModule) {
      throw new Error('FFI bindings not initialized. Call initialize() first.');
    }
  }

  /**
   * Get the native module (throws if not initialized)
   */
  private getNativeModule(): NativeBindings {
    this.ensureInitialized();
    if (!this.nativeModule) {
      throw new Error('Native module is null after initialization');
    }
    return this.nativeModule;
  }

  // Wallet lifecycle operations

  /**
   * Create a new wallet instance
   */
  public async createWallet(config: FFIWalletConfig, options?: Partial<CallOptions>): Promise<WalletHandle> {
    validateFFIWalletConfig(config);
    
    const native = this.getNativeModule();
    const nativeConfig = {
      network: config.network,
      storage_path: config.storagePath,
      log_path: config.logPath,
      log_level: config.logLevel,
      passphrase: config.passphrase,
      seed_words: config.seedWords,
      num_rolling_log_files: config.numRollingLogFiles,
      rolling_log_file_size: config.rollingLogFileSize,
    };

    // Use retry policy for wallet creation (critical operation)
    const retryPolicy = getRetryPolicyForOperation('wallet_create');
    const callOptions = { ...policyToCallOptions(retryPolicy), ...options };

    const handle = await executeFFICall(
      'walletCreate',
      (config) => native.walletCreate(config),
      [nativeConfig],
      callOptions
    );
    
    return createWalletHandle(handle);
  }

  /**
   * Destroy a wallet instance
   */
  public async destroyWallet(handle: WalletHandle, options?: Partial<CallOptions>): Promise<void> {
    const native = this.getNativeModule();
    
    // Use retry policy for wallet destruction (critical operation)
    const retryPolicy = getRetryPolicyForOperation('wallet_destroy');
    const callOptions = { ...policyToCallOptions(retryPolicy), ...options };

    await executeFFICall(
      'walletDestroy',
      (handle) => native.walletDestroy(handle),
      [unwrapWalletHandle(handle)],
      callOptions
    );
  }

  // Wallet operations

  /**
   * Get wallet balance
   */
  public async getBalance(handle: WalletHandle, options?: Partial<CallOptions>): Promise<FFIBalance> {
    const native = this.getNativeModule();
    
    // Use retry policy for balance queries (standard operation)
    const retryPolicy = getRetryPolicyForOperation('wallet_get_balance');
    const callOptions = { ...policyToCallOptions(retryPolicy), ...options };

    const balance = await executeFFICall(
      'walletGetBalance',
      (handle) => native.walletGetBalance(handle),
      [unwrapWalletHandle(handle)],
      callOptions
    );
    
    return {
      available: balance.available,
      pendingIncoming: balance.pending_incoming,
      pendingOutgoing: balance.pending_outgoing,
      timelocked: balance.timelocked,
    };
  }

  /**
   * Get wallet address
   */
  public async getAddress(handle: WalletHandle): Promise<string> {
    const native = this.getNativeModule();
    return native.walletGetAddress(unwrapWalletHandle(handle));
  }

  /**
   * Send a transaction
   */
  public async sendTransaction(
    handle: WalletHandle,
    recipientAddress: string,
    amount: string,
    options?: FFISendTransactionOptions
  ): Promise<string> {
    validateTransactionAmount(amount);
    validateTariAddress(recipientAddress);

    const native = this.getNativeModule();
    const nativeOptions = options ? {
      fee_per_gram: options.feePerGram,
      message: options.message,
      is_one_sided: options.isOneSided,
    } : undefined;

    return native.walletSendTransaction(
      unwrapWalletHandle(handle),
      recipientAddress,
      amount,
      nativeOptions
    );
  }

  /**
   * Get wallet seed words
   */
  public async getSeedWords(handle: WalletHandle): Promise<string[]> {
    const native = this.getNativeModule();
    return native.walletGetSeedWords(unwrapWalletHandle(handle));
  }

  /**
   * Sign a message with wallet's private key
   */
  public async signMessage(handle: WalletHandle, message: string): Promise<string> {
    // TODO: Implement when FFI method is available
    throw new Error('Message signing not yet implemented in FFI');
  }

  /**
   * Get wallet's public key
   */
  public async getPublicKey(handle: WalletHandle): Promise<string> {
    // TODO: Implement when FFI method is available
    throw new Error('Public key retrieval not yet implemented in FFI');
  }

  /**
   * Verify a message signature
   */
  public async verifyMessageSignature(
    message: string, 
    signature: string, 
    publicKey: string
  ): Promise<boolean> {
    // TODO: Implement when FFI method is available
    throw new Error('Message signature verification not yet implemented in FFI');
  }

  /**
   * Convert public key to wallet address
   */
  public async publicKeyToAddress(publicKey: string): Promise<string> {
    // TODO: Implement when FFI method is available
    throw new Error('Public key to address conversion not yet implemented in FFI');
  }

  /**
   * Recover public key from signature (if supported)
   */
  public async recoverPublicKey(message: string, signature: string): Promise<string> {
    // TODO: Implement when FFI method is available
    throw new Error('Public key recovery not yet implemented in FFI');
  }

  /**
   * Set base node for the wallet
   */
  public async setBaseNode(handle: WalletHandle, baseNode: FFIBaseNodePeer): Promise<void> {
    if (!baseNode.publicKey || !baseNode.address) {
      throw new Error('Base node public key and address are required');
    }

    const native = this.getNativeModule();
    const nativeBaseNode = {
      public_key: baseNode.publicKey,
      address: baseNode.address,
    };

    await native.walletSetBaseNode(unwrapWalletHandle(handle), nativeBaseNode);
  }

  // Utility functions

  /**
   * Get the number of active wallet handles
   */
  public async getActiveHandleCount(): Promise<number> {
    const native = this.getNativeModule();
    return native.walletGetActiveHandleCount();
  }

  /**
   * Validate a wallet handle
   */
  public async validateHandle(handle: WalletHandle): Promise<boolean> {
    const native = this.getNativeModule();
    return native.walletValidateHandle(unwrapWalletHandle(handle));
  }

  /**
   * Cleanup all wallet handles (for testing)
   */
  public async cleanupAll(): Promise<number> {
    const native = this.getNativeModule();
    return native.walletCleanupAll();
  }

  // Address utilities

  /**
   * Validate a Tari address
   */
  public async validateAddress(address: string, network: string): Promise<boolean> {
    const native = this.getNativeModule();
    return native.validateAddress(address, network);
  }

  /**
   * Convert emoji ID to Tari address
   */
  public async emojiIdToAddress(emojiId: string, network: string): Promise<string> {
    if (!emojiId || !network) {
      throw new Error('Emoji ID and network are required');
    }

    const native = this.getNativeModule();
    return native.emojiIdToAddress(emojiId, network);
  }

  /**
   * Convert Tari address to emoji ID
   */
  public async addressToEmojiId(address: string): Promise<string> {
    if (!address) {
      throw new Error('Address is required');
    }

    const native = this.getNativeModule();
    return native.addressToEmojiId(address);
  }

  // State management

  /**
   * Check if bindings are initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Reset the bindings (for testing)
   */
  public reset(): void {
    this.initialized = false;
    this.nativeModule = null;
  }
}

// Singleton instance
let globalBindings: FFIBindings | null = null;

/**
 * Get the global FFI bindings instance
 */
export function getFFIBindings(): FFIBindings {
  if (!globalBindings) {
    globalBindings = new FFIBindings();
  }
  return globalBindings;
}

/**
 * Initialize the global FFI bindings
 */
export async function initializeFFI(): Promise<void> {
  const bindings = getFFIBindings();
  await bindings.initialize();
}

/**
 * Reset the global FFI bindings (for testing)
 */
export function resetFFI(): void {
  if (globalBindings) {
    globalBindings.reset();
  }
  globalBindings = null;
}
