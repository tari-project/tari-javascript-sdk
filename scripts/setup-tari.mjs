#!/usr/bin/env node

/**
 * Tari Source Setup Script
 * Uses the build system to fetch and cache Tari source code
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { symlink, unlink } from 'fs/promises';

// Get script directory and project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);

// Change to project root
process.chdir(projectRoot);

// Configuration
const DEFAULT_VERSION = '4.3.1';
const DEFAULT_NETWORK = 'mainnet';
const DEFAULT_CACHE_DIR = '.tari-cache';

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function colorize(color, text) {
  return `${colors[color]}${text}${colors.reset}`;
}

function printInfo(message) {
  console.log(colorize('blue', '[INFO]'), message);
}

function printSuccess(message) {
  console.log(colorize('green', '[SUCCESS]'), message);
}

function printWarning(message) {
  console.log(colorize('yellow', '[WARNING]'), message);
}

function printError(message) {
  console.log(colorize('red', '[ERROR]'), message);
}

function showHelp() {
  const scriptName = 'node scripts/setup-tari.mjs';
  console.log(`
${colorize('bright', 'Tari Source Setup Script')}

${colorize('bright', 'USAGE:')}
    ${scriptName} [OPTIONS]

${colorize('bright', 'OPTIONS:')}
    -v, --version VERSION    Tari version to fetch (default: ${DEFAULT_VERSION})
    -n, --network NETWORK    Network type: mainnet, testnet, nextnet (default: ${DEFAULT_NETWORK})
    -f, --force             Force re-fetch even if cached
    -c, --cache-dir DIR     Cache directory (default: ${DEFAULT_CACHE_DIR})
    -h, --help              Show this help message

${colorize('bright', 'EXAMPLES:')}
    ${scriptName}                                    # Fetch mainnet v${DEFAULT_VERSION}
    ${scriptName} -v 4.3.0 -n testnet              # Fetch testnet v4.3.0-pre.0
    ${scriptName} --force                           # Force re-fetch current version
    ${scriptName} -v 4.2.1 -n nextnet -f          # Force fetch nextnet v4.2.1-rc.0

${colorize('bright', 'ENVIRONMENT VARIABLES:')}
    TARI_VERSION        Override default version
    NETWORK_TYPE        Override default network
    TARI_CACHE_DIR      Override default cache directory
    FORCE_REFETCH       Set to any value to force re-fetch
`);
}

// Parse command line arguments
const args = process.argv.slice(2);
let tariVersion = process.env.TARI_VERSION || DEFAULT_VERSION;
let networkType = process.env.NETWORK_TYPE || DEFAULT_NETWORK;
let cacheDir = process.env.TARI_CACHE_DIR || DEFAULT_CACHE_DIR;
let forceRefetch = process.env.FORCE_REFETCH || false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  switch (arg) {
    case '-v':
    case '--version':
      tariVersion = args[++i];
      break;
    case '-n':
    case '--network':
      networkType = args[++i];
      break;
    case '-f':
    case '--force':
      forceRefetch = true;
      break;
    case '-c':
    case '--cache-dir':
      cacheDir = args[++i];
      break;
    case '-h':
    case '--help':
      showHelp();
      process.exit(0);
    default:
      printError(`Unknown option: ${arg}`);
      showHelp();
      process.exit(1);
  }
}

// Validate network type
const validNetworks = ['mainnet', 'testnet', 'nextnet'];
if (!validNetworks.includes(networkType)) {
  printError(`Invalid network type: ${networkType}`);
  printError(`Valid options: ${validNetworks.join(', ')}`);
  process.exit(1);
}

// Validate version format
if (!/^\d+\.\d+\.\d+$/.test(tariVersion)) {
  printError(`Invalid version format: ${tariVersion}`);
  printError('Expected format: X.Y.Z (e.g., 4.3.1)');
  process.exit(1);
}

async function main() {
  printInfo('Setting up Tari source code');
  printInfo(`Version: ${tariVersion}`);
  printInfo(`Network: ${networkType}`);
  printInfo(`Cache directory: ${cacheDir}`);
  printInfo(`Project root: ${projectRoot}`);
  
  try {
    // Import the build system modules
    const fetchTariPath = resolve(projectRoot, 'packages/build/dist/fetch-tari.js');
    const typesPath = resolve(projectRoot, 'packages/build/dist/types.js');
    
    const { fetchTariSource } = await import(fetchTariPath);
    const { NetworkType } = await import(typesPath);
    
    // Map network string to enum
    const networkMap = {
      mainnet: NetworkType.Mainnet,
      testnet: NetworkType.Testnet,
      nextnet: NetworkType.Nextnet
    };
    
    const network = networkMap[networkType];
    if (!network) {
      throw new Error(`Invalid network: ${networkType}`);
    }
    
    printInfo(`Fetching Tari ${tariVersion} for ${networkType} network...`);
    
    // Determine build number for non-mainnet networks
    let buildNumber;
    if (networkType !== 'mainnet') {
      buildNumber = 0; // Default to build 0
    }
    
    // Fetch the Tari source
    const result = await fetchTariSource(tariVersion, network, {
      buildNumber,
      cacheDir: resolve(cacheDir),
      force: forceRefetch
    });
    
    printSuccess('Tari source fetched successfully');
    printInfo(`   Source path: ${result.sourcePath}`);
    printInfo(`   Git tag: ${result.tag}`);
    printInfo(`   Commit: ${result.commit.substring(0, 8)}...`);
    printInfo(`   From cache: ${result.fromCache}`);
    printInfo(`   Size: ${(result.size / 1024 / 1024).toFixed(1)} MB`);
    
    // Create symlink for 'current' version
    const currentPath = resolve(cacheDir, 'tari-current');
    
    try {
      if (existsSync(currentPath)) {
        await unlink(currentPath);
      }
      await symlink(result.sourcePath, currentPath, 'dir');
      printSuccess(`Symlink created: ${currentPath} -> ${result.sourcePath}`);
    } catch (err) {
      printWarning(`Could not create symlink: ${err.message}`);
    }
    
    // Verify the setup
    const expectedPath = resolve(cacheDir, 'tari-current', 'base_layer', 'wallet_ffi');
    if (existsSync(expectedPath)) {
      printSuccess(`Wallet FFI found at: ${expectedPath}`);
      
      // Verify the Cargo.toml exists
      const cargoTomlPath = resolve(expectedPath, 'Cargo.toml');
      if (existsSync(cargoTomlPath)) {
        printSuccess('Wallet FFI Cargo.toml verified');
      } else {
        printWarning('Wallet FFI Cargo.toml not found');
      }
      
      // Set environment variable recommendation
      const sourcePath = resolve(cacheDir, 'tari-current');
      printInfo(`Set TARI_SOURCE_PATH=${sourcePath} for builds`);
      
    } else {
      printError(`Wallet FFI not found at expected path: ${expectedPath}`);
      process.exit(1);
    }
    
    printSuccess('Setup complete! You can now build the native FFI module.');
    printInfo('To build: npm run build:native');
    printInfo('To test: npm run test:native');
    
  } catch (error) {
    printError(`Failed to fetch Tari source: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  printError(`Unexpected error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
