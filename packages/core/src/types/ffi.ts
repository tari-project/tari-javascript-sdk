/**
 * @fileoverview FFI types and interfaces for Tari JavaScript SDK
 * 
 * Defines types for interacting with the native Rust FFI layer,
 * including handle management and data conversion utilities.
 */

import type {
  MicroTari,
  TransactionId,
  PublicKey,
  TariAddressString,
  Hash,
  Commitment,
  UnixTimestamp,
  BlockHeight
} from './branded';
import type {
  UtxoStatus,
  OutputFeatures,
  TransactionStatus
} from './enums';

import type { NativeHandle, WalletHandle, ContactHandle } from './branded';

// FFI Contact interface (matches native structure)
export interface FFIContact {
  alias: string;
  public_key: string;
  address: string;
  isFavorite: boolean;
  lastSeen?: number;
}

// FFI UTXO interface (matches native structure)
export interface FFIUtxoInfo {
  id: string;
  amount: string; // BigInt as string for FFI
  commitment: string;
  features: number; // Enum as number
  status: number; // Enum as number
  block_height: string; // BigInt as string
  maturity_height: string; // BigInt as string
  transaction_hash: string;
  output_index: number;
  detected_at: number;
  updated_at: number;
}

// FFI Transaction interface (matches native structure)
export interface FFITransaction {
  id: string; // BigInt as string
  amount: string; // BigInt as string
  fee: string; // BigInt as string
  status: number; // Enum as number
  message: string;
  timestamp: number;
  is_inbound: boolean;
  confirmations: number;
  destination_address?: string;
  source_address?: string;
}

// FFI Balance interface (matches native structure)
export interface FFIBalance {
  available: string; // BigInt as string
  pending_incoming: string;
  pending_outgoing: string;
  time_locked: string;
}

// FFI callback types
export type FFITransactionCallback = (transaction: FFITransaction) => void;
export type FFIBalanceCallback = (balance: FFIBalance) => void;
export type FFIConnectivityCallback = (is_online: boolean) => void;

// FFI Error type
export interface FFIError {
  code: number;
  message: string;
  context?: string;
}

// FFI configuration structures
export interface FFIWalletConfig {
  network: string;
  storage_path: string;
  log_path?: string;
  passphrase?: string;
  num_rolling_log_files?: number;
  rolling_log_file_size?: number;
}

export interface FFIBaseNodeConfig {
  public_key: string;
  address: string;
  port: number;
}

// FFI operation results
export interface FFIResult<T> {
  success: boolean;
  data?: T;
  error?: FFIError;
}

// FFI query filters
export interface FFIUtxoFilter {
  status?: number[];
  features?: number[];
  min_amount?: string;
  max_amount?: string;
  min_block_height?: string;
  max_block_height?: string;
  max_maturity_height?: string;
}

export interface FFIContactFilter {
  alias_search?: string;
  is_favorite?: boolean;
  tags?: string[];
}

// FFI selection criteria
export interface FFIUtxoSelectionCriteria {
  target_amount: string; // BigInt as string
  strategy: number; // Enum as number
  max_utxos?: number;
  min_amount?: string;
  preferred?: string[];
  excluded?: string[];
  include_immature?: boolean;
  dust_threshold?: string;
}

// FFI selection result
export interface FFIUtxoSelectionResult {
  selected: FFIUtxoInfo[];
  total_amount: string;
  change_amount: string;
  success: boolean;
  error?: string;
}

// FFI coin operation options
export interface FFICoinSplitOptions {
  split_count: number;
  distribution_type?: number; // Enum as number
  custom_amounts?: string[]; // BigInt array as strings
  fee_per_gram?: string;
  lock_height?: string;
}

export interface FFICoinJoinOptions {
  utxo_ids?: string[];
  fee_per_gram?: string;
  max_utxos?: number;
}

// FFI network synchronization options
export interface FFISyncOptions {
  validate_transactions?: boolean;
  validate_utxos?: boolean;
  timeout_seconds?: number;
}

// FFI signing options
export interface FFISigningOptions {
  format?: number; // Enum for signature format
  include_challenge?: boolean;
  domain_hash?: string;
}

// FFI message signature
export interface FFIMessageSignature {
  signature: string;
  public_nonce: string;
  challenge: string;
}

// Utility types for FFI conversion
export type FFIString = string;
export type FFIBigInt = string; // BigInt represented as string in FFI
export type FFIBoolean = boolean;
export type FFINumber = number;
export type FFIArray<T> = T[];
export type FFIOptional<T> = T | null | undefined;

// FFI function signatures (type definitions only)
export interface FFIFunctions {
  // Wallet management
  wallet_create(config: FFIWalletConfig): Promise<WalletHandle>;
  wallet_destroy(handle: WalletHandle): Promise<void>;
  wallet_get_balance(handle: WalletHandle): Promise<FFIBalance>;
  
  // Contact management
  wallet_contact_add(handle: WalletHandle, contact: FFIContact): Promise<void>;
  wallet_contact_update(handle: WalletHandle, alias: string, contact: Partial<FFIContact>): Promise<void>;
  wallet_contact_remove(handle: WalletHandle, alias: string): Promise<void>;
  wallet_contact_get(handle: WalletHandle, alias: string): Promise<FFIContact | null>;
  wallet_contact_list(handle: WalletHandle, filter?: FFIContactFilter): Promise<FFIContact[]>;
  
  // UTXO management
  wallet_get_utxos(handle: WalletHandle, filter?: FFIUtxoFilter): Promise<FFIUtxoInfo[]>;
  wallet_get_utxo_by_id(handle: WalletHandle, id: string): Promise<FFIUtxoInfo | null>;
  wallet_utxo_select(handle: WalletHandle, criteria: FFIUtxoSelectionCriteria): Promise<FFIUtxoSelectionResult>;
  
  // Coin operations
  wallet_coin_split(handle: WalletHandle, amount: string, options: FFICoinSplitOptions): Promise<string>;
  wallet_coin_join(handle: WalletHandle, utxo_commitments: string[], options?: FFICoinJoinOptions): Promise<string>;
  
  // Network operations
  wallet_sync_with_base_node(handle: WalletHandle, options?: FFISyncOptions): Promise<void>;
  wallet_set_base_node(handle: WalletHandle, config: FFIBaseNodeConfig): Promise<void>;
  
  // Transaction operations
  wallet_send_transaction(handle: WalletHandle, destination: string, amount: string, message?: string): Promise<string>;
  wallet_get_transactions(handle: WalletHandle, filter?: any): Promise<FFITransaction[]>;
  
  // Message signing
  wallet_sign_message(handle: WalletHandle, message: string, options?: FFISigningOptions): Promise<FFIMessageSignature>;
  verify_message_signature(message: string, signature: string, public_key: string): Promise<boolean>;
}

// Export default empty object to satisfy module expectations
export default {};
