#!/usr/bin/env node
/**
 * CLI interface for Tari SDK build system
 */

import { Command } from 'commander';
import { NetworkType, Platform, Architecture } from './types.js';
import { getCurrentPlatform, getCurrentArchitecture, BUILD_TARGETS } from './config.js';
import { VariantBuilder } from './build-variant.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('cli');
const program = new Command();

program
  .name('build-ffi')
  .description('Build Tari wallet FFI bindings')
  .version('0.0.1');

program
  .command('build')
  .description('Build FFI for specified network and platform')
  .option('-n, --network <network>', 'Network type (mainnet, testnet, nextnet)', 'mainnet')
  .option('-p, --platform <platform>', 'Target platform')
  .option('-a, --arch <arch>', 'Target architecture')
  .option('-v, --version <version>', 'Tari version', '4.3.1')
  .option('--debug', 'Build in debug mode')
  .option('--force', 'Force rebuild')
  .option('-o, --output <dir>', 'Output directory', './dist')
  .action(async (options) => {
    try {
      const network = options.network as NetworkType;
      const platform = options.platform || getCurrentPlatform();
      const arch = options.arch || getCurrentArchitecture();
      
      const target = BUILD_TARGETS[`${platform}-${arch}`];
      if (!target) {
        throw new Error(`No target found for ${platform}-${arch}`);
      }

      const builder = new VariantBuilder();
      const result = await builder.buildVariant(network, {
        version: options.version,
        targets: [target],
        outputDir: options.output,
        debug: options.debug,
        force: options.force
      });

      logger.success(`Build completed: ${result.packageName}`);
    } catch (error) {
      logger.failure(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command('list-targets')
  .description('List available build targets')
  .action(() => {
    console.log('Available build targets:');
    Object.entries(BUILD_TARGETS).forEach(([key, target]) => {
      console.log(`  ${key}: ${target.rustTarget}`);
    });
  });

program.parse(process.argv);
