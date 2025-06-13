/**
 * Wallet types for the Tauri application
 */

export interface WalletConfig {
  network: string;
  storage_path: string;
  log_level: string;
  passphrase?: string;
}

export interface Balance {
  available: number;
  pending_incoming: number;
  pending_outgoing: number;
  timelocked: number;
}

export interface TransactionInfo {
  id: string;
  direction: 'incoming' | 'outgoing';
  amount: number;
  fee: number;
  status: string;
  timestamp: number;
  message?: string;
  source_address?: string;
  destination_address?: string;
}

export interface WalletStatus {
  is_initialized: boolean;
  is_connected: boolean;
  network?: string;
  node_peers: number;
  chain_height: number;
  wallet_height: number;
}

export interface SendTransactionRequest {
  recipient: string;
  amount: number;
  fee_per_gram?: number;
  message?: string;
}

export interface StorageInfo {
  backend: string;
  version: string;
  secure: boolean;
  supports_metadata: boolean;
}

export interface StorageMetadata {
  created_at: number;
  updated_at: number;
  size: number;
  encrypted: boolean;
}

export interface PlatformInfo {
  platform: string;
  arch: string;
  version: string;
  tauri_version: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    error: string;
    code: string;
    timestamp: number;
  };
  timestamp: number;
}

export interface WalletState {
  balance?: Balance;
  address?: string;
  transactions: TransactionInfo[];
  status?: WalletStatus;
  storageInfo?: StorageInfo;
  isLoading: boolean;
  error?: string;
  isInitialized: boolean;
}

export interface SendFormData {
  recipient: string;
  amount: string;
  message: string;
}

export const NETWORKS = {
  TESTNET: 'testnet',
  MAINNET: 'mainnet',
  LOCALNET: 'localnet'
} as const;

export type NetworkType = typeof NETWORKS[keyof typeof NETWORKS];
