import { binding } from './bindings';
import { 
  WalletHandle, 
  AddressHandle, 
  TariBalance,
  WalletCreateConfig,
  Network,
  TariFFIError,
  TariErrorCode,
  TransactionSendParams,
  isWalletHandle,
  isAddressHandle
} from './ffi-types';

/**
 * Type-safe wrapper around native FFI functions
 * 
 * This class provides a clean, type-safe interface to the underlying
 * native Tari wallet functionality while handling error cases and
 * memory management.
 */
export class FFIWrapper {
  private _initialized = false;

  /**
   * Initialize the FFI wrapper (called automatically)
   */
  initialize(): void {
    if (!this._initialized) {
      binding.initialize();
      this._initialized = true;
    }
  }

  /**
   * Create a new wallet
   * 
   * @param config Wallet configuration including seed words and network
   * @returns Handle to the created wallet
   * @throws TariFFIError if wallet creation fails
   */
  createWallet(config: WalletCreateConfig): WalletHandle {
    this.initialize();
    
    try {
      const handle = binding.walletCreate(config);
      if (!handle || !isWalletHandle(handle)) {
        throw new TariFFIError(
          'Failed to create wallet: Invalid handle returned',
          TariErrorCode.WalletError
        );
      }
      return handle;
    } catch (error) {
      if (error instanceof TariFFIError) {
        throw error;
      }
      throw new TariFFIError(
        `Failed to create wallet: ${error}`,
        TariErrorCode.WalletError,
        { originalError: error, config }
      );
    }
  }
  
  /**
   * Destroy a wallet and free resources
   * 
   * @param handle Wallet handle to destroy
   */
  destroyWallet(handle: WalletHandle): void {
    if (!isWalletHandle(handle)) {
      throw new TariFFIError(
        'Invalid wallet handle',
        TariErrorCode.InvalidArgument
      );
    }

    try {
      binding.walletDestroy(handle);
    } catch (error) {
      throw new TariFFIError(
        `Failed to destroy wallet: ${error}`,
        TariErrorCode.WalletError,
        { handle }
      );
    }
  }
  
  /**
   * Get seed words from wallet
   * 
   * @param handle Wallet handle
   * @returns Seed words as a string
   * @throws TariFFIError if operation fails
   */
  getSeedWords(handle: WalletHandle): string {
    if (!isWalletHandle(handle)) {
      throw new TariFFIError(
        'Invalid wallet handle',
        TariErrorCode.InvalidArgument
      );
    }

    try {
      const words = binding.walletGetSeedWords(handle);
      if (!words || typeof words !== 'string') {
        throw new TariFFIError(
          'Failed to get seed words: Empty response',
          TariErrorCode.WalletError
        );
      }
      return words;
    } catch (error) {
      if (error instanceof TariFFIError) {
        throw error;
      }
      throw new TariFFIError(
        `Failed to get seed words: ${error}`,
        TariErrorCode.WalletError,
        { handle }
      );
    }
  }
  
  /**
   * Get wallet balance
   * 
   * @param handle Wallet handle
   * @returns Balance information with BigInt amounts
   * @throws TariFFIError if operation fails
   */
  getBalance(handle: WalletHandle): TariBalance {
    if (!isWalletHandle(handle)) {
      throw new TariFFIError(
        'Invalid wallet handle',
        TariErrorCode.InvalidArgument
      );
    }

    try {
      const raw = binding.walletGetBalance(handle);
      if (!raw) {
        throw new TariFFIError(
          'Failed to get balance: Empty response',
          TariErrorCode.WalletError
        );
      }

      // Convert string amounts to BigInt
      const balance: TariBalance = {
        available: BigInt(raw.available),
        pending: BigInt(raw.pending),
        locked: BigInt(raw.locked),
        total: BigInt(raw.total),
      };

      // Validate balance consistency
      const calculatedTotal = balance.available + balance.pending + balance.locked;
      if (balance.total !== calculatedTotal) {
        console.warn('Balance total mismatch, using calculated value');
        balance.total = calculatedTotal;
      }

      return balance;
    } catch (error) {
      if (error instanceof TariFFIError) {
        throw error;
      }
      throw new TariFFIError(
        `Failed to get balance: ${error}`,
        TariErrorCode.WalletError,
        { handle }
      );
    }
  }
  
  /**
   * Get wallet address
   * 
   * @param handle Wallet handle
   * @returns Address handle and emoji ID
   * @throws TariFFIError if operation fails
   */
  getAddress(handle: WalletHandle): { handle: AddressHandle; emojiId: string } {
    if (!isWalletHandle(handle)) {
      throw new TariFFIError(
        'Invalid wallet handle',
        TariErrorCode.InvalidArgument
      );
    }

    try {
      const raw = binding.walletGetAddress(handle);
      if (!raw || !isAddressHandle(raw.handle)) {
        throw new TariFFIError(
          'Failed to get address: Invalid response',
          TariErrorCode.AddressError
        );
      }

      return {
        handle: raw.handle,
        emojiId: raw.emojiId || '',
      };
    } catch (error) {
      if (error instanceof TariFFIError) {
        throw error;
      }
      throw new TariFFIError(
        `Failed to get address: ${error}`,
        TariErrorCode.AddressError,
        { handle }
      );
    }
  }
  
