import { 
  WalletHandle, 
  AddressHandle, 
  Network, 
  WalletCreateConfig 
} from './ffi-types';

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

// This will be populated by the loader
export let binding: NativeBinding;

export function setBinding(nativeBinding: NativeBinding) {
  binding = nativeBinding;
}
