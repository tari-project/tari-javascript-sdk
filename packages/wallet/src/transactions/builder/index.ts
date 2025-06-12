/**
 * @fileoverview Transaction Builder Module
 * 
 * Exports all transaction building functionality including the main builder,
 * validation, options, and utility functions for constructing transactions.
 */

// Main transaction builder
export {
  TransactionBuilder,
  TransactionBuilderFactory,
  BuilderUtils,
  type BuildContext
} from './transaction-builder.js';

// Validation
export {
  TransactionValidator,
  ValidationUtils,
  type ValidationConfig,
  type ValidationRule,
  type ValidationRuleResult,
  type AddressValidationResult,
  type BalanceValidationContext,
  DEFAULT_VALIDATION_CONFIG,
  COMMON_VALIDATION_RULES
} from './validation.js';

// Build options
export {
  BuildOptions,
  OptionsValidator,
  OptionsUtils,
  UtxoSelectionStrategy,
  FeeCalculationMethod,
  type TransactionBuildOptions,
  type FeeCalculationOptions,
  type PrivacyOptions,
  type RetryOptions,
  type TimeoutOptions
} from './options.js';

// Re-export core types for convenience
export type {
  TransactionBuildResult,
  TransactionValidationResult,
  TransactionValidationError,
  TransactionValidationWarning
} from '@tari-project/tarijs-core';
