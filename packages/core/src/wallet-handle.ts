/**
 * Concrete wallet handle wrapper class with integrated FFI resource management
 * Provides high-level wallet operations with automatic resource lifecycle management
 */

import { FFIResource, ResourceType } from './ffi/resource';
import { HandleFactory, type ResourceHandle } from './ffi/handle';
import { getFFIBindings } from './ffi/bindings';
import { FFICallManager, type CallOptions } from './ffi/call-manager';
import { getRetryPolicyForOperation, policyToCallOptions } from './ffi/retry';
import { TariError, ErrorCode } from './errors/index';
import type { 
  WalletHandle, 
  FFIWalletConfig, 
  FFIBalance, 
  FFISendTransactionOptions,
  FFIBaseNodePeer 
} from './ffi/types';
import { 
  validateFFIWalletConfig,
  validateTransactionAmount,
  validateTariAddress,
  createWalletHandle as createWalletHandleType,
  unwrapWalletHandle 
} from './ffi/types';

/**
 * Wallet handle wrapper configuration
 */
export interface WalletHandleConfig {
  /** The native wallet handle */
  handle: WalletHandle;
  /** Initial wallet configuration */
  config: FFIWalletConfig;
  /** Call options for operations */
  callOptions?: Partial<CallOptions>;
  /** Tags for resource tracking */
  tags?: string[];
}

/**
 * Wallet operation result with metadata
 */
export interface WalletOperationResult<T> {
  /** Operation result */
  result: T;
  /** Operation duration (ms) */
  duration: number;
  /** Number of retry attempts */
  attempts: number;
  /** Request ID for tracking */
  requestId: string;
}

/**
 * Concrete wallet handle wrapper extending FFI resource management
 * 
 * This class provides the foundation for the high-level wallet API by wrapping
 * native wallet handles with comprehensive resource management, error handling,
 * and retry logic. It serves as the bridge between the core FFI infrastructure
 * and the wallet package's business logic layer.
 * 
 * Key features:
 * - Automatic resource lifecycle management via disposal pattern
 * - Integrated retry logic with platform-specific optimizations
 * - Comprehensive error handling and classification
 * - Resource tracking and leak detection
 * - Performance monitoring and diagnostics
 */
export class WalletHandleWrapper extends FFIResource {
  private readonly handle: WalletHandle;
  private readonly config: FFIWalletConfig;
  private readonly defaultCallOptions: Partial<CallOptions>;
  private readonly bindings = getFFIBindings();
  private readonly handleWrapper: ResourceHandle;
  
  private get callManager() {
    return FFICallManager.getInstance();
  }

  private constructor(config: WalletHandleConfig) {
    // Initialize FFI resource with disposal logic
    super(
      ResourceType.Wallet,
      async () => {
        try {
          await this.bindings.destroyWallet(this.handle);
        } catch (error) {
          console.error('Error during wallet destruction:', error);
        }
      },
      true, // Capture stack trace
      config.tags
    );

    this.handle = config.handle;
    this.config = { ...config.config };
    this.defaultCallOptions = config.callOptions || {};
    this.handleWrapper = HandleFactory.createWallet(this.handle, this.bindings, true);
  }

  /**
   * Create a new wallet handle wrapper
   */
  static async create(config: FFIWalletConfig, options?: {
    callOptions?: Partial<CallOptions>;
    tags?: string[];
  }): Promise<WalletHandleWrapper> {
    // Validate configuration
    validateFFIWalletConfig(config);

    // Get initialized bindings
    const bindings = getFFIBindings();
    if (!bindings.isInitialized()) {
      await bindings.initialize();
    }

    // Create wallet with retry logic
    const handle = await bindings.createWallet(config, options?.callOptions);

    // Wrap in handle wrapper
    return new WalletHandleWrapper({
      handle,
      config,
      callOptions: options?.callOptions,
      tags: options?.tags,
    });
  }

  /**
   * Restore wallet from existing handle
   */
  static fromHandle(
    handle: WalletHandle,
    config: FFIWalletConfig,
    options?: {
      callOptions?: Partial<CallOptions>;
      tags?: string[];
    }
  ): WalletHandleWrapper {
    return new WalletHandleWrapper({
      handle,
      config,
      callOptions: options?.callOptions,
      tags: options?.tags,
    });
  }

  /**
   * Get the native wallet handle
   */
  getHandle(): WalletHandle {
    this.ensureNotDisposed();
    return this.handle;
  }

  /**
   * Get wallet configuration (without sensitive data)
   */
  getConfig(): Omit<FFIWalletConfig, 'passphrase' | 'seedWords'> {
    const { passphrase, seedWords, ...safeConfig } = this.config;
    return safeConfig;
  }

  /**
   * Get wallet balance with retry logic
   */
  async getBalance(options?: Partial<CallOptions>): Promise<WalletOperationResult<FFIBalance>> {
    this.ensureNotDisposed();
    
    const callOptions = this.mergeCallOptions('wallet_get_balance', options);
    const startTime = Date.now();
    
    const result = await this.bindings.getBalance(this.getHandle(), callOptions);

    return {
      result,
      duration: Date.now() - startTime,
      attempts: 1, // TODO: Track actual attempts from call manager
      requestId: `balance_${Date.now()}`,
    };
  }

  /**
   * Get wallet address with retry logic
   */
  async getAddress(options?: Partial<CallOptions>): Promise<WalletOperationResult<string>> {
    this.ensureNotDisposed();
    
    const callOptions = this.mergeCallOptions('wallet_get_address', options);
    const startTime = Date.now();
    
    const result = await this.callManager.execute(
      'wallet_get_address',
      (handle: WalletHandle) => this.bindings.getAddress(handle),
      [this.getHandle()],
      callOptions
    );

    return {
      result,
      duration: Date.now() - startTime,
      attempts: 1,
      requestId: `address_${Date.now()}`,
    };
  }

