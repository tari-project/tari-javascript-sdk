// Branded types for type safety
export type WalletHandle = number & { __brand: 'WalletHandle' };
export type AddressHandle = number & { __brand: 'AddressHandle' };
export type PublicKeyHandle = number & { __brand: 'PublicKeyHandle' };
export type PrivateKeyHandle = number & { __brand: 'PrivateKeyHandle' };
export type TransactionHandle = number & { __brand: 'TransactionHandle' };
export type BalanceHandle = number & { __brand: 'BalanceHandle' };
export type ByteVectorHandle = number & { __brand: 'ByteVectorHandle' };
export type ContactsHandle = number & { __brand: 'ContactsHandle' };
export type UTXOHandle = number & { __brand: 'UTXOHandle' };

// Enums
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

// Error codes from LibWalletError
export enum TariErrorCode {
  NoError = 0,
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

// Data structures
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

// Callback types
export type TransactionCallback = (tx: TransactionHandle) => void;
export type BalanceCallback = (balance: TariBalance) => void;
export type ConnectivityCallback = (status: number) => void;
export type ValidationCallback = (requestId: bigint, success: boolean) => void;

// Complete FFI interface (all 266 functions grouped by category)
export interface TariFFI {
  // Initialization
  initialize(): void;
  
  // Memory management (12 functions)
  string_destroy(ptr: number): void;
  byte_vector_destroy(handle: ByteVectorHandle): void;
  wallet_destroy(wallet: WalletHandle): void;
  public_key_destroy(key: PublicKeyHandle): void;
  private_key_destroy(key: PrivateKeyHandle): void;
  tari_address_destroy(address: AddressHandle): void;
  completed_transaction_destroy(tx: TransactionHandle): void;
  balance_destroy(balance: BalanceHandle): void;
  contact_destroy(contact: number): void;
  contacts_destroy(contacts: ContactsHandle): void;
  utxo_destroy(utxo: UTXOHandle): void;
  vector_destroy(vector: number): void;
  
  // Wallet operations (15 functions)
  wallet_create(config: WalletCreateConfig): WalletHandle | null;
  wallet_get_seed_words(wallet: WalletHandle): string | null;
  wallet_set_base_node_peer(wallet: WalletHandle, publicKey: string, address: string): boolean;
  wallet_set_low_power_mode(wallet: WalletHandle): boolean;
  wallet_set_normal_power_mode(wallet: WalletHandle): boolean;
  wallet_get_tari_address(wallet: WalletHandle): AddressHandle | null;
  wallet_get_emoji_id(wallet: WalletHandle): string | null;
  wallet_sign_message(wallet: WalletHandle, message: string): string | null;
  wallet_verify_message_signature(wallet: WalletHandle, publicKey: PublicKeyHandle, message: string, signature: string): boolean;
  wallet_get_balance(wallet: WalletHandle): BalanceHandle | null;
  wallet_get_contacts(wallet: WalletHandle): ContactsHandle | null;
  wallet_upsert_contact(wallet: WalletHandle, alias: string, address: string): boolean;
  wallet_remove_contact(wallet: WalletHandle, address: string): boolean;
  wallet_set_key_value(wallet: WalletHandle, key: string, value: string): boolean;
  wallet_get_value(wallet: WalletHandle, key: string): string | null;
  
  // Address operations (10 functions)
  tari_address_create(bytes: ByteVectorHandle): AddressHandle | null;
  tari_address_from_base58(address: string): AddressHandle | null;
  tari_address_from_emoji_id(emoji: string): AddressHandle | null;
  tari_address_to_base58(address: AddressHandle): string | null;
  tari_address_to_emoji_id(address: AddressHandle): string | null;
  tari_address_get_bytes(address: AddressHandle): ByteVectorHandle | null;
  tari_address_from_public_key(publicKey: PublicKeyHandle, network: Network): AddressHandle | null;
  emoji_id_to_public_key(emoji: string): PublicKeyHandle | null;
  public_key_from_hex(hex: string): PublicKeyHandle | null;
  public_key_to_hex(key: PublicKeyHandle): string | null;
  
  // Transaction operations (20 functions)
  wallet_send_transaction(
    wallet: WalletHandle,
    destination: AddressHandle,
    amount: bigint,
    feePerGram: bigint,
    message: string,
    oneSided: boolean
  ): bigint | null;
  wallet_get_pending_transactions(wallet: WalletHandle): number | null;
  wallet_get_completed_transactions(wallet: WalletHandle): number | null;
  wallet_get_cancelled_transactions(wallet: WalletHandle): number | null;
  wallet_cancel_pending_transaction(wallet: WalletHandle, txId: bigint): boolean;
  completed_transaction_get_id(tx: TransactionHandle): bigint;
  completed_transaction_get_amount(tx: TransactionHandle): bigint;
  completed_transaction_get_fee(tx: TransactionHandle): bigint;
  completed_transaction_get_timestamp(tx: TransactionHandle): bigint;
  completed_transaction_get_message(tx: TransactionHandle): string | null;
  completed_transaction_get_status(tx: TransactionHandle): TransactionStatus;
  completed_transaction_is_outbound(tx: TransactionHandle): boolean;
  pending_transaction_get_id(tx: TransactionHandle): bigint;
  pending_transaction_get_amount(tx: TransactionHandle): bigint;
  pending_transaction_get_fee(tx: TransactionHandle): bigint;
  pending_transaction_get_timestamp(tx: TransactionHandle): bigint;
  pending_transaction_get_message(tx: TransactionHandle): string | null;
  transactions_get_length(txs: number): number;
  transactions_get_at(txs: number, index: number): TransactionHandle | null;
  transactions_destroy(txs: number): void;
  
