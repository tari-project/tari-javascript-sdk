export interface NativeBinding {
  initialize(): void;
  walletCreate(config: WalletConfig): number;
  walletDestroy(handle: number): void;
}

export interface WalletConfig {
  seedWords: string;
  network?: number;
  dbPath?: string;
  passphrase?: string;
}

export enum Network {
  Mainnet = 0,
  Testnet = 1,
  Nextnet = 2,
}

// This will be populated by the loader
export let binding: NativeBinding;

export function setBinding(nativeBinding: NativeBinding) {
  binding = nativeBinding;
}