  /**
   * Send transaction with retry logic
   */
  async sendTransaction(
    recipientAddress: string,
    amount: string,
    transactionOptions?: FFISendTransactionOptions,
    callOptions?: Partial<CallOptions>
  ): Promise<WalletOperationResult<string>> {
    this.ensureNotDisposed();
    
    // Validate inputs
    validateTransactionAmount(amount);
    validateTariAddress(recipientAddress, this.config.network);
    
    const mergedCallOptions = this.mergeCallOptions('send_transaction', callOptions);
    const startTime = Date.now();
    
    const result = await this.callManager.execute(
      'send_transaction',
      (handle: WalletHandle, addr: string, amt: string, opts?: FFISendTransactionOptions) => 
        this.bindings.sendTransaction(handle, addr, amt, opts),
      [this.getHandle(), recipientAddress, amount, transactionOptions],
      mergedCallOptions
    );

    return {
      result,
      duration: Date.now() - startTime,
      attempts: 1,
      requestId: `transaction_${Date.now()}`,
    };
  }

  /**
   * Get wallet seed words with retry logic
   */
  async getSeedWords(options?: Partial<CallOptions>): Promise<WalletOperationResult<string[]>> {
    this.ensureNotDisposed();
    
    const callOptions = this.mergeCallOptions('wallet_get_seed_words', options);
    const startTime = Date.now();
    
    const result = await this.callManager.execute(
      'wallet_get_seed_words',
      (handle: WalletHandle) => this.bindings.getSeedWords(handle),
      [this.getHandle()],
      callOptions
    );

    return {
      result,
      duration: Date.now() - startTime,
      attempts: 1,
      requestId: `seed_${Date.now()}`,
    };
  }

  /**
   * Set base node for the wallet
   */
  async setBaseNode(
    baseNode: FFIBaseNodePeer,
    options?: Partial<CallOptions>
  ): Promise<WalletOperationResult<void>> {
    this.ensureNotDisposed();
    
    const callOptions = this.mergeCallOptions('base_node_connect', options);
    const startTime = Date.now();
    
    const result = await this.callManager.execute(
      'wallet_set_base_node',
      (handle: WalletHandle, node: FFIBaseNodePeer) => this.bindings.setBaseNode(handle, node),
      [this.getHandle(), baseNode],
      callOptions
    );

    return {
      result,
      duration: Date.now() - startTime,
      attempts: 1,
      requestId: `basenode_${Date.now()}`,
    };
  }

  /**
   * Validate that the wallet handle is still valid
   */
  async validateHandle(options?: Partial<CallOptions>): Promise<boolean> {
    if (this.isDisposed) {
      return false;
    }

    try {
      const callOptions = this.mergeCallOptions('validate_handle', options);
      
      return await this.callManager.execute(
        'wallet_validate_handle',
        (handle: WalletHandle) => this.bindings.validateHandle(handle),
        [this.getHandle()],
        callOptions
      );
    } catch {
      return false;
    }
  }

  /**
   * Get extended wallet handle information (not overriding base class)
   */
  getWalletInfo(): {
    handle: WalletHandle;
    config: Omit<FFIWalletConfig, 'passphrase' | 'seedWords'>;
    metadata: ReturnType<ResourceHandle['getMetadata']>;
    resourceInfo: ReturnType<FFIResource['getResourceInfo']>;
  } {
    return {
      handle: this.getHandle(),
      config: this.getConfig(),
      metadata: this.handleWrapper.getMetadata(),
      resourceInfo: super.getResourceInfo(),
    };
  }

  /**
   * Override getHandle for base class integration
   */
  protected getHandleForBase(): WalletHandle {
    return this.handle;
  }

  /**
   * Merge call options with defaults and operation-specific settings
   */
  private mergeCallOptions(
    operation: string,
    options?: Partial<CallOptions>
  ): Partial<CallOptions> {
    const retryPolicy = getRetryPolicyForOperation(operation);
    const policyOptions = policyToCallOptions(retryPolicy);
    
    return {
      ...policyOptions,
      ...this.defaultCallOptions,
      ...options,
      tags: [
        ...(policyOptions.tags || []),
        ...(this.defaultCallOptions.tags || []),
        ...(options?.tags || []),
        'wallet-handle',
        operation,
      ],
    };
  }
}

/**
 * Factory functions for wallet handle creation
 */

/**
 * Create a new wallet handle wrapper
 */
export async function createWalletHandle(
  config: FFIWalletConfig,
  options?: {
    callOptions?: Partial<CallOptions>;
    tags?: string[];
  }
): Promise<WalletHandleWrapper> {
  return WalletHandleWrapper.create(config, options);
}

/**
 * Restore wallet handle from existing handle value
 */
export function restoreWalletHandle(
  handle: WalletHandle,
  config: FFIWalletConfig,
  options?: {
    callOptions?: Partial<CallOptions>;
    tags?: string[];
  }
): WalletHandleWrapper {
  return WalletHandleWrapper.fromHandle(handle, config, options);
}

/**
 * Type guard for wallet handle wrapper
 */
export function isWalletHandleWrapper(obj: unknown): obj is WalletHandleWrapper {
  return obj instanceof WalletHandleWrapper;
}

/**
 * Utility to safely get wallet handle from wrapper
 */
export function getWalletHandle(wrapper: unknown): WalletHandle | undefined {
  if (isWalletHandleWrapper(wrapper)) {
    try {
      return wrapper.getHandle();
    } catch {
      return undefined;
    }
  }
  return undefined;
}