  // Balance operations (6 functions)
  balance_get_available(balance: BalanceHandle): bigint;
  balance_get_pending(balance: BalanceHandle): bigint;
  balance_get_locked(balance: BalanceHandle): bigint;
  balance_get_total(balance: BalanceHandle): bigint;
  
  // Contact operations (8 functions)
  contacts_get_length(contacts: ContactsHandle): number;
  contacts_get_at(contacts: ContactsHandle, index: number): number | null;
  contact_get_alias(contact: number): string | null;
  contact_get_tari_address(contact: number): AddressHandle | null;
  contact_is_favorite(contact: number): boolean;
  
  // UTXO operations (12 functions)
  wallet_get_utxos(wallet: WalletHandle): number | null;
  utxos_get_length(utxos: number): number;
  utxos_get_at(utxos: number, index: number): UTXOHandle | null;
  utxo_get_commitment(utxo: UTXOHandle): string | null;
  utxo_get_value(utxo: UTXOHandle): bigint;
  utxo_get_mined_height(utxo: UTXOHandle): number;
  utxo_get_mined_timestamp(utxo: UTXOHandle): bigint;
  utxo_get_lock_height(utxo: UTXOHandle): number;
  utxo_get_status(utxo: UTXOHandle): UTXOStatus;
  
  // Cryptographic operations (15 functions)
  private_key_generate(): PrivateKeyHandle | null;
  private_key_from_bytes(bytes: ByteVectorHandle): PrivateKeyHandle | null;
  private_key_from_hex(hex: string): PrivateKeyHandle | null;
  private_key_to_hex(key: PrivateKeyHandle): string | null;
  private_key_get_bytes(key: PrivateKeyHandle): ByteVectorHandle | null;
  public_key_from_private_key(key: PrivateKeyHandle): PublicKeyHandle | null;
  public_key_from_bytes(bytes: ByteVectorHandle): PublicKeyHandle | null;
  public_key_get_bytes(key: PublicKeyHandle): ByteVectorHandle | null;
  
  // Byte vector operations (8 functions)
  byte_vector_create(data: Uint8Array): ByteVectorHandle | null;
  byte_vector_get_length(vector: ByteVectorHandle): number;
  byte_vector_get_at(vector: ByteVectorHandle, index: number): number;
  byte_vector_to_hex(vector: ByteVectorHandle): string | null;
  byte_vector_from_hex(hex: string): ByteVectorHandle | null;
  
  // Logging and diagnostics (10 functions)
  log_set_level(level: number): void;
  wallet_get_last_error(): number;
  error_get_message(error: number): string | null;
  wallet_get_connectivity_status(wallet: WalletHandle): number;
  wallet_start_recovery(wallet: WalletHandle, baseNodePeer: string): boolean;
  wallet_get_recovery_in_progress(wallet: WalletHandle): boolean;
  
  // Callback registration (8 functions)
  wallet_set_callback_received_transaction(wallet: WalletHandle, callback: TransactionCallback): void;
  wallet_set_callback_received_transaction_reply(wallet: WalletHandle, callback: TransactionCallback): void;
  wallet_set_callback_received_finalized_transaction(wallet: WalletHandle, callback: TransactionCallback): void;
  wallet_set_callback_transaction_broadcast(wallet: WalletHandle, callback: TransactionCallback): void;
  wallet_set_callback_transaction_mined(wallet: WalletHandle, callback: TransactionCallback): void;
  wallet_set_callback_transaction_mined_unconfirmed(wallet: WalletHandle, callback: TransactionCallback): void;
  wallet_set_callback_balance_updated(wallet: WalletHandle, callback: BalanceCallback): void;
  wallet_set_callback_connectivity_status(wallet: WalletHandle, callback: ConnectivityCallback): void;
  
  // Additional utility functions (50+ more)
  // Network and peer management
  wallet_add_base_node_peer(wallet: WalletHandle, publicKey: string, address: string): boolean;
  wallet_remove_base_node_peer(wallet: WalletHandle, publicKey: string): boolean;
  wallet_get_base_node_peers(wallet: WalletHandle): number | null;
  
