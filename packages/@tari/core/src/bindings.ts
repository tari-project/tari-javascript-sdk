import { 
  WalletHandle, 
  AddressHandle, 
  Network, 
  WalletCreateConfig 
} from './ffi-types';

// Re-export handle types so they can be imported from bindings
export { WalletHandle, AddressHandle, Network, WalletCreateConfig } from './ffi-types';

export interface NativeBinding {
  // Core
  initialize(): void;
  
  // Wallet operations
  walletCreate(config: WalletCreateConfig): WalletHandle;
  walletDestroy(handle: WalletHandle): void;
  walletGetSeedWords(handle: WalletHandle): string;
  walletGetBalance(handle: WalletHandle): RawBalance;
  walletGetAddress(handle: WalletHandle): RawAddress;
  walletSendTransaction(handle: WalletHandle, params: SendParams): string;
  
  // Key management
  privateKeyGenerate(): number;
  privateKeyFromHex(hex: string): number;
  privateKeyDestroy(handle: number): void;
  publicKeyFromPrivateKey(privateKey: number): number;
  publicKeyDestroy(handle: number): void;
  
  // UTXO management
  walletGetUtxos(wallet: number, page?: number, pageSize?: number): RawUtxo[];
  walletImportUtxo(wallet: number, params: ImportUtxoParams): boolean;
  
  // Mining
  walletCoinSplit(wallet: number, params: CoinSplitParams): string;
  walletCoinJoin(wallet: number, params: CoinJoinParams): string;
  
  // Recovery
  walletStartRecovery(wallet: number, baseNodeKey: string, callback: (current: number, total: number) => void): boolean;
  walletIsRecoveryInProgress(wallet: number): boolean;
  
  // P2P operations
  walletGetPeers(wallet: number): RawPeer[];
  walletAddPeer(wallet: number, publicKey: string, address: string): boolean;
  walletBanPeer(wallet: number, publicKey: string, duration?: number): boolean;
  
  // Advanced features
  createCovenant(data: Uint8Array): number;
  covenantDestroy(handle: number): void;
  compileScript(source: string): number;
  scriptDestroy(handle: number): void;
  
  // Memory management helpers
  addressDestroy(handle: AddressHandle): void;
  
  // Callback management
  registerCallback(callback: Function): number;
  unregisterCallback(id: number): boolean;
  clearAllCallbacks(): void;
  getCallbackCount(): number;
}

export interface RawBalance {
  available: string;
  pending: string;
  locked: string;
  total: string;
}

export interface RawAddress {
  handle: AddressHandle;
  emojiId: string;
}

export interface SendParams {
  destination: string;
  amount: string;
  feePerGram?: string;
  message?: string;
  oneSided?: boolean;
}

export interface RawUtxo {
  value: string;
  commitment: string;
  minedHeight: number;
  status: number;
}

export interface ImportUtxoParams {
  amount: string;
  spendingKey?: number;
  sourcePublicKey?: number;
  message?: string;
}

export interface CoinSplitParams {
  amount: string;
  count: number;
  feePerGram?: string;
  message?: string;
  lockHeight?: number;
}

export interface CoinJoinParams {
  commitments: string[];
  feePerGram?: string;
  message?: string;
}

export interface RawPeer {
  publicKey: string;
  address: string;
  lastSeen: number;
  banned: boolean;
}

// This will be populated by the loader
export let binding: NativeBinding;

export function setBinding(nativeBinding: NativeBinding) {
  binding = nativeBinding;
}
