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
  available: bigint;
  pendingIncoming: bigint;
  pendingOutgoing: bigint;
  timelocked: bigint;
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

// Types are already exported above - no need to re-export
