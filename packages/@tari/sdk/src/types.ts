// =============================================================================
// SIMPLE DATA TYPES - Mirror iOS/Android structs
// No business logic, just data structures for FFI
// =============================================================================

// Branded types for type safety
export type WalletHandle = number & { __brand: 'WalletHandle' };
export type AddressHandle = number & { __brand: 'AddressHandle' };

// =============================================================================
// ENUMS (mirrors mobile wallet enums)
// =============================================================================

export enum Network {
  Mainnet = 0,
  Testnet = 1,
  Nextnet = 2,
  LocalNet = 3,
}

export enum TransactionStatus {
  Pending = 0,
  Broadcast = 1,
  MinedUnconfirmed = 2,
  Confirmed = 3,
  Cancelled = 4,
}

export enum UTXOStatus {
  Unspent = 0,
  Spent = 1,
  EncumberedToBeReceived = 2,
  EncumberedToBeSpent = 3,
}

// =============================================================================
// BASIC DATA STRUCTURES (mirrors mobile wallet structs)
// =============================================================================

export interface WalletConfig {
  seedWords?: string;
  passphrase?: string;
  dbPath?: string;
  dbName?: string;
  network: Network;
}

export interface BalanceInfo {
  available: bigint;
  pendingIncoming: bigint;
  pendingOutgoing: bigint;
  timeLocked: bigint;
}

export interface AddressInfo {
  handle: AddressHandle;
  emojiId: string;
  bytes: Uint8Array;
}

export interface CompletedTransaction {
  id: bigint;
  amount: bigint;
  fee: bigint;
  timestamp: Date;
  status: TransactionStatus;
  isOutbound: boolean;
  source: string;
  destination: string;
  message: string;
  confirmations: number;
}

export interface PendingInboundTransaction {
  id: bigint;
  amount: bigint;
  timestamp: Date;
  source: string;
  message: string;
}

export interface PendingOutboundTransaction {
  id: bigint;
  amount: bigint;
  fee: bigint;
  timestamp: Date;
  destination: string;
  message: string;
}

export interface Contact {
  alias: string;
  address: string;
  isFavorite: boolean;
}

export interface TariUtxo {
  commitment: string;
  value: bigint;
  minedHeight: number;
  minedTimestamp: Date;
  lockHeight: number;
  status: UTXOStatus;
}

export interface CoinSplitParams {
  commitments: string[];
  feePerGram: bigint;
  count: number;
}

export interface CoinJoinParams {
  commitments: string[];
  feePerGram: bigint;
}

export interface CoinPreview {
  fee: bigint;
  utxos: TariUtxo[];
}

export interface FeeEstimateParams {
  amount: bigint;
  feePerGram: bigint;
  kernelCount: number;
  outputCount: number;
}

export interface SendTransactionParams {
  destination: string;
  amount: bigint;
  feePerGram?: bigint;
  message?: string;
  oneSided?: boolean;
}

// =============================================================================
// LEGACY TYPES (for backward compatibility with existing ffi-types.ts)
// =============================================================================

// Keep these for compatibility with existing native code
export type PublicKeyHandle = number & { __brand: 'PublicKeyHandle' };
export type PrivateKeyHandle = number & { __brand: 'PrivateKeyHandle' };
export type TransactionHandle = number & { __brand: 'TransactionHandle' };
export type BalanceHandle = number & { __brand: 'BalanceHandle' };
export type ByteVectorHandle = number & { __brand: 'ByteVectorHandle' };
export type ContactsHandle = number & { __brand: 'ContactsHandle' };
export type UTXOHandle = number & { __brand: 'UTXOHandle' };

export interface TariBalance {
  available: bigint;
  pending: bigint;
  locked: bigint;
  total: bigint;
}

export interface TariTransaction {
  id: string;
  amount: bigint;
  fee: bigint;
  status: TransactionStatus;
  timestamp: Date;
  message: string;
  isOutbound: boolean;
}

export interface TariContact {
  alias: string;
  address: string;
  isFavorite: boolean;
}

export interface TariUTXO {
  commitment: string;
  value: bigint;
  minedHeight: number;
  minedTimestamp: Date;
  lockHeight: number;
  status: UTXOStatus;
}

export interface WalletCreateConfig {
  seedWords: string;
  network: Network;
  dbPath?: string;
  dbName?: string;
  passphrase?: string;
  logPath?: string;
}

export interface TransactionSendParams {
  destination: string;
  amount: bigint;
  feePerGram?: bigint;
  message?: string;
  oneSided?: boolean;
}

// =============================================================================
// TYPE GUARDS (for branded types)
// =============================================================================

export function isWalletHandle(value: number): value is WalletHandle {
  return typeof value === 'number' && value > 0;
}

export function isAddressHandle(value: number): value is AddressHandle {
  return typeof value === 'number' && value > 0;
}

export function isTransactionHandle(value: number): value is TransactionHandle {
  return typeof value === 'number' && value > 0;
}

// =============================================================================
// ERROR TYPES (keep simple)
// =============================================================================

export enum TariErrorCode {
  Success = 0,
  InvalidArgument = 1,
  InvalidSeed = 2,
  NetworkError = 3,
  InsufficientBalance = 4,
  TransactionError = 5,
  DatabaseError = 6,
  KeyError = 7,
  AddressError = 8,
  EncryptionError = 9,
  ValidationError = 10,
  ConnectionError = 11,
  SyncError = 12,
  ConfigError = 13,
  UnknownError = 999,
}

export class TariFFIError extends Error {
  constructor(
    message: string,
    public code: TariErrorCode = TariErrorCode.UnknownError,
    public context?: any
  ) {
    super(message);
    this.name = 'TariFFIError';
  }
}
