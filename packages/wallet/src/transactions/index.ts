/**
 * @fileoverview Transaction Management Module
 * 
 * Exports all transaction-related functionality including services, repositories,
 * state management, and related types for comprehensive transaction handling.
 */

// Core transaction service
export { 
  TransactionService,
  type TransactionServiceConfig,
  type TransactionServiceEvents,
  DEFAULT_TRANSACTION_SERVICE_CONFIG
} from './transaction-service.js';

// Transaction repository
export {
  TransactionRepository,
  type TransactionRepositoryConfig,
  type TransactionRepositoryEvents,
  type QueryResult
} from './transaction-repository.js';

// Transaction state management
export {
  TransactionStateManager,
  type TransactionStateManagerConfig,
  type TransactionStateManagerEvents
} from './transaction-state.js';

// Re-export core transaction types for convenience
export type {
  TransactionInfo,
  PendingInboundTransaction,
  PendingOutboundTransaction,
  CompletedTransaction,
  CancelledTransaction,
  CoinbaseTransaction,
  Transaction,
  SendTransactionParams,
  SendOneSidedParams,
  TransactionFilter,
  TransactionQueryOptions,
  TransactionStatusUpdate,
  TransactionBuildResult,
  FeeEstimate,
  TransactionValidationResult,
  TransactionStatistics,
  TransactionHistoryEntry,
  TransactionSortBy
} from '@tari-project/tarijs-core';

export {
  TransactionStatus,
  TransactionDirection,
  TransactionUtils
} from '@tari-project/tarijs-core';
