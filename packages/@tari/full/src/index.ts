export { TariClient, ClientBuilder } from './client';
export { MiningManager } from './mining';
export { P2PManager } from './p2p';
export { AdvancedFeatures } from './advanced';
export { RecoveryManager } from './recovery';

// Re-export everything from wallet
export * from '@tari-project/wallet';

// Re-export core types
export {
  Network,
  TransactionStatus,
  UTXOStatus,
  WalletHandle,
  AddressHandle,
  PublicKeyHandle,
  PrivateKeyHandle,
} from '@tari-project/core';

// Import for convenience function
import { Network } from '@tari-project/core';
import { TariClient } from './client';

// Convenience function for full client
export async function createFullClient(config: {
  network: Network;
  seedWords: string;
  enableAll?: boolean;
}): Promise<TariClient> {
  const builder = TariClient.builder()
    .network(config.network)
    .seedWords(config.seedWords);
  
  if (config.enableAll) {
    builder.enableAll();
  }
  
  const client = builder.build();
  await client.connect();
  
  return client;
}
