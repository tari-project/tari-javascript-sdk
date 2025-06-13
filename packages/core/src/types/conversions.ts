/**
 * @fileoverview Type-safe conversion functions for FFI boundaries
 * 
 * Provides explicit conversion functions for crossing FFI boundaries
 * while maintaining branded type safety in TypeScript code.
 */

import type { 
  MicroTari, 
  TransactionId, 
  WalletHandle,
  BlockHeight,
  TariAddressString,
  PublicKey,
  Signature,
  Hash,
  Commitment,
  UnixTimestamp
} from './branded';

// FFI Conversion Functions for bigint-based branded types

/**
 * Convert MicroTari to bigint for FFI calls
 */
export function microTariToFFI(value: MicroTari): bigint {
  return value as bigint;
}

/**
 * Convert bigint from FFI to MicroTari with validation
 */
export function microTariFromFFI(value: bigint): MicroTari {
  if (value < 0n) {
    throw new Error('MicroTari amount cannot be negative');
  }
  return value as MicroTari;
}

/**
 * Convert TransactionId to bigint for FFI calls
 */
export function transactionIdToFFI(value: TransactionId): bigint {
  return value as bigint;
}

/**
 * Convert bigint from FFI to TransactionId
 */
export function transactionIdFromFFI(value: bigint): TransactionId {
  return value as TransactionId;
}

/**
 * Convert WalletHandle to bigint for FFI calls
 */
export function walletHandleToFFI(value: WalletHandle): bigint {
  return value as bigint;
}

/**
 * Convert bigint from FFI to WalletHandle
 */
export function walletHandleFromFFI(value: bigint): WalletHandle {
  if (value <= 0n) {
    throw new Error('Invalid wallet handle: must be positive');
  }
  return value as WalletHandle;
}

/**
 * Convert BlockHeight to bigint for FFI calls
 */
export function blockHeightToFFI(value: BlockHeight): bigint {
  return value as bigint;
}

/**
 * Convert bigint from FFI to BlockHeight
 */
export function blockHeightFromFFI(value: bigint): BlockHeight {
  if (value < 0n) {
    throw new Error('BlockHeight cannot be negative');
  }
  return value as BlockHeight;
}

// FFI Conversion Functions for string-based branded types

/**
 * Convert TariAddressString to string for FFI calls
 */
export function tariAddressToFFI(value: TariAddressString): string {
  return value as string;
}

/**
 * Convert string from FFI to TariAddressString with basic validation
 */
export function tariAddressFromFFI(value: string): TariAddressString {
  if (!value || typeof value !== 'string') {
    throw new Error('Invalid Tari address: must be non-empty string');
  }
  return value as TariAddressString;
}

/**
 * Convert PublicKey to string for FFI calls
 */
export function publicKeyToFFI(value: PublicKey): string {
  return value as string;
}

/**
 * Convert string from FFI to PublicKey with basic validation
 */
export function publicKeyFromFFI(value: string): PublicKey {
  if (!value || typeof value !== 'string') {
    throw new Error('Invalid public key: must be non-empty string');
  }
  return value as PublicKey;
}

/**
 * Convert Signature to string for FFI calls
 */
export function signatureToFFI(value: Signature): string {
  return value as string;
}

/**
 * Convert string from FFI to Signature with basic validation
 */
export function signatureFromFFI(value: string): Signature {
  if (!value || typeof value !== 'string') {
    throw new Error('Invalid signature: must be non-empty string');
  }
  return value as Signature;
}

/**
 * Convert Hash to string for FFI calls
 */
export function hashToFFI(value: Hash): string {
  return value as string;
}

/**
 * Convert string from FFI to Hash with basic validation
 */
export function hashFromFFI(value: string): Hash {
  if (!value || typeof value !== 'string') {
    throw new Error('Invalid hash: must be non-empty string');
  }
  return value as Hash;
}

/**
 * Convert Commitment to string for FFI calls
 */
export function commitmentToFFI(value: Commitment): string {
  return value as string;
}

/**
 * Convert string from FFI to Commitment with basic validation
 */
export function commitmentFromFFI(value: string): Commitment {
  if (!value || typeof value !== 'string') {
    throw new Error('Invalid commitment: must be non-empty string');
  }
  return value as Commitment;
}

