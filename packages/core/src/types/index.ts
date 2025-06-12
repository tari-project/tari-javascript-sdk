/**
 * @fileoverview Core type definitions for Tari JavaScript SDK
 * 
 * Central export point for all type system components including enums,
 * branded types, configuration interfaces, and validation utilities.
 */

// Core enumerations and constants
export * from './enums.js';
export * from './constants.js';

// Branded types and utilities
export * from './branded.js';
export * from './utils.js';

// Configuration interfaces
export * from './config.js';
export * from './wallet-config.js';

// Balance and amount types
export * from './balance.js';
export * from './amount.js';

// Address types and validation
export * from './address.js';

// Transaction types
export * from './transaction.js';
export * from './transaction-status.js';

// Contact and metadata types
export * from './contact.js';
export * from './metadata.js';

// UTXO and output types
export * from './utxo.js';
export * from './output-features.js';

// Event and callback types
export * from './events.js';
export * from './callbacks.js';

// Validation and type guards
export * from './guards.js';
export * from './validators.js';

// Legacy exports for backward compatibility
export type NativeHandle = bigint;
export type HexString = string;
export type Base58String = string;