  /**
   * Send transaction
   * 
   * @param wallet Wallet handle
   * @param params Transaction parameters
   * @returns Transaction ID
   * @throws TariFFIError if operation fails
   */
  async sendTransaction(
    wallet: WalletHandle,
    params: TransactionSendParams
  ): Promise<string> {
    if (!isWalletHandle(wallet)) {
      throw new TariFFIError(
        'Invalid wallet handle',
        TariErrorCode.InvalidArgument
      );
    }

    // Validate parameters
    if (!params.destination || typeof params.destination !== 'string') {
      throw new TariFFIError(
        'Invalid destination address',
        TariErrorCode.InvalidArgument
      );
    }

    if (params.amount <= 0n) {
      throw new TariFFIError(
        'Amount must be greater than zero',
        TariErrorCode.InvalidArgument
      );
    }

    try {
      const sendParams = {
        destination: params.destination,
        amount: params.amount.toString(),
        feePerGram: (params.feePerGram || 5n).toString(),
        message: params.message || '',
        oneSided: params.oneSided !== false, // Default to true
      };

      const txId = binding.walletSendTransaction(wallet, sendParams);
      if (!txId || typeof txId !== 'string') {
        throw new TariFFIError(
          'Failed to send transaction: Invalid transaction ID',
          TariErrorCode.TransactionError
        );
      }

      return txId;
    } catch (error) {
      if (error instanceof TariFFIError) {
        throw error;
      }
      throw new TariFFIError(
        `Failed to send transaction: ${error}`,
        TariErrorCode.TransactionError,
        { wallet, params }
      );
    }
  }
  
  /**
   * Clean up address handle
   * 
   * @param handle Address handle to destroy
   */
  destroyAddress(handle: AddressHandle): void {
    if (!isAddressHandle(handle)) {
      throw new TariFFIError(
        'Invalid address handle',
        TariErrorCode.InvalidArgument
      );
    }

    try {
      binding.addressDestroy(handle);
    } catch (error) {
      throw new TariFFIError(
        `Failed to destroy address: ${error}`,
        TariErrorCode.AddressError,
        { handle }
      );
    }
  }

  /**
   * Register a callback function
   * 
   * @param callback Function to call when events occur
   * @returns Callback ID for later unregistration
   */
  registerCallback(callback: Function): number {
    try {
      const id = binding.registerCallback(callback);
      if (typeof id !== 'number' || id <= 0) {
        throw new TariFFIError(
          'Failed to register callback: Invalid ID',
          TariErrorCode.ValidationError
        );
      }
      return id;
    } catch (error) {
      if (error instanceof TariFFIError) {
        throw error;
      }
      throw new TariFFIError(
        `Failed to register callback: ${error}`,
        TariErrorCode.ValidationError
      );
    }
  }

  /**
   * Unregister a callback function
   * 
   * @param id Callback ID to unregister
   * @returns True if callback was found and removed
   */
  unregisterCallback(id: number): boolean {
    try {
      return binding.unregisterCallback(id);
    } catch (error) {
      throw new TariFFIError(
        `Failed to unregister callback: ${error}`,
        TariErrorCode.ValidationError,
        { id }
      );
    }
  }

  /**
   * Clear all registered callbacks
   */
  clearAllCallbacks(): void {
    try {
      binding.clearAllCallbacks();
    } catch (error) {
      throw new TariFFIError(
        `Failed to clear callbacks: ${error}`,
        TariErrorCode.ValidationError
      );
    }
  }

  /**
   * Get the number of currently registered callbacks
   * 
   * @returns Number of registered callbacks
   */
  getCallbackCount(): number {
    try {
      return binding.getCallbackCount();
    } catch (error) {
      throw new TariFFIError(
        `Failed to get callback count: ${error}`,
        TariErrorCode.ValidationError
      );
    }
  }

  /**
   * Check if the wrapper is initialized
   */
  get isInitialized(): boolean {
    return this._initialized;
  }
}

// Convenience functions for common operations

/**
 * Create a wallet with default configuration
 * 
 * @param seedWords Seed words for wallet generation
 * @param network Network to use (defaults to Testnet)
 * @returns Wallet handle
 */
export function createDefaultWallet(
  seedWords: string, 
  network: Network = Network.Testnet
): WalletHandle {
  const config: WalletCreateConfig = {
    seedWords,
    network,
    dbPath: './tari-wallet-db',
    dbName: 'tari_wallet',
  };
  
  return ffi.createWallet(config);
}

/**
 * Create a mainnet wallet
 * 
 * @param seedWords Seed words for wallet generation
 * @returns Wallet handle
 */
export function createMainnetWallet(seedWords: string): WalletHandle {
  return createDefaultWallet(seedWords, Network.Mainnet);
}

/**
 * Create a testnet wallet
 * 
 * @param seedWords Seed words for wallet generation
 * @returns Wallet handle
 */
export function createTestnetWallet(seedWords: string): WalletHandle {
  return createDefaultWallet(seedWords, Network.Testnet);
}

/**
 * Safely destroy wallet with error handling
 * 
 * @param handle Wallet handle to destroy
 */
export function safeDestroyWallet(handle: WalletHandle): void {
  try {
    ffi.destroyWallet(handle);
  } catch (error) {
    console.warn('Failed to destroy wallet:', error);
  }
}

// Export singleton instance
export const ffi = new FFIWrapper();

// Auto-initialize on import
ffi.initialize();
