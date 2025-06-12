/**
 * TypeScript definitions for the native Tari wallet FFI module
 * These types match the NAPI-RS exports from the Rust implementation
 */

// Handle type for wallet instances
export type WalletHandle = number;

// Configuration interfaces
export interface NativeWalletConfig {
  network: string;
  storage_path: string;
  log_path?: string;
  log_level?: number;
  passphrase?: string;
  seed_words?: string[];
  num_rolling_log_files?: number;
  rolling_log_file_size?: number;
}

export interface NativeBalance {
  available: string;
  pending_incoming: string;
  pending_outgoing: string;
  timelocked: string;
}

export interface NativeTransactionInfo {
  id: string;
  amount: string;
  fee: string;
  status: number;
  message: string;
  timestamp: number;
  is_inbound: boolean;
  address: string;
}

export interface NativeContact {
  alias: string;
  address: string;
  is_favorite: boolean;
  last_seen?: number;
}

export interface NativeUtxoInfo {
  amount: string;
  commitment: string;
  features: number;
  maturity: string;
  status: number;
}

export interface NativeSendTransactionOptions {
  fee_per_gram?: string;
  message?: string;
  is_one_sided?: boolean;
}

export interface NativeBaseNodePeer {
  public_key: string;
  address: string;
}

export interface NativeSeedWords {
  words: string[];
}

// Error information
export interface NativeErrorInfo {
  code: number;
  message: string;
  recoverable: boolean;
  context?: string;
}

// Enum types
export enum NativeConnectivityStatus {
  Offline = 0,
  Connecting = 1,
  Online = 2,
}

export enum NativeTransactionStatus {
  Pending = 0,
  Broadcast = 1,
  MinedUnconfirmed = 2,
  Imported = 3,
  MinedConfirmed = 4,
  Rejected = 5,
  Cancelled = 6,
  Coinbase = 7,
}

export enum NativeLogLevel {
  Off = 0,
  Error = 1,
  Warn = 2,
  Info = 3,
  Debug = 4,
  Trace = 5,
}

// Core wallet FFI functions
export interface NativeBindings {
  // Initialization
  init_logging(level?: number): Promise<void>;

  // Wallet lifecycle
  walletCreate(config: NativeWalletConfig): Promise<WalletHandle>;
  walletDestroy(handle: WalletHandle): Promise<void>;

  // Wallet operations
  walletGetBalance(handle: WalletHandle): Promise<NativeBalance>;
  walletGetAddress(handle: WalletHandle): Promise<string>;
  walletSendTransaction(
    handle: WalletHandle,
    recipientAddress: string,
    amount: string,
    options?: NativeSendTransactionOptions
  ): Promise<string>;
  walletGetSeedWords(handle: WalletHandle): Promise<string[]>;
  walletSetBaseNode(handle: WalletHandle, baseNode: NativeBaseNodePeer): Promise<void>;

  // Utility functions
  walletGetActiveHandleCount(): Promise<number>;
  walletValidateHandle(handle: WalletHandle): Promise<boolean>;
  walletCleanupAll(): Promise<number>;

  // Address utilities
  validateAddress(address: string, network: string): Promise<boolean>;
  emojiIdToAddress(emojiId: string, network: string): Promise<string>;
  addressToEmojiId(address: string): Promise<string>;
  emojiIdToPublicKey(emojiId: string): Promise<string>;

  // Transaction utilities
  walletPreviewUtxoSelection(
    handle: WalletHandle,
    amount: string,
    feePerGram?: string
  ): Promise<{
    total_value: string;
    fee_estimate: string;
    output_count: number;
    inputs: any[];
  }>;

  walletValidateScript(
    handle: WalletHandle,
    recipientAddress: string
  ): Promise<{
    is_valid: boolean;
    errors: string[];
  }>;

  walletGetNetworkInfo(handle: WalletHandle): Promise<{
    network: string;
    min_confirmations: number;
    max_fee_per_gram: string;
    tip_height: number;
  }>;

  // Transaction status and pending transaction methods
  walletGetTransactionStatus(handle: WalletHandle, transactionId: string): Promise<string>;
  walletGetPendingInboundTransactions(handle: WalletHandle): Promise<any[]>;
  walletGetPendingOutboundTransactions(handle: WalletHandle): Promise<any[]>;
  walletGetFeePerGramStats(handle: WalletHandle): Promise<{
    min_fee_per_gram: string;
    avg_fee_per_gram: string;
    max_fee_per_gram: string;
  }>;
  walletGenerateStealthAddress(handle: WalletHandle, recipientAddress: string): Promise<string>;

  // Transaction memo operations
  walletSetTransactionMemo(handle: WalletHandle, transactionId: string, memo: string): Promise<void>;
  walletGetTransactionMemo(handle: WalletHandle, transactionId: string): Promise<string | null>;
  walletDeleteTransactionMemo(handle: WalletHandle, transactionId: string): Promise<void>;
  walletClearTransactionMemos(handle: WalletHandle): Promise<void>;
  walletGetAllTransactionMemos(handle: WalletHandle): Promise<Record<string, string>>;

  // Event callbacks (Phase 8)
  walletSetEventCallback(handle: WalletHandle, callback: (payload: string) => void): Promise<void>;
  walletRemoveEventCallback(handle: WalletHandle): Promise<void>;
  getCallbackStats(): Promise<{ registeredWallets: number; activeCallbacks: number }>;
  cleanupAllCallbacks(): Promise<void>;
}

// Default export type for the native module
declare const NativeModule: NativeBindings;
export default NativeModule;

// Module augmentation for require/import
declare module 'tari-wallet-ffi' {
  const module: NativeBindings;
  export = module;
}
