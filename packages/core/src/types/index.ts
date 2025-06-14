/**
 * @fileoverview Core type definitions for Tari JavaScript SDK
 * 
 * Central export point for all type system components including enums,
 * branded types, configuration interfaces, and validation utilities.
 */

// Core enumerations and constants
export * from './enums';
export * from './constants';

// Branded types and utilities
export * from './branded';
export * from './conversions';
export * from './utils';

// Configuration interfaces
export * from './config';
export * from './wallet-config';

// Balance and amount types
export * from './balance';
export * from './amount';

// Address types and validation
export * from './address';

// Transaction types
export * from './transaction';
export * from './transaction-status';

// Contact and metadata types
export * from './contact';
export * from './metadata';

// UTXO and output types
export * from './utxo';
export * from './output-features';

// FFI types and interfaces
export * from './ffi';

// Browser globals and platform types
export type * from './browser-globals';

// Additional FFI type exports for backward compatibility
export type { FFIContact, FFIUtxoInfo } from './ffi';

// Event and callback types
export * from './events';
export * from './callbacks';

// Validation and type guards
export * from './guards';
export * from './validators';

// Legacy exports for backward compatibility
export type NativeHandle = bigint;
export type HexString = string;
export type Base58String = string;
