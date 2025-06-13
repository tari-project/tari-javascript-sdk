/**
 * @fileoverview Coin Management Module for Tari Wallet
 * 
 * Exports coin split and join functionality for privacy enhancement
 * and UTXO consolidation operations.
 */

// Main coin service
export { CoinService } from './coin-service.js';
export type {
  CoinOperationProgressCallback,
  CoinOperationResult
} from './coin-service.js';

// Coin splitting
export { CoinSplitter } from './coin-splitter.js';
export type {
  CoinSplitOptions,
  SplitResult
} from './coin-splitter.js';

// Coin joining
export { CoinJoiner } from './coin-joiner.js';
export type {
  CoinJoinOptions,
  JoinResult,
  ConsolidationAnalysis
} from './coin-joiner.js';
