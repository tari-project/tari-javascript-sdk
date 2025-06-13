/**
 * @fileoverview Wallet-specific type definitions
 * 
 * This module contains types specific to wallet operations, including
 * configuration interfaces, transaction types, and wallet state management.
 */

import type { BaseConfig, NetworkType } from '@tari-project/tarijs-core';

// Wallet configuration extending base config
export interface WalletConfig extends BaseConfig {
  network: NetworkType;
  storagePath: string;
  logPath?: string;
  passphrase?: string;
  seedWords?: string[];
  numRollingLogFiles?: number;
  rollingLogFileSize?: number;
}

// Balance information
export interface Balance {
  /** Available spendable balance */
  available: bigint;
  /** Incoming transactions pending confirmation */
  pendingIncoming: bigint;
  /** Outgoing transactions pending confirmation */
  pendingOutgoing: bigint;
  /** Total balance (available + pending incoming) */
  total: bigint;
  /** Timestamp of last balance update */
  lastUpdated: Date;
}

// Extended balance information with additional details
export interface BalanceInfo extends Balance {
  /** Time-locked balance that cannot be spent */
  timeLocked: bigint;
  /** Confirmed balance (fully confirmed transactions) */
  confirmed: bigint;
  /** Unconfirmed balance (partially confirmed transactions) */
  unconfirmed: bigint;
  /** Current blockchain height when balance was fetched */
  height: number;
}

// Balance change event
export interface BalanceChangeEvent {
  /** Timestamp of the change */
  timestamp: Date;
  /** Previous balance state */
  previousBalance: Balance;
  /** Current balance state */
  currentBalance: Balance;
  /** Array of specific field changes */
  changes: Array<{
    field: keyof Balance;
    oldValue: bigint;
    newValue: bigint;
    change: bigint;
  }>;
}

// Transaction types
export enum TransactionStatus {
  Pending = 'pending',
  Broadcast = 'broadcast',
  MinedUnconfirmed = 'mined_unconfirmed',
  MinedConfirmed = 'mined_confirmed',
  Cancelled = 'cancelled',
  Rejected = 'rejected',
}

export interface TransactionInfo {
  id: bigint;
  amount: bigint;
  fee: bigint;
  status: TransactionStatus;
  message: string;
  timestamp: Date;
  isInbound: boolean;
  confirmations: number;
}

// Send transaction options
export interface SendTransactionOptions {
  feePerGram?: bigint;
  message?: string;
  isOneSided?: boolean;
}

// Address types
export interface TariAddressComponents {
  publicKey: string;
  network: NetworkType;
  checksum: number;
}

// Contact management
export interface Contact {
  alias: string;
  publicKey: string;
  isFavorite: boolean;
  lastSeen?: Date;
}

// Event handler types
export interface WalletEventHandlers {
  onTransactionReceived?: (transaction: TransactionInfo) => void;
  onTransactionBroadcast?: (transactionId: bigint) => void;
  onTransactionMined?: (transactionId: bigint) => void;
  onTransactionCancelled?: (transactionId: bigint) => void;
  onBalanceUpdated?: (balance: Balance) => void;
  onConnectivityChanged?: (isOnline: boolean) => void;
  onSyncProgress?: (current: number, total: number) => void;
}

// Network peer information
export interface PeerInfo {
  publicKey: string;
  address: string;
  port: number;
}

// Transaction extensions for wallet-specific interfaces
export * from './transaction-extensions.js';

// Re-export advanced feature types from core
export type {
  // Contact types
  Contact as CoreContact,
  CreateContactParams,
  UpdateContactParams,
  ContactFilter,
  ContactQueryOptions,
  ContactStatistics,
  
  // UTXO types
  UtxoInfo,
  UtxoFilter,
  UtxoQueryOptions,
  UtxoSelection,
  SelectionContext,
  
  // Coin operation types
  MicroTari
} from '@tari-project/tarijs-core';

// Re-export advanced feature types from local modules
export type {
  CoinSplitOptions,
  CoinJoinOptions,
  CoinOperationResult,
  CoinOperationProgressCallback
} from '../coins/index.js';

export type {
  UtxoQueryResult
} from '../utxos/utxo-service.js';
