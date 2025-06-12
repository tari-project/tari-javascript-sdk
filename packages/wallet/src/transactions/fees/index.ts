/**
 * @fileoverview Fee Management Module
 * 
 * Exports all fee-related functionality including estimation, calculation,
 * and network fee analysis for comprehensive transaction fee management.
 */

// Fee estimator
export {
  FeeEstimator,
  FeeConfidence,
  FeePriority,
  type FeeEstimationOptions,
  type FeeEstimationResult,
  type FeeEstimatorConfig,
  DEFAULT_FEE_ESTIMATOR_CONFIG
} from './fee-estimator.js';

// Fee calculator
export {
  FeeCalculator,
  FeeUtils,
  type FeeCalculatorConfig,
  type SizeEstimationResult,
  type FeeBreakdown,
  DEFAULT_TARI_SIZE_COMPONENTS
} from './fee-calculator.js';

// Network fees service
export {
  NetworkFeesService,
  type NetworkFeeStatistics,
  type HistoricalFeeStatistics,
  type FeePrediction,
  type NetworkFeesServiceConfig,
  type NetworkFeesServiceEvents,
  DEFAULT_NETWORK_FEES_CONFIG
} from './network-fees.js';

// Re-export core fee types for convenience
export type {
  FeeEstimate
} from '@tari-project/tarijs-core';
