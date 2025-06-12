/**
 * @fileoverview Branded types and type utilities for the Tari JavaScript SDK
 * 
 * Implements type-safe branded types using unique symbols to prevent
 * mixing of logically different values that share the same primitive type.
 */

// Base brand infrastructure using unique symbols
declare const __brand: unique symbol;
export type Brand<T, B> = T & { readonly [__brand]: B };

// Utility type for creating branded types
export type Branded<T, B extends string> = Brand<T, B>;

// Core branded types for Tari wallet operations

// Transaction identifiers
export type TransactionId = Branded<bigint, 'TransactionId'>;
export type PendingTransactionId = Branded<bigint, 'PendingTransactionId'>;

// Amount types
export type MicroTari = Branded<bigint, 'MicroTari'>;
export type Tari = Branded<number, 'Tari'>;

// Address types  
export type TariAddressString = Branded<string, 'TariAddress'>;
export type EmojiId = Branded<string, 'EmojiId'>;
export type Base58Address = Branded<string, 'Base58Address'>;
export type HexAddress = Branded<string, 'HexAddress'>;

// Cryptographic types
export type PublicKey = Branded<string, 'PublicKey'>;
export type PrivateKey = Branded<string, 'PrivateKey'>;
export type Signature = Branded<string, 'Signature'>;
export type Commitment = Branded<string, 'Commitment'>;
export type Hash = Branded<string, 'Hash'>;

// Handle types for FFI resources
export type WalletHandle = Branded<bigint, 'WalletHandle'>;
export type BalanceHandle = Branded<bigint, 'BalanceHandle'>;
export type ContactHandle = Branded<bigint, 'ContactHandle'>;
export type UtxoHandle = Branded<bigint, 'UtxoHandle'>;

// Network and block types
export type BlockHeight = Branded<bigint, 'BlockHeight'>;
export type ChainTip = Branded<bigint, 'ChainTip'>;
export type Nonce = Branded<bigint, 'Nonce'>;

// Validation types
export type ValidatedSeedPhrase = Branded<string[], 'ValidatedSeedPhrase'>;
export type ValidatedPassphrase = Branded<string, 'ValidatedPassphrase'>;

// Time types
export type UnixTimestamp = Branded<number, 'UnixTimestamp'>;
export type DurationMs = Branded<number, 'DurationMs'>;

// File and path types
export type WalletPath = Branded<string, 'WalletPath'>;
export type LogPath = Branded<string, 'LogPath'>;

// Utility types for working with branded types

/**
 * Extract the base type from a branded type
 */
export type Unbrand<T> = T extends Brand<infer U, any> ? U : T;

/**
 * Check if a type is branded
 */
export type IsBranded<T> = T extends Brand<any, any> ? true : false;

/**
 * Get the brand from a branded type
 */
export type GetBrand<T> = T extends Brand<any, infer B> ? B : never;

/**
 * Type guard factory for branded types
 */
export type BrandGuard<T extends Brand<any, any>> = (value: any) => value is T;

/**
 * Utility for creating brand guards
 */
export function createBrandGuard<T extends Brand<any, any>>(
  validator: (value: any) => boolean
): BrandGuard<T> {
  return (value: any): value is T => validator(value);
}

/**
 * Assert that a value has the expected brand
 */
export function assertBrand<T extends Brand<any, any>>(
  value: any,
  guard: BrandGuard<T>,
  message?: string
): asserts value is T {
  if (!guard(value)) {
    throw new TypeError(message || `Value does not satisfy brand constraint`);
  }
}

/**
 * Safely cast to branded type with validation
 */
export function toBranded<T extends Brand<any, any>>(
  value: any,
  guard: BrandGuard<T>
): T {
  assertBrand(value, guard);
  return value;
}

/**
 * Remove brand from a branded type (unsafe cast)
 */
export function unbrand<T>(value: T): any {
  return value as any;
}

/**
 * Combine multiple brands into a new branded type
 */
export type CombineBrands<T, B1 extends string, B2 extends string> = Brand<Brand<T, B1>, B2>;

/**
 * Optional branded type
 */
export type OptionalBranded<T, B extends string> = Branded<T, B> | undefined;

/**
 * Array of branded values
 */
export type BrandedArray<T, B extends string> = Array<Branded<T, B>>;

/**
 * Readonly branded type
 */
export type ReadonlyBranded<T, B extends string> = Readonly<Branded<T, B>>;

/**
 * Nullable branded type
 */
export type NullableBranded<T, B extends string> = Branded<T, B> | null;

// JSON serialization helpers for branded types

/**
 * JSON serializable representation of branded bigint values
 */
