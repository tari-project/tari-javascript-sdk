/**
 * Transaction API configuration
 * Factory pattern for configuration objects
 */

import { MicroTari } from '@tari-project/tarijs-core';

export interface TransactionApiConfig {
  readonly defaultFee: MicroTari;
  readonly maxRetries: number;
  readonly timeout: number;
  readonly confirmationThreshold: number;
  readonly enableBatching: boolean;
  readonly batchSize: number;
}

export interface NetworkConfig {
  readonly baseNodeUrl?: string;
  readonly networkType: 'mainnet' | 'testnet' | 'localnet';
  readonly connectionTimeout: number;
  readonly requestTimeout: number;
}

/**
 * Default transaction API configuration
 */
export const DEFAULT_TRANSACTION_CONFIG: TransactionApiConfig = {
  defaultFee: 25n as MicroTari,
  maxRetries: 3,
  timeout: 30000, // 30 seconds
  confirmationThreshold: 3,
  enableBatching: false,
  batchSize: 10,
};

/**
 * Default network configuration
 */
export const DEFAULT_NETWORK_CONFIG: NetworkConfig = {
  networkType: 'testnet',
  connectionTimeout: 10000, // 10 seconds
  requestTimeout: 30000, // 30 seconds
};

/**
 * Configuration factory for transaction API
 */
export class TransactionConfigFactory {
  
  /**
   * Create transaction config with overrides
   */
  static createTransactionConfig(
    overrides: Partial<TransactionApiConfig> = {}
  ): TransactionApiConfig {
    return {
      ...DEFAULT_TRANSACTION_CONFIG,
      ...overrides,
    };
  }

  /**
   * Create network config with overrides
   */
  static createNetworkConfig(
    overrides: Partial<NetworkConfig> = {}
  ): NetworkConfig {
    return {
      ...DEFAULT_NETWORK_CONFIG,
      ...overrides,
    };
  }

  /**
   * Create config for high-frequency trading
   */
  static createHighFrequencyConfig(): TransactionApiConfig {
    return this.createTransactionConfig({
      defaultFee: 100n as MicroTari, // Higher fee for priority
      maxRetries: 1, // Faster failures
      timeout: 10000, // Shorter timeout
      enableBatching: true,
      batchSize: 50,
    });
  }

  /**
   * Create config for low-fee transactions
   */
  static createLowFeeConfig(): TransactionApiConfig {
    return this.createTransactionConfig({
      defaultFee: 5n as MicroTari, // Lower fee
      maxRetries: 5, // More retries
      timeout: 60000, // Longer timeout
      confirmationThreshold: 6, // More confirmations
    });
  }

  /**
   * Create config for mainnet
   */
  static createMainnetConfig(): NetworkConfig {
    return this.createNetworkConfig({
      networkType: 'mainnet',
      connectionTimeout: 15000,
      requestTimeout: 45000,
    });
  }

  /**
   * Create config for local development
   */
  static createLocalConfig(): NetworkConfig {
    return this.createNetworkConfig({
      networkType: 'localnet',
      baseNodeUrl: 'http://localhost:18142',
      connectionTimeout: 5000,
      requestTimeout: 15000,
    });
  }
}
