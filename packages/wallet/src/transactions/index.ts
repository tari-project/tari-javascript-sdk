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
  type TransactionBuildOptions
} from './builder/index.js';

export {
  FeeEstimator,
  type FeeEstimatorConfig,
  NetworkFeesService as NetworkFees
} from './fees/index.js';

// Transaction sending
export {
  StandardSender,
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

// Pending transaction management
export {
  PendingTransactionManager,
  PendingTransactionTracker,
  TimeoutHandler,
  type PendingManagerConfig,
  type PendingManagerEvents,
  type PendingManagerStatistics,
  type PendingTrackerEvents,
  type PendingTrackerStatistics,
  type TimeoutHandlerEvents,
  type TimeoutStatistics
} from './pending/index.js';

// Transaction cancellation
export {
  CancellationService,
  CancelValidator,
  RefundHandler,
  type CancellationServiceConfig,
  type CancellationServiceEvents,
  type CancellationResult,
  type CancellationStatistics,
  type CancellationValidationRules,
  type ValidationResult,
  type RefundResult,
  type RefundHandlerEvents,
  type RefundStatistics,
  DEFAULT_CANCELLATION_CONFIG
} from './cancel/index.js';

// Transaction detail enrichment
export {
  DetailService,
  ConfirmationTracker,
  MemoService,
  type DetailServiceConfig,
  type DetailServiceEvents,
  type TransactionInput,
  type TransactionOutput,
  type TransactionKernel,
  type FeeBreakdown,
  type BlockInfo,
  type TransactionDetails,
  type DetailStatistics,
  type ConfirmationTrackerEvents,
  type ConfirmationStatistics,
  type MemoServiceEvents,
  type MemoStatistics,
  DEFAULT_DETAIL_SERVICE_CONFIG
} from './details/index.js';

// Transaction API integration
export {
  TransactionAPI,
  type TransactionAPIConfig,
  type TransactionAPIEvents,
  type TransactionAPIStatistics,
  DEFAULT_TRANSACTION_API_CONFIG
} from '../api/transaction-api.js';

// Re-export core transaction types for convenience
export type {
  TransactionInfo,
  PendingInboundTransaction,
  PendingOutboundTransaction,
  CompletedTransaction,
  CancelledTransaction,
  CoinbaseTransaction,
  Transaction,
  SendOneSidedParams,
  TransactionStatusUpdate,
  TransactionBuildResult,
  FeeEstimate,
  TransactionValidationResult,
  TransactionStatistics,
  TransactionHistoryEntry,
  TransactionSortBy
} from '@tari-project/tarijs-core';

// Re-export wallet-specific extended types
export type {
  TransactionFilter,
  TransactionQueryOptions,
  SendTransactionParams,
  StandardSendOptions,
  TransactionParams
} from '../types/transaction-extensions.js';

export {
  TransactionStatus,
  TransactionDirection,
  TransactionUtils
} from '@tari-project/tarijs-core';
