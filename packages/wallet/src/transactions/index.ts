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

// Transaction building and fee estimation
export {
  TransactionBuilder,
  type TransactionBuildOptions,
  type TransactionParams
} from './builder/index.js';

export {
  FeeEstimator,
  type FeeEstimatorConfig,
  type FeeEstimate,
  NetworkFees
} from './fees/index.js';

// Transaction sending
export {
  StandardSender,
  type StandardSendOptions,
  RecipientValidator,
  AmountValidator,
  type AmountValidationConfig,
  DEFAULT_AMOUNT_CONFIG
} from './send/index.js';

// Transaction history and querying
export {
  HistoryService,
  type HistoryServiceConfig,
  type HistoryServiceEvents,
  type HistoryEntry,
  type SearchResult,
  DEFAULT_HISTORY_SERVICE_CONFIG,
  HistoryQueryBuilder,
  type BuiltQuery,
  type QueryPerformanceHints,
  HistoryFilters,
  type AdvancedFilterOptions,
  type FilterStatistics,
  type FilterValidationResult,
  FILTER_PRESETS
} from './history/index.js';

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
