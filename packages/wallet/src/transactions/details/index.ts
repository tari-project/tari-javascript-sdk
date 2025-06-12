/**
 * @fileoverview Transaction Detail Enrichment Module
 * 
 * Provides comprehensive transaction detail retrieval with confirmation tracking,
 * memo management, and rich metadata for complete transaction information.
 */

export { DetailService } from './detail-service.js';
export { ConfirmationTracker } from './confirmation-tracker.js';
export { MemoService } from './memo-service.js';

export type {
  DetailServiceConfig,
  DetailServiceEvents,
  TransactionInput,
  TransactionOutput,
  TransactionKernel,
  FeeBreakdown,
  BlockInfo,
  TransactionDetails,
  DetailStatistics
} from './detail-service.js';

export type {
  ConfirmationTrackerEvents,
  ConfirmationStatistics
} from './confirmation-tracker.js';

export type {
  MemoServiceEvents,
  MemoStatistics
} from './memo-service.js';

export { DEFAULT_DETAIL_SERVICE_CONFIG } from './detail-service.js';
