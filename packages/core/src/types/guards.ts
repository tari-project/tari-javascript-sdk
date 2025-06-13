/**
 * @fileoverview Type guards and runtime validation for the Tari JavaScript SDK
 * 
 * Provides runtime type checking functions that inform TypeScript's type system
 * about the actual types of values at runtime.
 */

import type {
  NetworkType,
  LogLevel,
  TransactionStatus,
  TransactionDirection,
  UtxoStatus,
  OutputFeatures,
  ConnectivityStatus,
  AddressFormat
} from './enums';
import type {
  MicroTari,
  TransactionId,
  TariAddressString,
  EmojiId,
  Base58Address,
  HexAddress,
  UnixTimestamp,
  BlockHeight
} from './branded';
import type {
  Balance,
  BalanceInfo
} from './balance';
import type {
  Transaction,
  TransactionInfo,
  PendingInboundTransaction,
  PendingOutboundTransaction,
  CompletedTransaction,
  CancelledTransaction,
  CoinbaseTransaction
} from './transaction';
import type { Contact } from './contact';
import type { UtxoInfo } from './utxo';
import type { WalletConfig } from './wallet-config';
import type { WalletEvent } from './events';

// Basic type guards for primitives and branded types

/**
 * Check if value is a valid NetworkType
 */
export function isNetworkType(value: unknown): value is NetworkType {
  return typeof value === 'string' && 
         ['mainnet', 'testnet', 'nextnet'].includes(value);
}

/**
 * Check if value is a valid LogLevel
 */
export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'number' && 
         Number.isInteger(value) && 
         value >= 0 && 
         value <= 4;
}

/**
 * Check if value is a valid TransactionStatus
 */
export function isTransactionStatus(value: unknown): value is TransactionStatus {
  return typeof value === 'string' && 
         ['pending', 'broadcast', 'mined_unconfirmed', 'mined_confirmed', 'imported', 'coinbase', 'cancelled', 'unknown'].includes(value);
}

/**
 * Check if value is a valid TransactionDirection
 */
export function isTransactionDirection(value: unknown): value is TransactionDirection {
  return typeof value === 'string' && 
         ['inbound', 'outbound'].includes(value);
}

/**
 * Check if value is a valid UtxoStatus
 */
export function isUtxoStatus(value: unknown): value is UtxoStatus {
  return typeof value === 'string' && 
         ['unspent', 'spent', 'encumbered_to_be_received', 'encumbered_to_be_spent', 'invalid', 'abandoned', 'unknown'].includes(value);
}

/**
 * Check if value is a valid OutputFeatures
 */
export function isOutputFeatures(value: unknown): value is OutputFeatures {
  return typeof value === 'string' && 
         ['default', 'coinbase', 'sidechain', 'burn_commitment'].includes(value);
}

/**
 * Check if value is a valid ConnectivityStatus
 */
export function isConnectivityStatus(value: unknown): value is ConnectivityStatus {
  return typeof value === 'string' && 
         ['initializing', 'online', 'connecting', 'offline'].includes(value);
}

/**
 * Check if value is a valid AddressFormat
 */
export function isAddressFormat(value: unknown): value is AddressFormat {
  return typeof value === 'string' && 
         ['emoji', 'base58', 'hex'].includes(value);
}

/**
 * Check if value is a valid MicroTari amount
 */
export function isMicroTari(value: unknown): value is MicroTari {
  return typeof value === 'bigint' && value >= 0n;
}

/**
 * Check if value is a valid TransactionId
 */
export function isTransactionId(value: unknown): value is TransactionId {
  return typeof value === 'bigint' && value > 0n;
}

/**
 * Check if value is a valid Tari address string
 */