// FFI Conversion Functions for number-based branded types

/**
 * Convert UnixTimestamp to number for FFI calls
 */
export function unixTimestampToFFI(value: UnixTimestamp): number {
  return value as number;
}

/**
 * Convert number from FFI to UnixTimestamp with basic validation
 */
export function unixTimestampFromFFI(value: number): UnixTimestamp {
  if (value < 0 || !Number.isInteger(value)) {
    throw new Error('Invalid timestamp: must be non-negative integer');
  }
  return value as UnixTimestamp;
}

// Array conversion helpers

/**
 * Convert array of branded values to array of base values for FFI
 */
export function arrayToFFI<T, U>(
  values: T[],
  converter: (value: T) => U
): U[] {
  return values.map(converter);
}

/**
 * Convert array of base values from FFI to array of branded values
 */
export function arrayFromFFI<T, U>(
  values: T[],
  converter: (value: T) => U
): U[] {
  return values.map(converter);
}

// Optional conversion helpers

/**
 * Convert optional branded value to optional base value for FFI
 */
export function optionalToFFI<T, U>(
  value: T | undefined,
  converter: (value: T) => U
): U | undefined {
  return value !== undefined ? converter(value) : undefined;
}

/**
 * Convert optional base value from FFI to optional branded value
 */
export function optionalFromFFI<T, U>(
  value: T | undefined,
  converter: (value: T) => U
): U | undefined {
  return value !== undefined ? converter(value) : undefined;
}

// Bulk conversion helpers for common patterns

/**
 * Convert MicroTari amounts in transaction data to FFI format
 */
export function transactionAmountsToFFI(transaction: {
  amount: MicroTari;
  fee?: MicroTari;
}): {
  amount: bigint;
  fee?: bigint;
} {
  return {
    amount: microTariToFFI(transaction.amount),
    fee: transaction.fee ? microTariToFFI(transaction.fee) : undefined
  };
}

/**
 * Convert transaction amounts from FFI to branded format
 */
export function transactionAmountsFromFFI(ffiTransaction: {
  amount: bigint;
  fee?: bigint;
}): {
  amount: MicroTari;
  fee?: MicroTari;
} {
  return {
    amount: microTariFromFFI(ffiTransaction.amount),
    fee: ffiTransaction.fee ? microTariFromFFI(ffiTransaction.fee) : undefined
  };
}

// Type-safe wrappers for JSON serialization across FFI

/**
 * Serialize branded bigint for JSON transmission across FFI
 */
export function serializeBrandedBigintForFFI<T extends bigint>(value: T): string {
  return (value as bigint).toString();
}

/**
 * Deserialize branded bigint from JSON transmission across FFI
 */
export function deserializeBrandedBigintFromFFI<T>(serialized: string): T {
  const bigintValue = BigInt(serialized);
  return bigintValue as T;
}

/**
 * Type predicate to check if FFI value can be converted to MicroTari
 */
export function isValidMicroTariFromFFI(value: unknown): value is bigint {
  return typeof value === 'bigint' && value >= 0n;
}

/**
 * Type predicate to check if FFI value can be converted to TransactionId
 */
export function isValidTransactionIdFromFFI(value: unknown): value is bigint {
  return typeof value === 'bigint';
}

/**
 * Type predicate to check if FFI value can be converted to WalletHandle
 */
export function isValidWalletHandleFromFFI(value: unknown): value is bigint {
  return typeof value === 'bigint' && value > 0n;
}

/**
 * Safe conversion from FFI value to MicroTari with error handling
 */
export function safeMicroTariFromFFI(value: unknown): MicroTari | null {
  if (isValidMicroTariFromFFI(value)) {
    return microTariFromFFI(value);
  }
  return null;
}

/**
 * Safe conversion from FFI value to TransactionId with error handling
 */
export function safeTransactionIdFromFFI(value: unknown): TransactionId | null {
  if (isValidTransactionIdFromFFI(value)) {
    return transactionIdFromFFI(value);
  }
  return null;
}

/**
 * Safe conversion from FFI value to WalletHandle with error handling
 */
export function safeWalletHandleFromFFI(value: unknown): WalletHandle | null {
  if (isValidWalletHandleFromFFI(value)) {
    return walletHandleFromFFI(value);
  }
  return null;
}
