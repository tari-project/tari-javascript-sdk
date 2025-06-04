import { Network, TransactionStatus } from '@tari/core';

export interface WalletConfig {
  network: Network;
  seedWords?: string;
  passphrase?: string;
  dbPath?: string;
  dbName?: string;
  baseNode?: {
    address: string;
    publicKey: string;
  };
}

export interface Balance {
  available: bigint;
  pending: bigint;
  locked: bigint;
  total: bigint;
}

export interface Transaction {
  id: string;
  amount: bigint;
  fee: bigint;
  destination: string;
  status: TransactionStatus;
  message: string;
  timestamp: Date;
  confirmations: number;
  isOutbound: boolean;
}

export interface ScanProgress {
  current: number;
  total: number;
  percentage: number;
}

export interface ConnectionStatus {
  connected: boolean;
  baseNode?: string;
  lastSeen?: Date;
  syncProgress?: number;
}

export enum WalletEvent {
  Connected = 'connected',
  Disconnected = 'disconnected',
  BalanceUpdated = 'balance-updated',
  TransactionReceived = 'transaction-received',
  TransactionSent = 'transaction-sent',
  TransactionConfirmed = 'transaction-confirmed',
  ScanProgress = 'scan-progress',
  Error = 'error',
}

export interface WalletEventMap {
  [WalletEvent.Connected]: ConnectionStatus;
  [WalletEvent.Disconnected]: { reason: string };
  [WalletEvent.BalanceUpdated]: Balance;
  [WalletEvent.TransactionReceived]: Transaction;
  [WalletEvent.TransactionSent]: Transaction;
  [WalletEvent.TransactionConfirmed]: Transaction;
  [WalletEvent.ScanProgress]: ScanProgress;
  [WalletEvent.Error]: Error;
}
