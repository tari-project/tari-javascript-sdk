import { createWallet, destroyAddress, destroyWallet, getAddress } from './ffi';
import {
  AddressHandle,
  AddressInfo,
  TariErrorCode,
  TariFFIError,
  WalletCreateConfig,
  WalletHandle,
} from './types';

// =============================================================================
// MEMORY MANAGEMENT UTILITIES - Mirror iOS RAII Pattern
// These utilities ensure proper resource cleanup like iOS does
// =============================================================================

/**
 * Execute a function with a wallet handle, ensuring cleanup
 * Mirrors iOS RAII pattern for automatic resource management
 *
 * @param config Wallet configuration
 * @param operation Function to execute with wallet handle
 * @returns Result of the operation
 */
export async function withWallet<T>(
  config: WalletCreateConfig,
  operation: (handle: WalletHandle) => Promise<T>
): Promise<T> {
  const handle = createWallet(config);
  try {
    return await operation(handle);
  } finally {
    safeDestroyWallet(handle);
  }
}

/**
 * Execute a function with an address handle, ensuring cleanup
 * Mirrors iOS RAII pattern for address resource management
 *
 * @param walletHandle Wallet handle to get address from
 * @param operation Function to execute with address info
 * @returns Result of the operation
 */
export function withAddress<T>(
  walletHandle: WalletHandle,
  operation: (addressInfo: AddressInfo) => T
): T {
  const addressInfo = getAddress(walletHandle);
  try {
    return operation(addressInfo);
  } finally {
    safeDestroyAddress(addressInfo.handle);
  }
}

/**
 * Safely destroy wallet with error handling
 * Mirrors iOS safe cleanup pattern
 *
 * @param handle Wallet handle to destroy
 */
export function safeDestroyWallet(handle: WalletHandle): void {
  try {
    destroyWallet(handle);
  } catch (error) {
    console.warn('Failed to destroy wallet:', error);
    // Don't throw, just log - this is cleanup code
  }
}

/**
 * Safely destroy address handle with error handling
 * Mirrors iOS safe cleanup pattern
 *
 * @param handle Address handle to destroy
 */
export function safeDestroyAddress(handle: AddressHandle): void {
  try {
    destroyAddress(handle);
  } catch (error) {
    console.warn('Failed to destroy address:', error);
    // Don't throw, just log - this is cleanup code
  }
}

// =============================================================================
// ERROR HANDLING UTILITIES
// =============================================================================

/**
 * Handle FFI errors consistently
 * Mirrors iOS/Android error handling pattern
 *
 * @param errorCode Error code from FFI
 * @param context Context for the error
 * @throws TariFFIError with mapped message
 */
export function handleFFIError(errorCode: number, context: string): never {
  const error = mapErrorCode(errorCode);
  throw new TariFFIError(`${context}: ${error.message}`, error.code);
}

/**
 * Map FFI error codes to human-readable messages
 * Mirrors iOS/Android error mapping
 *
 * @param code Numeric error code
 * @returns Error information
 */
