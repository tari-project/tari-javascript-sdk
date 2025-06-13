/**
 * @fileoverview Comprehensive Tari Wallet JavaScript SDK
 * 
 * This module provides the complete user-facing API for Tari wallet operations,
 * including wallet creation, restoration, transaction management, balance queries,
 * message signing, address management, and network synchronization. Built on top
 * of @tari-project/tarijs-core with comprehensive error handling and resource management.
 * 
 * @version 0.0.1
 * @author The Tari Community
 * @license BSD-3-Clause
 */

// Re-export core types for convenience
export {
  NetworkType,
  TariError,
  ErrorCode,
  WalletError,
  WalletErrorCode,
  ErrorSeverity,
  TariAddress
} from '@tari-project/tarijs-core';

export type { 
  LogLevel,
  BaseConfig,
  WalletHandle
} from '@tari-project/tarijs-core';

// Core wallet functionality
export * from './wallet/index.js';

// Types (avoiding conflicts with models)
export * from './types/index.js';

// Models (using explicit re-exports to avoid conflicts)
export { 
  TariAddress, 
  TransactionId,
  BalanceModel 
} from './models/index.js';
export type { Balance as WalletBalance } from './models/index.js';

// Wallet creation and management
export * from './wallet-factory.js';
export * from './wallet-state.js';

// Seed phrase management
export * from './seed/index.js';

// Balance operations
export * from './balance/index.js';

// Address management
export * from './address/index.js';

// Wallet information and network queries
export * from './info/index.js';

// Lifecycle and resource management
export * from './lifecycle/index.js';

// Wallet restoration
export * from './restore/index.js';

// Message signing and verification
export * from './signing/index.js';

// Transaction management
export * from './transactions/index.js';

// Configuration management
export * from './config/index.js';

// Performance management and optimization
export * from './performance/index.js';

// Version and SDK information
export const WALLET_VERSION = '0.0.1';
export const WALLET_SDK_NAME = '@tari-project/tarijs-wallet';
export const SUPPORTED_NETWORKS = ['mainnet', 'testnet', 'nextnet'] as const;
export const MINIMUM_NODE_VERSION = '18.0.0';

/**
 * SDK capabilities and feature flags
 */
export const SDK_CAPABILITIES = {
  /** Wallet creation and restoration */
  walletManagement: true,
  /** Balance queries and transaction history */
  balanceOperations: true,
  /** Transaction sending and receiving */
  transactions: true,
  /** One-sided transaction support */
  oneSidedTransactions: true,
  /** Transaction history and search */
  transactionHistory: true,
  /** Pending transaction management */
  pendingTransactions: true,
  /** Transaction cancellation */
  transactionCancellation: true,
  /** Transaction detail enrichment */
  transactionDetails: true,
  /** Transaction confirmation tracking */
  confirmationTracking: true,
  /** Transaction memo management */
  transactionMemos: true,
  /** Message signing and verification */
  messageSigning: true,
  /** Address generation and management */
  addressManagement: true,
  /** Network connectivity and sync */
  networkOperations: true,
  /** Comprehensive error handling */
  errorHandling: true,
  /** Resource management and cleanup */
  resourceManagement: true,
  /** Progress tracking for long operations */
  progressTracking: true,
  /** Multi-network support */
  multiNetwork: true,
  /** Performance monitoring and optimization */
  performanceOptimization: true,
  /** Memory pressure monitoring */
  memoryManagement: true,
  /** FFI call batching for performance */
  callBatching: true,
  /** Intelligent query caching */
  queryCaching: true,
  /** Worker thread pool for CPU tasks */
  workerThreads: true,
  /** Hardware wallet support (future) */
  hardwareWallets: false,
  /** Multi-signature support (future) */
  multiSignature: false,
  /** Stealth addresses (future) */
  stealthAddresses: false
} as const;

/**
 * Quick start utility for common wallet operations
 */
export const QuickStart = {
  /** Create a new wallet with default configuration */
  async createWallet(network: 'mainnet' | 'testnet' | 'nextnet' = 'testnet') {
    const { WalletFactory } = await import('./wallet-factory.js');
    return WalletFactory.create({ network, storagePath: './wallet' });
  },

  /** Restore a wallet from seed phrase */
  async restoreWallet(
    seedWords: string[], 
    network: 'mainnet' | 'testnet' | 'nextnet' = 'testnet'
  ) {
    const { WalletFactory } = await import('./wallet-factory.js');
    return WalletFactory.restore(seedWords, { network, storagePath: './wallet' });
  },

  /** Generate a new seed phrase */
  async generateSeedPhrase(wordCount: 12 | 15 | 18 | 21 | 24 = 24) {
    const { WalletFactory } = await import('./wallet-factory.js');
    return WalletFactory.generateSeedPhrase(wordCount);
  },

  /** Validate a seed phrase */
  async validateSeedPhrase(seedWords: string[]) {
    const { WalletFactory } = await import('./wallet-factory.js');
    return WalletFactory.validateSeedWords(seedWords);
  }
} as const;
