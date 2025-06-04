/**
 * Utility functions for Tari core operations
 */

import { TariErrorCode } from './ffi-types';

/**
 * Convert a hex string to a Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.replace(/^0x/, '');
  if (cleanHex.length % 2 !== 0) {
    throw new Error('Invalid hex string: must have even length');
  }
  
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Convert a Uint8Array to a hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validate a Tari emoji ID format
 */
export function isValidEmojiId(emojiId: string): boolean {
  // Basic validation for emoji ID format
  // Should be emojis separated by spaces or no spaces
  const emojiRegex = /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u;
  return emojiRegex.test(emojiId.replace(/\s/g, ''));
}

/**
 * Validate a Tari address (emoji ID or hex format)
 */
export function validateAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }
  
  // Check if it's an emoji address
  if (/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(address)) {
    // Should have at least 8 emojis for a valid address
    const emojiCount = [...address].filter(char => 
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(char)
    ).length;
    return emojiCount >= 8;
  }
  
  // Check if it's a hex address (at least 32 chars)
  const cleanHex = address.replace(/^0x/, '');
  return /^[0-9a-fA-F]{32,}$/.test(cleanHex);
}

/**
 * Validate a hex public key
 */
export function isValidPublicKey(publicKey: string): boolean {
  const cleanKey = publicKey.replace(/^0x/, '');
  return /^[0-9a-fA-F]{64}$/.test(cleanKey);
}

/**
 * Validate a hex private key
 */
export function isValidPrivateKey(privateKey: string): boolean {
  const cleanKey = privateKey.replace(/^0x/, '');
  return /^[0-9a-fA-F]{64}$/.test(cleanKey);
}

/**
 * Convert BigInt to string with proper handling
 */
export function bigIntToString(value: bigint): string {
  return value.toString();
}

/**
 * Convert string to BigInt with validation
 */
export function stringToBigInt(value: string): bigint {
  try {
    return BigInt(value);
  } catch (error) {
    throw new Error(`Invalid number format: ${value}`);
  }
}

/**
 * Safe number conversion that handles potential overflow
 */
export function safeNumberConversion(value: string | number | bigint): number {
  if (typeof value === 'number') {
    return value;
  }
  
  if (typeof value === 'string') {
    const num = parseInt(value, 10);
    if (isNaN(num)) {
      throw new Error(`Invalid number: ${value}`);
    }
    return num;
  }
  
  if (typeof value === 'bigint') {
    if (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER) {
      throw new Error(`Number overflow: ${value}`);
    }
    return Number(value);
  }
  
  throw new Error(`Unsupported type for number conversion: ${typeof value}`);
}

/**
 * Format a Tari amount for display (microTari to Tari)
 */
export function formatTariAmount(microTari: bigint | string, decimals: number = 6): string {
  const amount = typeof microTari === 'string' ? BigInt(microTari) : microTari;
  const divisor = BigInt(10 ** decimals);
  const wholePart = amount / divisor;
  const fractionalPart = amount % divisor;
  
  if (fractionalPart === 0n) {
    return wholePart.toString();
  }
  
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  const trimmed = fractionalStr.replace(/0+$/, '');
  
  return trimmed ? `${wholePart}.${trimmed}` : wholePart.toString();
}

/**
 * Format a Tari amount for display with XTR suffix (microTari to Tari)
 */
export function formatTari(microTari: bigint | string, decimals: number = 6): string {
  const amount = typeof microTari === 'string' ? BigInt(microTari) : microTari;
  const divisor = BigInt(10 ** decimals);
  const wholePart = amount / divisor;
  const fractionalPart = amount % divisor;
  
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  return `${wholePart}.${fractionalStr} XTR`;
}

/**
 * Parse a Tari amount from string (Tari to microTari)
 */
