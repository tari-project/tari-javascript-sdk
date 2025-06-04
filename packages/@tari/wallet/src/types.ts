export interface WalletConfig {
  network: 'mainnet' | 'testnet';
  dataDir: string;
}

export interface Transaction {
  id: string;
  amount: bigint;
  fee: bigint;
  timestamp: Date;
}
