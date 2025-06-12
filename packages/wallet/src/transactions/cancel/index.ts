/**
 * @fileoverview Transaction Cancellation Module
 * 
 * Provides comprehensive transaction cancellation functionality including
 * validation, refund processing, and proper state management.
 */

export { CancellationService } from './cancellation-service.js';
export { CancelValidator } from './cancel-validator.js';
export { RefundHandler } from './refund-handler.js';

export type {
  CancellationServiceConfig,
  CancellationServiceEvents,
  CancellationResult,
  CancellationStatistics
} from './cancellation-service.js';

export type {
  CancellationValidationRules,
  ValidationResult
} from './cancel-validator.js';

export type {
  RefundResult,
  RefundHandlerEvents,
  RefundStatistics
} from './refund-handler.js';

export { DEFAULT_CANCELLATION_CONFIG } from './cancellation-service.js';