export function parseTariAmount(amount: string, decimals: number = 6): bigint {
  const [wholePart, fractionalPart = ''] = amount.split('.');
  
  if (fractionalPart.length > decimals) {
    throw new Error(`Too many decimal places: maximum ${decimals} allowed`);
  }
  
  const paddedFractional = fractionalPart.padEnd(decimals, '0');
  const microTari = BigInt(wholePart + paddedFractional);
  
  return microTari;
}

/**
 * Parse a Tari amount from string (Tari to microTari) with validation
 */
export function parseTari(amount: string, decimals: number = 6): bigint {
  if (!amount || typeof amount !== 'string') {
    throw new Error('Invalid Tari amount format');
  }
  
  // Remove any whitespace
  const cleanAmount = amount.trim();
  
  // Check for multiple decimal points
  const parts = cleanAmount.split('.');
  if (parts.length > 2) {
    throw new Error('Invalid Tari amount format');
  }
  
  // Validate numeric format
  if (!/^\d+(\.\d+)?$/.test(cleanAmount)) {
    throw new Error('Invalid Tari amount format');
  }
  
  return parseTariAmount(cleanAmount, decimals);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an operation with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  backoffFactor: number = 2
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries - 1) {
        break;
      }
      
      const delay = initialDelay * Math.pow(backoffFactor, attempt);
      await sleep(delay);
    }
  }
  
  throw lastError!;
}

/**
 * Create a timeout promise that rejects after specified time
 */
export function createTimeout<T>(ms: number, message?: string): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message || `Operation timed out after ${ms}ms`));
    }, ms);
  });
}

/**
 * Race a promise against a timeout
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message?: string): Promise<T> {
  return Promise.race([
    promise,
    createTimeout<T>(timeoutMs, message)
  ]);
}

/**
 * Convert error code to human readable message
 */
export function getErrorMessage(code: TariErrorCode): string {
  switch (code) {
    case TariErrorCode.NoError:
      return 'No error';
    case TariErrorCode.InvalidArgument:
      return 'Invalid argument provided';
    case TariErrorCode.InvalidSeed:
      return 'Invalid seed phrase';
    case TariErrorCode.NetworkError:
      return 'Network error occurred';
    case TariErrorCode.InsufficientBalance:
      return 'Insufficient balance for transaction';
    case TariErrorCode.TransactionError:
      return 'Transaction error';
    case TariErrorCode.DatabaseError:
      return 'Database error';
    case TariErrorCode.KeyError:
      return 'Cryptographic key error';
    case TariErrorCode.AddressError:
      return 'Address validation error';
    case TariErrorCode.EncryptionError:
      return 'Encryption/decryption error';
    case TariErrorCode.ValidationError:
      return 'Validation error';
    case TariErrorCode.ConnectionError:
      return 'Connection error';
    case TariErrorCode.SyncError:
      return 'Synchronization error';
    case TariErrorCode.ConfigError:
      return 'Configuration error';
    case TariErrorCode.UnknownError:
    default:
      return 'Unknown error occurred';
  }
}

// BIP39 word list subset for testing (in production this would be the full list)
const BIP39_WORDLIST = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
  'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
  'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
  'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
  'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
  'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album',
  'alcohol', 'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone',
  'alpha', 'already', 'also', 'alter', 'always', 'amateur', 'amazing', 'among',
  // ... would continue with full 2048 word list in production
  'zone', 'zoo'
];

/**
 * Generate BIP39 seed words for wallet creation
 */
export function generateSeedWords(wordCount: number = 24): string {
  const validCounts = [12, 15, 18, 21, 24];
  
  if (!validCounts.includes(wordCount)) {
    throw new Error('Invalid word count. Must be 12, 15, 18, 21, or 24');
  }
  
  const words: string[] = [];
  
  for (let i = 0; i < wordCount; i++) {
    const randomIndex = Math.floor(Math.random() * BIP39_WORDLIST.length);
    words.push(BIP39_WORDLIST[randomIndex]);
  }
  
  return words.join(' ');
}
