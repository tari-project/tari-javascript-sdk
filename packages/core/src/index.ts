/**
 * @fileoverview Core FFI bindings and utilities for Tari JavaScript SDK
 * 
 * This module provides the fundamental building blocks for interacting with
 * the Tari wallet through Rust FFI via NAPI-RS. It includes:
 * 
 * - FFI handle management and lifecycle
 * - Memory safety utilities
 * - Type conversions between JavaScript and Rust
 * - Error handling infrastructure
 * - Resource tracking and cleanup
 * 
 * @version 0.0.1
 * @author The Tari Community
 * @license BSD-3-Clause
 */

// Re-export types (excluding validation types that conflict with errors)
export * from './types/constants';
export * from './types/branded';
export * from './types/utils';
export { createMicroTari, createTransactionId, asMicroTari } from './types/branded';
export { microTariFromFFI, microTariToFFI } from './types/conversions';
export * from './types/config';
export * from './types/wallet-config';
export * from './types/balance';
export * from './types/amount';
export * from './types/address';
export * from './types/transaction';
export * from './types/transaction-status';
export * from './types/contact';
export * from './types/metadata';
export * from './types/utxo';
export * from './types/output-features';
export * from './types/callbacks';
export * from './types/guards';

// Re-export specific types and values from enums without conflicts
export { 
  NetworkType, 
  AddressFormat, 
  TransactionDirection, 
  TransactionStatus,
  UtxoStatus,
  OutputFeatures,
  ConnectivityStatus,
  MnemonicWordCount,
  LogLevel
} from './types/enums';

// Re-export error system (takes precedence over types for validation)
export * from './errors/index';
// Export utils but exclude conflicting exports
export {
  validateRequired,
  validatePositive,
  isHexString,
  isBase58String,
  withTimeout,
  type Awaitable,
  type Optional,
} from './utils/index';
export { validateMicroTari } from './errors/validation';
export { TypedEventEmitter } from './utils/typed-event-emitter';

// FFI resource management (Task 4+)
export * from './ffi/resource';
export * from './ffi/handle';
export * from './ffi/tracker';
export * from './ffi/diagnostics';
export * from './ffi/platform-utils';
export * from './ffi/memory';

// Export specific items from call-manager to avoid CircuitState conflict
export { FFICallError, ErrorClassification, CircuitState, type CallContext } from './ffi/call-manager';

// FFI bindings
export { getFFIBindings, initializeFFI, resetFFI, FFIBindings } from './ffi/bindings';
export type { FFIWalletConfig, WalletHandle, FFIBalance } from './ffi/types';
export { createWalletHandle, unwrapWalletHandle, validateTariAddress } from './ffi/types';

// FFI interface types
export type { FFIContact, FFIUtxoInfo } from './types/ffi';

// FFI callbacks (Phase 8)
export {
  setWalletEventCallback,
  removeWalletEventCallback,
  getCallbackStats,
  cleanupAllCallbacks,
  parseFFIEventPayload,
  validateEventCallback,
  createSafeEventCallback,
  testUtils as callbackTestUtils,
  type FFIEventPayload,
  type FFIEventCallback,
  type CallbackStats
} from './ffi/callbacks';

// Wallet handle wrapper (Task 8)
export * from './wallet-handle';

// Domain models
export * from './models/tari-address';

// Debug utilities (Task 10) - conditional export for tree-shaking
export * from './ffi/debug';
export * from './ffi/trace';

// Memory management and performance (Phase 10)
export * from './memory/using-polyfill';
export * from './memory/disposable';
export * from './memory/resource-base';
export * from './memory/secure-buffer';
export * from './memory/crypto-helpers';
export * from './memory/memory-utils';
export * from './memory/pressure-monitor';
export * from './memory/gc-coordinator';
export * from './memory/heap-stats';

// Performance optimization
export * from './performance/call-batcher';
export * from './performance/batch-queue';
export * from './performance/batch-executor';

// Version information
export const VERSION = '0.0.1';
export const SDK_NAME = '@tari-project/tarijs-core';

// FFI integration status
export const FFI_AVAILABLE = true;