export interface SerializedBrandedBigint<B extends string> {
  __type: 'branded_bigint';
  __brand: B;
  value: string;
}

/**
 * JSON serializable representation of branded string values
 */
export interface SerializedBrandedString<B extends string> {
  __type: 'branded_string';
  __brand: B;
  value: string;
}

/**
 * Union type for all serialized branded types
 */
export type SerializedBranded<B extends string> = 
  | SerializedBrandedBigint<B>
  | SerializedBrandedString<B>;

/**
 * Serialize a branded bigint for JSON
 */
export function serializeBrandedBigint<B extends string>(
  value: Branded<bigint, B>,
  brand: B
): SerializedBrandedBigint<B> {
  return {
    __type: 'branded_bigint',
    __brand: brand,
    value: value.toString()
  };
}

/**
 * Deserialize a branded bigint from JSON
 */
export function deserializeBrandedBigint<B extends string>(
  serialized: SerializedBrandedBigint<B>
): Branded<bigint, B> {
  return BigInt(serialized.value) as Branded<bigint, B>;
}

/**
 * Serialize a branded string for JSON
 */
export function serializeBrandedString<B extends string>(
  value: Branded<string, B>,
  brand: B
): SerializedBrandedString<B> {
  return {
    __type: 'branded_string',
    __brand: brand,
    value: value as string
  };
}

/**
 * Deserialize a branded string from JSON
 */
export function deserializeBrandedString<B extends string>(
  serialized: SerializedBrandedString<B>
): Branded<string, B> {
  return serialized.value as Branded<string, B>;
}

/**
 * Type predicate for serialized branded types
 */
export function isSerializedBranded(value: unknown): value is SerializedBranded<string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__type' in value &&
    '__brand' in value &&
    'value' in value &&
    (value.__type === 'branded_bigint' || value.__type === 'branded_string')
  );
}

/**
 * Generic deserializer for branded types
 */
export function deserializeBranded<B extends string>(
  serialized: SerializedBranded<B>
): Branded<bigint | string, B> {
  switch (serialized.__type) {
    case 'branded_bigint':
      return deserializeBrandedBigint(serialized);
    case 'branded_string':
      return deserializeBrandedString(serialized);
    default:
      throw new Error(`Unknown serialized branded type: ${(serialized as any).__type}`);
  }
}

// Export common brand guard patterns
export const BrandGuards = {
  /**
   * Create a guard for positive bigint brands
   */
  positiveBigint: <B extends string>(): BrandGuard<Branded<bigint, B>> =>
    createBrandGuard<Branded<bigint, B>>((value: bigint) => value > 0n),

  /**
   * Create a guard for non-empty string brands
   */
  nonEmptyString: <B extends string>(): BrandGuard<Branded<string, B>> =>
    createBrandGuard<Branded<string, B>>((value: string) => value.length > 0),

  /**
   * Create a guard for hex string brands
   */
  hexString: <B extends string>(): BrandGuard<Branded<string, B>> =>
    createBrandGuard<Branded<string, B>>((value: string) => /^[0-9a-fA-F]+$/.test(value)),

  /**
   * Create a guard for base58 string brands
   */
  base58String: <B extends string>(): BrandGuard<Branded<string, B>> =>
    createBrandGuard<Branded<string, B>>((value: string) => 
      /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(value)
    )
};

// Utility functions for common branded type conversions

/**
 * Create a MicroTari from a bigint value
 */
export function createMicroTari(value: bigint): MicroTari {
  if (value < 0n) {
    throw new Error('MicroTari amount cannot be negative');
  }
  return value as MicroTari;
}

/**
 * Create a TransactionId from a bigint value
 */
export function createTransactionId(value: bigint): TransactionId {
  return value as TransactionId;
}

/**
 * Convert a number to MicroTari (assuming the number represents Tari)
 */
export function tariToMicroTari(tari: number): MicroTari {
  if (tari < 0) {
    throw new Error('Tari amount cannot be negative');
  }
  const microTari = BigInt(Math.round(tari * 1_000_000));
  return createMicroTari(microTari);
}

/**
 * Convert MicroTari to a number (representing Tari)
 */
export function microTariToTari(microTari: MicroTari): number {
  return Number(microTari as bigint) / 1_000_000;
}

/**
 * Safe conversion from unknown to MicroTari
 */
export function asMicroTari(value: unknown): MicroTari {
  if (typeof value === 'bigint') {
    return createMicroTari(value);
  }
  if (typeof value === 'number') {
    return createMicroTari(BigInt(value));
  }
  if (typeof value === 'string') {
    return createMicroTari(BigInt(value));
  }
  throw new Error(`Cannot convert ${typeof value} to MicroTari`);
};
