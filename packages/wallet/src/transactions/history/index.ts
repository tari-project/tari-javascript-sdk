/**
 * @fileoverview Transaction History Module
 * 
 * Exports all transaction history related functionality including querying,
 * filtering, search, and export capabilities.
 */

// Core history service
export {
  HistoryService,
  type HistoryServiceConfig,
  type HistoryServiceEvents,
  type HistoryEntry,
  type SearchResult,
  DEFAULT_HISTORY_SERVICE_CONFIG
} from './history-service.js';

// Query building
export {
  HistoryQueryBuilder,
  type BuiltQuery,
  type QueryPerformanceHints
} from './query-builder.js';

// Advanced filtering
export {
  HistoryFilters,
  type AdvancedFilterOptions,
  type FilterStatistics,
  type FilterValidationResult,
  FILTER_PRESETS
} from './filters.js';
