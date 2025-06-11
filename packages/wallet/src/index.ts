/**
 * @fileoverview High-level Tari wallet API for JavaScript applications
 * 
 * This module provides the main user-facing API for Tari wallet operations,
 * including wallet creation, transaction management, balance queries, and
 * network synchronization. Built on top of @tari-project/tarijs-core.
 * 
 * @version 0.0.1
 * @author The Tari Community
 * @license BSD-3-Clause
 */

// Re-export core types for convenience
export {
  NetworkType,
  LogLevel,
  TariError,
  ErrorCode,
} from '@tari-project/tarijs-core';

// Export wallet-specific modules
export * from './types/index';
export * from './wallet/index';
export * from './models/index';

// Version information
export const WALLET_VERSION = '0.0.1';
export const WALLET_SDK_NAME = '@tari-project/tarijs-wallet';