export function isTariAddressString(value: unknown): value is TariAddressString {
  if (typeof value !== 'string' || value.length === 0) {
    return false;
  }

  // Basic format detection
  const trimmed = value.trim();
  
  // Check emoji format (33 emoji characters)
  const emojiRegex = /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]{33}$/u;
  if (emojiRegex.test(trimmed)) {
    return true;
  }

  // Check base58 format
  const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{32,64}$/;
  if (base58Regex.test(trimmed)) {
    return true;
  }

  // Check hex format (with or without 0x prefix)
  const hexRegex = /^(0x)?[0-9a-fA-F]{64}$/;
  if (hexRegex.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Check if value is a valid EmojiId
 */
export function isEmojiId(value: unknown): value is EmojiId {
  if (typeof value !== 'string') return false;
  
  const emojiArray = Array.from(value);
  return emojiArray.length === 33 && 
         emojiArray.every(char => /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(char));
}

// Address validation functions are available in address.js

/**
 * Check if value is a valid UnixTimestamp
 */
export function isUnixTimestamp(value: unknown): value is UnixTimestamp {
  return typeof value === 'number' && 
         Number.isInteger(value) && 
         value > 0 && 
         value <= Date.now() + 86400000; // Allow up to 1 day in future
}

/**
 * Check if value is a valid BlockHeight
 */
export function isBlockHeight(value: unknown): value is BlockHeight {
  return typeof value === 'bigint' && value >= 0n;
}

// Complex type guards for objects

/**
 * Check if value is a valid Balance object
 */
export function isBalance(value: unknown): value is Balance {
  return isObject(value) &&
         isMicroTari(value.available) &&
         isMicroTari(value.pendingIncoming) &&
         isMicroTari(value.pendingOutgoing) &&
         isMicroTari(value.timelocked);
}

/**
 * Check if value is a valid BalanceInfo object
 */
export function isBalanceInfo(value: unknown): value is BalanceInfo {
  return isBalance(value) &&
         isMicroTari((value as any).total) &&
         isMicroTari((value as any).spendable) &&
         isMicroTari((value as any).projected) &&
         isUnixTimestamp((value as any).lastUpdated);
}

/**
 * Check if value is a valid TransactionInfo object
 */
export function isTransactionInfo(value: unknown): value is TransactionInfo {
  return isObject(value) &&
         isTransactionId(value.id) &&
         isMicroTari(value.amount) &&
         isMicroTari(value.fee) &&
         isTransactionStatus(value.status) &&
         isTransactionDirection(value.direction) &&
         typeof value.message === 'string' &&
         isUnixTimestamp(value.timestamp) &&
         isTariAddressString(value.address) &&
         typeof value.isOneSided === 'boolean' &&
         typeof value.isCoinbase === 'boolean';
}

/**
 * Check if value is a valid Transaction object
 */
export function isTransaction(value: unknown): value is Transaction {
  return isTransactionInfo(value);
}

/**
 * Check if value is a PendingInboundTransaction
 */
export function isPendingInboundTransaction(value: unknown): value is PendingInboundTransaction {
  return isTransactionInfo(value) &&
         value.status === 'pending' &&
         value.direction === 'inbound';
}

/**
 * Check if value is a PendingOutboundTransaction
 */
export function isPendingOutboundTransaction(value: unknown): value is PendingOutboundTransaction {
  return isTransactionInfo(value) &&
         value.status === 'pending' &&
         value.direction === 'outbound';
}

/**
 * Check if value is a CompletedTransaction
 */
export function isCompletedTransaction(value: unknown): value is CompletedTransaction {
  return isTransactionInfo(value) &&
         ['mined_confirmed', 'mined_unconfirmed', 'broadcast', 'imported'].includes(value.status) &&
         typeof (value as any).confirmations === 'number' &&
         isBlockHeight((value as any).blockHeight);
}

/**
 * Check if value is a CancelledTransaction
 */
export function isCancelledTransaction(value: unknown): value is CancelledTransaction {
  return isTransactionInfo(value) &&
         value.status === 'cancelled';
}

/**
 * Check if value is a CoinbaseTransaction
 */
export function isCoinbaseTransaction(value: unknown): value is CoinbaseTransaction {
  return isTransactionInfo(value) &&
         value.status === 'coinbase' &&
         value.direction === 'inbound' &&
         value.isCoinbase === true;
}

/**
 * Check if value is a valid Contact object
 */
export function isContact(value: unknown): value is Contact {
  return isObject(value) &&
         typeof value.id === 'string' &&
         typeof value.alias === 'string' &&
         isTariAddressString(value.address) &&
         typeof value.isFavorite === 'boolean' &&
         Array.isArray(value.tags) &&
         value.tags.every((tag: unknown) => typeof tag === 'string') &&
         isObject(value.metadata) &&
         isUnixTimestamp(value.createdAt) &&
         isUnixTimestamp(value.updatedAt);
}

/**
 * Check if value is a valid UtxoInfo object
 */
export function isUtxoInfo(value: unknown): value is UtxoInfo {
  return isObject(value) &&
         typeof value.id === 'string' &&
         isMicroTari(value.amount) &&
         typeof value.commitment === 'string' &&
         isOutputFeatures(value.features) &&
         isUtxoStatus(value.status) &&
         isBlockHeight(value.blockHeight) &&
         isBlockHeight(value.maturityHeight) &&
         typeof value.transactionHash === 'string' &&
         typeof value.outputIndex === 'number' &&
         isUnixTimestamp(value.detectedAt) &&
         isUnixTimestamp(value.updatedAt);
}

// WalletConfig validation function is available in wallet-config.js

/**
 * Check if value is a valid WalletEvent object
 */
export function isWalletEvent(value: unknown): value is WalletEvent {
  return isObject(value) &&
         typeof value.type === 'string' &&
         isUnixTimestamp(value.timestamp) &&
         typeof value.source === 'string' &&
         typeof value.sequence === 'number';
}

// Utility type guards

/**
 * Check if value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Check if value is a positive number
 */
export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && Number.isFinite(value);
}

/**
 * Check if value is a non-negative number
 */
export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && Number.isFinite(value);
}

/**
 * Check if value is a positive integer
 */
export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Check if value is a non-negative integer
 */
