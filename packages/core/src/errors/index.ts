/**
 * @fileoverview Comprehensive error handling infrastructure for Tari JavaScript SDK
 * 
 * This module provides a complete error handling system with structured error codes,
 * context enrichment, retry logic, recovery strategies, validation, and telemetry.
 */

// Core error classes and codes
export * from './codes';
export * from './wallet-error';

// FFI error handling
export * from './ffi-errors';

// Error context system
export * from './context';

// Input validation
export * from './validation';

// Retry and recovery
export * from './retry';
export * from './recovery';

// Error reporting and telemetry
export * from './reporting';

// Developer-friendly messages
export * from './messages';

// Legacy exports for backward compatibility
export {
  WalletErrorCode as ErrorCode,
} from './codes';

export {
  WalletError as TariError,
  createWalletError as createError,
} from './wallet-error';
