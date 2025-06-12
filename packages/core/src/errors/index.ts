/**
 * @fileoverview Comprehensive error handling infrastructure for Tari JavaScript SDK
 * 
 * This module provides a complete error handling system with structured error codes,
 * context enrichment, retry logic, recovery strategies, validation, and telemetry.
 */

// Core error classes and codes
export * from './codes.js';
export * from './wallet-error.js';

// FFI error handling
export * from './ffi-errors.js';

// Error context system
export * from './context.js';

// Input validation
export * from './validation.js';

// Retry and recovery
export * from './retry.js';
export * from './recovery.js';

// Error reporting and telemetry
export * from './reporting.js';

// Developer-friendly messages
export * from './messages.js';

// Legacy exports for backward compatibility
export {
  WalletErrorCode as ErrorCode,
} from './codes.js';

export {
  WalletError as TariError,
  createWalletError as createError,
} from './wallet-error.js';
