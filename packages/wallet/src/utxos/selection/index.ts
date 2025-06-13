/**
 * @fileoverview UTXO Selection Module for Tari Wallet
 * 
 * Exports all UTXO selection strategies and utilities for
 * comprehensive coin selection functionality.
 */

// Core selection interfaces and base classes
export {
  SelectionStrategy,
  SelectionStrategyFactory
} from './strategy.js';

export type {
  SelectionContext,
  UtxoSelection,
  SelectionMetadata
} from './strategy.js';

// Main coin selector
export { CoinSelector } from './coin-selector.js';
export type {
  CoinSelectorConfig,
  StrategySelectionCriteria
} from './coin-selector.js';

// Selection strategy implementations
export { LargestFirstStrategy } from './largest-first.js';
export { BranchAndBoundStrategy } from './branch-and-bound.js';
export { RandomSelectionStrategy } from './random-selection.js';
export { KnapsackStrategy } from './knapsack.js';
export { PrivacyAwareStrategy } from './privacy-aware.js';

// Strategy optimization utilities
export { OptimizationStrategy } from './optimization.js';
export type {
  OptimizationGoal,
  OptimizationResult
} from './optimization.js';