export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Check if value is a positive bigint
 */
export function isPositiveBigInt(value: unknown): value is bigint {
  return typeof value === 'bigint' && value > 0n;
}

/**
 * Check if value is a non-negative bigint
 */
export function isNonNegativeBigInt(value: unknown): value is bigint {
  return typeof value === 'bigint' && value >= 0n;
}

/**
 * Check if value is a valid date
 */
export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Check if value is a valid URL string
 */
export function isValidUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if value is a valid email string
 */
export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && 
         /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Check if value is a valid hex string
 */
export function isHexString(value: unknown): value is string {
  return typeof value === 'string' && 
         /^(0x)?[0-9a-fA-F]+$/.test(value);
}

/**
 * Check if value is a valid base64 string
 */
export function isBase64String(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  
  try {
    return btoa(atob(value)) === value;
  } catch {
    return false;
  }
}

// Array type guards

/**
 * Check if value is an array of specific type
 */
export function isArrayOf<T>(
  value: unknown, 
  itemGuard: (item: unknown) => item is T
): value is T[] {
  return Array.isArray(value) && value.every(itemGuard);
}

/**
 * Check if value is an array of strings
 */
export function isStringArray(value: unknown): value is string[] {
  return isArrayOf(value, (item): item is string => typeof item === 'string');
}

/**
 * Check if value is an array of numbers
 */
export function isNumberArray(value: unknown): value is number[] {
  return isArrayOf(value, (item): item is number => typeof item === 'number');
}

/**
 * Check if value is an array of transactions
 */
export function isTransactionArray(value: unknown): value is Transaction[] {
  return isArrayOf(value, isTransaction);
}

/**
 * Check if value is an array of contacts
 */
export function isContactArray(value: unknown): value is Contact[] {
  return isArrayOf(value, isContact);
}

/**
 * Check if value is an array of UTXOs
 */
export function isUtxoArray(value: unknown): value is UtxoInfo[] {
  return isArrayOf(value, isUtxoInfo);
}

// Optional type guards

/**
 * Check if value is undefined or matches the type guard
 */
export function isOptional<T>(
  value: unknown,
  guard: (value: unknown) => value is T
): value is T | undefined {
  return value === undefined || guard(value);
}

/**
 * Check if value is null, undefined, or matches the type guard
 */
export function isNullable<T>(
  value: unknown,
  guard: (value: unknown) => value is T
): value is T | null | undefined {
  return value == null || guard(value);
}

// Union type guards

/**
 * Check if value matches any of the provided type guards
 */
export function isOneOf<T extends readonly any[]>(
  value: unknown,
  ...guards: { [K in keyof T]: (value: unknown) => value is T[K] }
): value is T[number] {
  return guards.some(guard => guard(value));
}

// Generic validation helpers

/**
 * Assert that value matches type guard, throw if not
 */
export function assertType<T>(
  value: unknown,
  guard: (value: unknown) => value is T,
  message?: string
): asserts value is T {
  if (!guard(value)) {
    throw new TypeError(message || `Value does not match expected type`);
  }
}

/**
 * Safely cast value to type if it matches guard
 */
export function safeCast<T>(
  value: unknown,
  guard: (value: unknown) => value is T
): T | null {
  return guard(value) ? value : null;
}

/**
 * Cast value to type with default fallback
 */
export function castWithDefault<T>(
  value: unknown,
  guard: (value: unknown) => value is T,
  defaultValue: T
): T {
  return guard(value) ? value : defaultValue;
}

/**
 * Validate and transform value
 */
export function validateAndTransform<T, U>(
  value: unknown,
  guard: (value: unknown) => value is T,
  transformer: (value: T) => U
): U | null {
  if (guard(value)) {
    return transformer(value);
  }
  return null;
}

// Composite validators for complex validation logic

/**
 * Validate object with multiple required fields
 */
export function validateObjectFields<T extends Record<string, unknown>>(
  value: unknown,
  validators: { [K in keyof T]: (value: unknown) => value is T[K] }
): value is T {
  if (!isObject(value)) return false;
  
  for (const [key, validator] of Object.entries(validators)) {
    if (!validator(value[key])) {
      return false;
    }
  }
  
  return true;
}

/**
 * Validate object with optional fields
 */
export function validateObjectWithOptionalFields<
  T extends Record<string, unknown>,
  O extends Record<string, unknown>
>(
  value: unknown,
  requiredValidators: { [K in keyof T]: (value: unknown) => value is T[K] },
  optionalValidators: { [K in keyof O]: (value: unknown) => value is O[K] }
): value is T & Partial<O> {
  if (!isObject(value)) return false;
  
  // Validate required fields
  for (const [key, validator] of Object.entries(requiredValidators)) {
    if (!validator(value[key])) {
      return false;
    }
  }
  
  // Validate optional fields if present
  for (const [key, validator] of Object.entries(optionalValidators)) {
    if (value[key] !== undefined && !validator(value[key])) {
      return false;
    }
  }
  
  return true;
}
