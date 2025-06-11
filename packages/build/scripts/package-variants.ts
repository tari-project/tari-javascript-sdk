#!/usr/bin/env node
/**
 * @fileoverview Script to create network-specific package variants
 */

import { PackageBuilder } from '../src/package/index';
import { NetworkType } from '@tari-project/tarijs-core';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: package-variants <binary-dir>');
    console.error('Example: package-variants ./dist');
    process.exit(1);
  }

  const [binaryDir] = args;

  try {
    const networks = [NetworkType.Mainnet, NetworkType.Testnet, NetworkType.Nextnet];
    
    for (const network of networks) {
      console.log(`Creating package variant for ${network}...`);
      
      const variant = {
        network,
        packageName: `@tari-project/tarijs-wallet${network === NetworkType.Mainnet ? '' : `-${network}`}`,
        binaryPath: `${binaryDir}/${network}`,
        outputPath: `./packages/wallet-${network}`,
        npmTag: network === NetworkType.Mainnet ? 'latest' : network,
      };

      await PackageBuilder.createVariant(variant);
      console.log(`Package variant created: ${variant.packageName}`);
    }

    console.log('All package variants created successfully');
  } catch (error) {
    console.error('Failed to create package variants:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