export function mapErrorCode(code: number): { message: string; code: TariErrorCode } {
  switch (code) {
    case TariErrorCode.Success:
      return { message: 'Success', code: TariErrorCode.Success };
    case TariErrorCode.InvalidArgument:
      return { message: 'Invalid argument provided', code: TariErrorCode.InvalidArgument };
    case TariErrorCode.InvalidSeed:
      return { message: 'Invalid seed words', code: TariErrorCode.InvalidSeed };
    case TariErrorCode.NetworkError:
      return { message: 'Network connection error', code: TariErrorCode.NetworkError };
    case TariErrorCode.InsufficientBalance:
      return {
        message: 'Insufficient balance for transaction',
        code: TariErrorCode.InsufficientBalance,
      };
    case TariErrorCode.TransactionError:
      return { message: 'Transaction processing error', code: TariErrorCode.TransactionError };
    case TariErrorCode.DatabaseError:
      return { message: 'Database operation error', code: TariErrorCode.DatabaseError };
    case TariErrorCode.KeyError:
      return { message: 'Cryptographic key error', code: TariErrorCode.KeyError };
    case TariErrorCode.AddressError:
      return { message: 'Address validation error', code: TariErrorCode.AddressError };
    case TariErrorCode.EncryptionError:
      return { message: 'Encryption/decryption error', code: TariErrorCode.EncryptionError };
    case TariErrorCode.ValidationError:
      return { message: 'Data validation error', code: TariErrorCode.ValidationError };
    case TariErrorCode.ConnectionError:
      return { message: 'Connection establishment error', code: TariErrorCode.ConnectionError };
    case TariErrorCode.SyncError:
      return { message: 'Wallet synchronization error', code: TariErrorCode.SyncError };
    case TariErrorCode.ConfigError:
      return { message: 'Configuration error', code: TariErrorCode.ConfigError };
    default:
      return { message: 'Unknown error occurred', code: TariErrorCode.UnknownError };
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS (Like iOS Helper Methods)
// =============================================================================

/**
 * Create a wallet with sensible defaults
 * Mirrors iOS convenience initializers
 *
 * @param seedWords Seed words for wallet
 * @param network Network to use (defaults to Testnet)
 * @returns Wallet handle
 */
export function createDefaultWallet(seedWords: string, network = 0): WalletHandle {
  const config: WalletCreateConfig = {
    seedWords,
    network,
    dbPath: './tari-wallet-db',
    dbName: 'tari_wallet',
  };

  return createWallet(config);
}

/**
 * Validate seed words format
 * Mirrors iOS validation helpers
 *
 * @param seedWords Seed words to validate
 * @returns True if valid format
 */
export function validateSeedWords(seedWords: string): boolean {
  if (!seedWords || typeof seedWords !== 'string') {
    return false;
  }

  const words = seedWords.trim().split(/\s+/);

  // Check word count (common BIP39 lengths)
  const validLengths = [12, 15, 18, 21, 24];
  if (!validLengths.includes(words.length)) {
    return false;
  }

  // Check each word is not empty
  return words.every((word) => word.length > 0);
}

/**
 * Validate emoji ID format
 * Mirrors iOS validation helpers
 *
 * @param emojiId Emoji ID to validate
 * @returns True if valid format
 */
export function validateEmojiId(emojiId: string): boolean {
  if (!emojiId || typeof emojiId !== 'string') {
    return false;
  }

  // Basic format validation - adjust based on actual Tari emoji ID format
  return emojiId.length > 0 && /^[\u{1F000}-\u{1F9FF}]+$/u.test(emojiId);
}

/**
 * Format balance for display
 * Mirrors iOS display helpers
 *
 * @param amount Amount in microTari
 * @param decimals Number of decimal places (default 6)
 * @returns Formatted string
 */
export function formatBalance(amount: bigint, decimals: number = 6): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;

  if (remainder === 0n) {
    return whole.toString();
  }

  const remainderStr = remainder.toString().padStart(decimals, '0');
  const trimmedRemainder = remainderStr.replace(/0+$/, '');

  return `${whole}.${trimmedRemainder}`;
}

/**
 * Parse balance from string
 * Mirrors iOS parsing helpers
 *
 * @param balanceStr Balance string (e.g., "1.234567")
 * @param decimals Number of decimal places (default 6)
 * @returns Amount in microTari
 */
export function parseBalance(balanceStr: string, decimals: number = 6): bigint {
  if (!balanceStr || typeof balanceStr !== 'string') {
    throw new TariFFIError('Invalid balance string', TariErrorCode.InvalidArgument);
  }

  const parts = balanceStr.trim().split('.');
  if (parts.length > 2) {
    throw new TariFFIError('Invalid balance format', TariErrorCode.InvalidArgument);
  }

  try {
    const wholePart = BigInt(parts[0] || '0');
    const decimalPart = parts[1] || '0';

    if (decimalPart.length > decimals) {
      throw new TariFFIError(
        `Too many decimal places (max ${decimals})`,
        TariErrorCode.InvalidArgument
      );
    }

    const paddedDecimal = decimalPart.padEnd(decimals, '0');
    const decimalValue = BigInt(paddedDecimal);
    const multiplier = BigInt(10 ** decimals);

    return wholePart * multiplier + decimalValue;
  } catch (error) {
    throw new TariFFIError('Invalid balance string', TariErrorCode.InvalidArgument);
  }
}

// =============================================================================
// ASYNC UTILITIES (for Promise-based operations)
// =============================================================================

/**
 * Execute wallet operation asynchronously with cleanup
 * Useful for operations that might be long-running
 *
 * @param config Wallet configuration
 * @param operation Async function to execute
 * @returns Promise with result
 */
export async function withWalletAsync<T>(
  config: WalletCreateConfig,
  operation: (handle: WalletHandle) => Promise<T>
): Promise<T> {
  const handle = createWallet(config);
  try {
    return await operation(handle);
  } finally {
    safeDestroyWallet(handle);
  }
}

/**
 * Execute address operation asynchronously with cleanup
 *
 * @param walletHandle Wallet handle
 * @param operation Async function to execute
 * @returns Promise with result
 */
export async function withAddressAsync<T>(
  walletHandle: WalletHandle,
  operation: (addressInfo: AddressInfo) => Promise<T>
): Promise<T> {
  const addressInfo = getAddress(walletHandle);
  try {
    return await operation(addressInfo);
  } finally {
    safeDestroyAddress(addressInfo.handle);
  }
}

// =============================================================================
// RETRY UTILITIES (for network operations)
// =============================================================================

/**
 * Retry an operation with exponential backoff
 * Useful for network operations that might fail temporarily
 *
 * @param operation Function to retry
 * @param maxRetries Maximum number of retries
 * @param baseDelay Base delay in milliseconds
 * @returns Promise with result
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        break;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  if (!lastError) {
    throw new TariFFIError(
      `Operation failed after ${maxRetries + 1} attempts`,
      TariErrorCode.NetworkError,
      { attempts: maxRetries + 1 }
    );
  }

  throw new TariFFIError(
    `Operation failed after ${maxRetries + 1} attempts: ${lastError.message}`,
    TariErrorCode.NetworkError,
    { originalError: lastError, attempts: maxRetries + 1 }
  );
}
