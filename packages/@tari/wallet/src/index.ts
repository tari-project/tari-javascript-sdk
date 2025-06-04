export { TariWallet, WalletBuilder } from './wallet';
export { DepositManager } from './exchange/deposit-manager';
export { WithdrawalProcessor } from './exchange/withdrawal-processor';
export * from './types';

import { Network } from '@tari-project/core';
import { TariWallet } from './wallet';
import { WalletConfig } from './types';

/**
 * Create a wallet configured for exchange use
 */
export async function createExchangeWallet(config: {
  network: Network;
  seedWords: string;
  dataDir?: string;
  baseNode?: { address: string; publicKey: string };
}): Promise<TariWallet> {
  const wallet = TariWallet.builder()
    .network(config.network)
    .seedWords(config.seedWords)
    .dataDirectory(config.dataDir || './exchange-wallet')
    .baseNode(
      config.baseNode?.address || 'tcp://basenode.tari.com:18189',
      config.baseNode?.publicKey || 'public_key_here'
    )
    .build();
  
  await wallet.connect();
  
  return wallet;
}

/**
 * Format Tari amount for display
 */
export function formatTari(amount: bigint): string {
  const wholeTari = amount / 1_000_000n;
  const microTari = amount % 1_000_000n;
  
  if (microTari === 0n) {
    return `${wholeTari} XTR`;
  }
  
  return `${wholeTari}.${microTari.toString().padStart(6, '0')} XTR`;
}

/**
 * Parse Tari amount from string
 */
export function parseTari(amount: string): bigint {
  const [whole, decimal = '0'] = amount.split('.');
  const wholePart = BigInt(whole) * 1_000_000n;
  const decimalPart = BigInt(decimal.padEnd(6, '0').slice(0, 6));
  
  return wholePart + decimalPart;
}
