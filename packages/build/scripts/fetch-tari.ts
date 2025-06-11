#!/usr/bin/env node
/**
 * @fileoverview Script to fetch Tari source code for compilation
 */

import { TariSourceFetcher } from '../src/fetch/index';
import { NetworkType } from '@tari-project/tarijs-core';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: fetch-tari <version> <network>');
    console.error('Example: fetch-tari 4.3.1 testnet');
    process.exit(1);
  }

  const [version, networkStr] = args;
  const network = networkStr as NetworkType;

  if (!Object.values(NetworkType).includes(network)) {
    console.error(`Invalid network: ${networkStr}`);
    console.error(`Valid networks: ${Object.values(NetworkType).join(', ')}`);
    process.exit(1);
  }

  try {
    console.log(`Fetching Tari ${version} for ${network}...`);
    
    const config = {
      baseUrl: 'https://github.com/tari-project/tari',
      version,
      network,
    };

    const sourcePath = await TariSourceFetcher.fetchSource(config);
    console.log(`Tari source available at: ${sourcePath}`);
  } catch (error) {
    console.error('Failed to fetch Tari source:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
