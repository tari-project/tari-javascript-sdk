/**
 * @fileoverview Default configuration values and network presets for Tari wallets
 * 
 * Provides sensible defaults for wallet configuration and network-specific
 * presets that match the mobile wallet implementations.
 */

import { NetworkType } from '@tari-project/tarijs-core';
import type { WalletConfig } from '../types/index.js';

/**
 * Default values for wallet configuration
 */
export const DEFAULT_CONFIG = {
  // Logging configuration
  logLevel: 2 as const, // INFO level
  numRollingLogFiles: 10,
  rollingLogFileSize: 10_485_760, // 10MB

  // Operation timeouts
  connectionTimeoutMs: 30_000,
  transactionTimeoutMs: 60_000,
  syncTimeoutMs: 300_000, // 5 minutes
} as const;

/**
 * Network-specific configuration presets
 */
export const NETWORK_PRESETS: Record<NetworkType, Partial<WalletConfig>> = {
  [NetworkType.Mainnet]: {
    network: NetworkType.Mainnet,
    logLevel: 1, // WARN level for production
    numRollingLogFiles: 5,
    rollingLogFileSize: 5_242_880, // 5MB
  },

  [NetworkType.Testnet]: {
    network: NetworkType.Testnet,
    logLevel: 2, // INFO level for testing
    numRollingLogFiles: 10,
    rollingLogFileSize: 10_485_760, // 10MB
  },

  [NetworkType.Nextnet]: {
    network: NetworkType.Nextnet,
    logLevel: 3, // DEBUG level for development
    numRollingLogFiles: 20,
    rollingLogFileSize: 20_971_520, // 20MB
  },
};

/**
 * Merge user configuration with defaults and network presets
 */
export function mergeConfig(userConfig: Partial<WalletConfig>): WalletConfig {
  // Start with defaults
  const merged = { ...DEFAULT_CONFIG } as WalletConfig;

  // Apply network preset if specified
  if (userConfig.network) {
    const networkPreset = NETWORK_PRESETS[userConfig.network];
    Object.assign(merged, networkPreset);
  }

  // Apply user overrides
  Object.assign(merged, userConfig);

  // Ensure required fields are present
  if (!merged.network) {
    throw new Error('Network type is required in wallet configuration');
  }

  if (!merged.storagePath) {
    throw new Error('Storage path is required in wallet configuration');
  }

  return merged;
}

/**
 * Get default storage path for a given network
 */
export function getDefaultStoragePath(network: NetworkType): string {
  const networkSuffix = network === NetworkType.Mainnet ? '' : `-${network}`;
  
  // Platform-specific default storage paths
  if (typeof process !== 'undefined' && process.platform) {
    const os = process.platform;
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
    
    switch (os) {
      case 'win32':
        return `${process.env.APPDATA || homeDir}\\Tari\\wallet${networkSuffix}`;
      case 'darwin':
        return `${homeDir}/Library/Application Support/Tari/wallet${networkSuffix}`;
      default: // Linux and others
        return `${homeDir}/.tari/wallet${networkSuffix}`;
    }
  }
  
  // Fallback for unknown environments
  return `./tari-wallet${networkSuffix}`;
}

/**
 * Get default log path for a given network
 */
export function getDefaultLogPath(network: NetworkType): string {
  const networkSuffix = network === NetworkType.Mainnet ? '' : `-${network}`;
  
  // Platform-specific default log paths
  if (typeof process !== 'undefined' && process.platform) {
    const os = process.platform;
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
    
    switch (os) {
      case 'win32':
        return `${process.env.APPDATA || homeDir}\\Tari\\logs${networkSuffix}`;
      case 'darwin':
        return `${homeDir}/Library/Logs/Tari${networkSuffix}`;
      default: // Linux and others
        return `${homeDir}/.tari/logs${networkSuffix}`;
    }
  }
  
  // Fallback for unknown environments
  return `./tari-logs${networkSuffix}`;
}

/**
 * Create a complete configuration with defaults applied
 */
export function createWalletConfig(overrides: Partial<WalletConfig> = {}): WalletConfig {
  const config = mergeConfig(overrides);
  
  // Apply default paths if not specified
  if (!config.storagePath && config.network) {
    config.storagePath = getDefaultStoragePath(config.network);
  }
  
  if (!config.logPath && config.network) {
    config.logPath = getDefaultLogPath(config.network);
  }
  
  return config;
}