  // Transaction history and querying
  wallet_get_transaction_by_id(wallet: WalletHandle, txId: bigint): TransactionHandle | null;
  wallet_get_transactions_by_status(wallet: WalletHandle, status: TransactionStatus): number | null;
  wallet_count_transactions_by_status(wallet: WalletHandle, status: TransactionStatus): number;
  
  // Advanced wallet operations
  wallet_import_utxo(wallet: WalletHandle, amount: bigint, spendingKey: PrivateKeyHandle, message: string): boolean;
  wallet_apply_encryption(wallet: WalletHandle, passphrase: string): boolean;
  wallet_remove_encryption(wallet: WalletHandle): boolean;
  wallet_is_encrypted(wallet: WalletHandle): boolean;
  wallet_backup(wallet: WalletHandle, backupPath: string): boolean;
  wallet_restore(backupPath: string, passphrase: string): WalletHandle | null;
  
  // Coin splitting and management
  wallet_coin_split(wallet: WalletHandle, commitments: string[], feePerGram: bigint, count: number): bigint | null;
  wallet_coin_join(wallet: WalletHandle, commitments: string[], feePerGram: bigint): bigint | null;
  
  // Fee estimation
  wallet_estimate_fee(wallet: WalletHandle, amount: bigint, feePerGram: bigint, kernelCount: number, outputCount: number): bigint;
  
  // Seed and key management
  wallet_from_seed_words(seedWords: string, network: Network, passphrase?: string): WalletHandle | null;
  wallet_generate_seed_words(): string | null;
  wallet_verify_seed_words(seedWords: string): boolean;
  
  // Address book extended operations
  wallet_get_contact_by_alias(wallet: WalletHandle, alias: string): number | null;
  wallet_get_contact_by_address(wallet: WalletHandle, address: string): number | null;
  
  // Validation and verification
  wallet_validate_address(address: string): boolean;
  wallet_validate_emoji_id(emojiId: string): boolean;
  wallet_validate_public_key(publicKey: string): boolean;
  
  // Chain monitoring
  wallet_get_chain_height(wallet: WalletHandle): number;
  wallet_get_block_hash(wallet: WalletHandle, height: number): string | null;
  wallet_get_block_timestamp(wallet: WalletHandle, height: number): bigint;
  
  // Mining and coinbase
  wallet_generate_coinbase_transaction(wallet: WalletHandle, amount: bigint, fee: bigint, height: number): TransactionHandle | null;
  
  // Sync and recovery operations
  wallet_sync_with_base_node(wallet: WalletHandle): boolean;
  wallet_set_sync_mode(wallet: WalletHandle, mode: number): void;
  wallet_get_sync_progress(wallet: WalletHandle): number;
  
  // Power management
  wallet_get_power_mode(wallet: WalletHandle): number;
  
  // Tor and privacy
  wallet_set_tor_identity(wallet: WalletHandle, identity: string): boolean;
  wallet_get_tor_identity(wallet: WalletHandle): string | null;
  
  // Mempool and transaction pool
  wallet_get_mempool_transactions(wallet: WalletHandle): number | null;
  wallet_revalidate_transactions(wallet: WalletHandle): boolean;
  
  // Event streaming
  wallet_start_event_stream(wallet: WalletHandle): boolean;
  wallet_stop_event_stream(wallet: WalletHandle): boolean;
}

// Configuration types
export interface WalletCreateConfig {
  seedWords: string;
  network: Network;
  dbPath?: string;
  dbName?: string;
  passphrase?: string;
  logPath?: string;
  callbacks?: WalletCallbacks;
}

export interface WalletCallbacks {
  onReceivedTransaction?: TransactionCallback;
  onTransactionBroadcast?: TransactionCallback;
  onTransactionMined?: TransactionCallback;
  onBalanceUpdated?: BalanceCallback;
  onConnectivityStatus?: ConnectivityCallback;
  onTransactionValidation?: ValidationCallback;
}

// Additional configuration interfaces
export interface BaseNodePeer {
  publicKey: string;
  address: string;
}

export interface TransactionSendParams {
  destination: string;
  amount: bigint;
  feePerGram?: bigint;
  message?: string;
  oneSided?: boolean;
}

export interface WalletSyncConfig {
  baseNodePeers: BaseNodePeer[];
  syncMode: 'full' | 'light' | 'pruned';
  enableTor?: boolean;
  torIdentity?: string;
}

export interface BackupConfig {
  path: string;
  includeKeys?: boolean;
  compress?: boolean;
  encrypt?: boolean;
}

// Error handling
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

// Type guards for branded types
export function isWalletHandle(value: number): value is WalletHandle {
  return typeof value === 'number' && value > 0;
}

export function isAddressHandle(value: number): value is AddressHandle {
  return typeof value === 'number' && value > 0;
}

export function isTransactionHandle(value: number): value is TransactionHandle {
  return typeof value === 'number' && value > 0;
}

// Utility types for optional parameters
export type OptionalWalletConfig = Partial<WalletCreateConfig> & Pick<WalletCreateConfig, 'seedWords' | 'network'>;
