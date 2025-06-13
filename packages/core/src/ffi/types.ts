/**
 * TypeScript type definitions for FFI operations
 * These types bridge the native FFI and high-level TypeScript APIs
 */

// Re-export core types from the core package
export { NetworkType, LogLevel } from '../types/index';

// Handle types with branded typing for type safety
export type WalletHandle = number & { readonly __brand: 'WalletHandle' };

export function createWalletHandle(handle: number): WalletHandle {
  return handle as WalletHandle;
}

export function unwrapWalletHandle(handle: WalletHandle): number {
  return handle as number;
}

// FFI-specific configuration types
export interface FFIWalletConfig {
  network: string;
  storagePath: string;
  logPath?: string;
  logLevel?: number;
  passphrase?: string;
  seedWords?: string[];
  numRollingLogFiles?: number;
  rollingLogFileSize?: number;
}

// FFI balance information
export interface FFIBalance {
  available: string; // Using string for bigint compatibility
  pendingIncoming: string;
  pendingOutgoing: string;
  timelocked: string;
}

// FFI transaction information
export interface FFITransactionInfo {
  id: string;
  amount: string;
  fee: string;
  status: TransactionStatus;
  message: string;
  timestamp: number; // Unix timestamp
  isInbound: boolean;
  address: string;
}

// FFI contact information
export interface FFIContact {
  alias: string;
  address: string;
  isFavorite: boolean;
  lastSeen?: number; // Unix timestamp
}

// FFI UTXO information
export interface FFIUtxoInfo {
  amount: string;
  commitment: string;
  features: OutputFeatures;
  maturity: string; // Using string for bigint compatibility
  status: UtxoStatus;
}

// Transaction sending options
export interface FFISendTransactionOptions {
  feePerGram?: string;
  message?: string;
  isOneSided?: boolean;
}

// Base node peer information
export interface FFIBaseNodePeer {
  publicKey: string;
  address: string;
}

// Error information from FFI
export interface FFIErrorInfo {
  code: number;
  message: string;
  recoverable: boolean;
  context?: string;
}

// Enum types for FFI operations
export enum ConnectivityStatus {
  Offline = 0,
  Connecting = 1,
  Online = 2,
}

export enum TransactionStatus {
  Pending = 0,
  Broadcast = 1,
  MinedUnconfirmed = 2,
  Imported = 3,
  MinedConfirmed = 4,
  Rejected = 5,
  Cancelled = 6,
  Coinbase = 7,
}

export enum OutputFeatures {
  Default = 0,
  Coinbase = 1,
  MintNonFungible = 2,
  SideChainCheckPoint = 3,
}

export enum UtxoStatus {
  Unspent = 0,
  Spent = 1,
  EncumberedToBeSpent = 2,
  EncumberedToBeReceived = 3,
  Invalid = 4,
  CancelledInbound = 5,
  UnspentMinedUnconfirmed = 6,
  ShortTermEncumberedToBeSpent = 7,
  ShortTermEncumberedToBeReceived = 8,
  SpentMinedUnconfirmed = 9,
  AbandonedCoinbase = 10,
  NotStored = 11,
}

// Type guards for runtime type checking
export function isWalletHandle(value: unknown): value is WalletHandle {
  return typeof value === 'number' && value > 0 && Number.isInteger(value);
}

export function isConnectivityStatus(value: unknown): value is ConnectivityStatus {
  return typeof value === 'number' && value >= 0 && value <= 2;
}

export function isTransactionStatus(value: unknown): value is TransactionStatus {
  return typeof value === 'number' && value >= 0 && value <= 7;
}

export function isOutputFeatures(value: unknown): value is OutputFeatures {
  return typeof value === 'number' && value >= 0 && value <= 3;
}

export function isUtxoStatus(value: unknown): value is UtxoStatus {
  return typeof value === 'number' && value >= 0 && value <= 11;
}

// Validation utilities
export function validateFFIWalletConfig(config: FFIWalletConfig): void {
  if (!config.network || typeof config.network !== 'string') {
    throw new Error('Network is required and must be a string');
  }

  if (!config.storagePath || typeof config.storagePath !== 'string') {
    throw new Error('Storage path is required and must be a string');
  }

  const validNetworks = ['mainnet', 'testnet', 'nextnet'];
  if (!validNetworks.includes(config.network)) {
    throw new Error(`Invalid network: ${config.network}. Must be one of: ${validNetworks.join(', ')}`);
  }

  if (config.logLevel !== undefined) {
    if (typeof config.logLevel !== 'number' || config.logLevel < 0 || config.logLevel > 5) {
      throw new Error('Log level must be a number between 0 and 5');
    }
  }

  if (config.seedWords) {
    if (!Array.isArray(config.seedWords) || config.seedWords.length !== 24) {
      throw new Error('Seed words must be an array of exactly 24 strings');
    }
    
    if (!config.seedWords.every(word => typeof word === 'string' && word.length > 0)) {
      throw new Error('All seed words must be non-empty strings');
    }
  }
}

export function validateTransactionAmount(amount: string): void {
  if (!amount || typeof amount !== 'string') {
    throw new Error('Amount is required and must be a string');
  }

  if (amount === '0') {
    throw new Error('Amount must be greater than zero');
  }

  // Basic numeric validation - real implementation would use proper bigint validation
  if (!/^\d+$/.test(amount)) {
    throw new Error('Amount must be a valid positive integer string');
  }
}

export function validateTariAddress(address: string, network?: string): void {
  if (!address || typeof address !== 'string') {
    throw new Error('Address is required and must be a string');
  }

  if (!address.startsWith('tari://')) {
    throw new Error('Address must start with tari://');
  }

  if (network) {
    const expectedPrefix = `tari://${network}/`;
    if (!address.startsWith(expectedPrefix)) {
      throw new Error(`Address must start with ${expectedPrefix} for network ${network}`);
    }
  }
}

// Conversion utilities between FFI and internal types
export function convertToFFIConfig(config: any): FFIWalletConfig {
  return {
    network: config.network,
    storagePath: config.storagePath,
    logPath: config.logPath,
    logLevel: config.logLevel,
    passphrase: config.passphrase,
    seedWords: config.seedWords,
    numRollingLogFiles: config.numRollingLogFiles,
    rollingLogFileSize: config.rollingLogFileSize,
  };
}

export function convertFromFFIBalance(balance: FFIBalance): any {
  return {
    available: balance.available,
    pendingIncoming: balance.pendingIncoming,
    pendingOutgoing: balance.pendingOutgoing,
    timelocked: balance.timelocked,
  };
}

export function convertFromFFITransaction(tx: FFITransactionInfo): any {
  return {
    id: tx.id,
    amount: tx.amount,
    fee: tx.fee,
    status: tx.status,
    message: tx.message,
    timestamp: new Date(tx.timestamp * 1000), // Convert Unix timestamp to Date
    isInbound: tx.isInbound,
    address: tx.address,
  };
}
