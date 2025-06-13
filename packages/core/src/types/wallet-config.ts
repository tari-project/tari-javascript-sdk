/**
 * @fileoverview Wallet-specific configuration interfaces
 * 
 * Defines configuration types specifically for wallet operations,
 * initialization, and lifecycle management.
 */

import {
  NetworkType,
  LogLevel,
  MnemonicWordCount
} from './enums';
import type {
  ValidatedSeedPhrase,
  ValidatedPassphrase,
  WalletPath,
  LogPath,
  DurationMs,
  PublicKey
} from './branded';
import type { CoreConfig } from './config';
import type { OptionalFields, RequireFields } from './utils';

// Base wallet configuration
export interface BaseWalletConfig {
  /** Network type */
  network: NetworkType;
  /** Storage path for wallet data */
  storagePath: WalletPath;
}

// Wallet initialization configuration
export interface WalletInitConfig extends BaseWalletConfig {
  /** Wallet passphrase for encryption */
  passphrase?: ValidatedPassphrase;
  /** Seed words for wallet recovery (mutually exclusive with wallet creation) */
  seedWords?: ValidatedSeedPhrase;
  /** Number of seed words to generate (only for new wallets) */
  mnemonicWordCount?: MnemonicWordCount;
  /** Custom wallet name */
  name?: string;
  /** Enable wallet encryption */
  encrypted?: boolean;
}

// Wallet creation configuration (for new wallets)
export interface WalletCreateConfig extends BaseWalletConfig {
  /** Wallet passphrase for encryption */
  passphrase?: ValidatedPassphrase;
  /** Number of seed words to generate */
  mnemonicWordCount?: MnemonicWordCount;
  /** Custom wallet name */
  name?: string;
  /** Enable wallet encryption */
  encrypted?: boolean;
  /** Custom entropy for seed generation */
  entropy?: Uint8Array;
}

// Wallet restoration configuration (from existing seed)
export interface WalletRestoreConfig extends BaseWalletConfig {
  /** Seed words for wallet recovery */
  seedWords: ValidatedSeedPhrase;
  /** Wallet passphrase for encryption */
  passphrase?: ValidatedPassphrase;
  /** Custom wallet name */
  name?: string;
  /** Enable wallet encryption */
  encrypted?: boolean;
  /** Start recovery from specific block height */
  recoveryStartHeight?: bigint;
  /** Birthday block height for faster recovery */
  birthdayHeight?: bigint;
}

// Comprehensive wallet configuration
export interface WalletConfig extends BaseWalletConfig {
  // Core settings
  /** Wallet passphrase */
  passphrase?: ValidatedPassphrase;
  /** Seed words (for restoration) */
  seedWords?: ValidatedSeedPhrase;
  /** Wallet name */
  name?: string;
  /** Enable encryption */
  encrypted?: boolean;

  // Logging configuration
  /** Log file path */
  logPath?: LogPath;
  /** Log level */
  logLevel?: LogLevel;
  /** Number of rolling log files */
  numRollingLogFiles?: number;
  /** Maximum log file size in bytes */
  rollingLogFileSize?: number;

  // Network configuration
  /** Base node public key */
  baseNodePublicKey?: PublicKey;
  /** Base node address */
  baseNodeAddress?: string;

  // Performance settings
  /** Database connection pool size */
  dbConnectionPoolSize?: number;
  /** Query timeout in milliseconds */
  queryTimeout?: DurationMs;
  /** Enable write-ahead logging */
  enableWAL?: boolean;

  // Security settings
  /** Auto-save interval in milliseconds */
  autoSaveInterval?: DurationMs;
  /** Enable secure deletion of sensitive data */
  secureDelete?: boolean;
  /** Key derivation parameters */
  keyDerivation?: {
    iterations?: number;
    memorySize?: number;
    parallelism?: number;
  };

  // Sync settings
  /** Enable automatic blockchain sync */
  autoSync?: boolean;
  /** Sync check interval in milliseconds */
  syncCheckInterval?: DurationMs;
  /** Recovery scan batch size */
  recoveryScanBatchSize?: number;

  // Fee settings
  /** Default fee per gram in MicroTari */
  defaultFeePerGram?: bigint;
  /** Fee estimation strategy */
  feeEstimationStrategy?: 'conservative' | 'balanced' | 'aggressive';

  // Transaction settings
  /** Maximum number of UTXOs to use in a transaction */
  maxUtxosPerTx?: number;
  /** Enable one-sided payments */
  enableOneSidedPayments?: boolean;
  /** Transaction timeout in milliseconds */
  transactionTimeout?: DurationMs;

  // Coinbase settings
  /** Enable coinbase monitoring */
  enableCoinbaseMonitoring?: boolean;
  /** Coinbase extra data */
  coinbaseExtraData?: Uint8Array;

  // Advanced settings
  /** Custom user agent string */
  userAgent?: string;
  /** Enable tor support */
  torEnabled?: boolean;
  /** Tor SOCKS proxy address */
  torSocksAddress?: string;
  /** Custom DNS servers */
  dnsServers?: string[];
}

// Wallet connection configuration
export interface WalletConnectionConfig {
  /** Network type */
  network: NetworkType;
  /** Base node peers */
  baseNodePeers: Array<{
    publicKey: PublicKey;
    address: string;
    priority?: number;
  }>;
  /** Connection timeout in milliseconds */
  connectionTimeout?: DurationMs;
  /** Reconnection attempts */
  maxReconnectAttempts?: number;
  /** Reconnection delay in milliseconds */
  reconnectDelay?: DurationMs;
  /** Enable peer discovery */
  enablePeerDiscovery?: boolean;
  /** Maximum number of peers */
  maxPeers?: number;
}

// Wallet backup configuration
export interface WalletBackupConfig {
  /** Enable automatic backups */
  enabled: boolean;
  /** Backup interval in milliseconds */
  interval: DurationMs;
  /** Backup destination path */
  destinationPath: string;
  /** Maximum number of backups to keep */
  maxBackups: number;
  /** Encrypt backups */
  encrypted: boolean;
  /** Backup passphrase (if different from wallet passphrase) */
  backupPassphrase?: ValidatedPassphrase;
  /** Include transaction history in backups */
  includeHistory: boolean;
  /** Compress backups */
  compressed: boolean;
}

// Wallet recovery configuration
export interface WalletRecoveryConfig {
  /** Seed words */
  seedWords: ValidatedSeedPhrase;
  /** Recovery start height */
  startHeight?: bigint;
  /** Birthday height for faster recovery */
  birthdayHeight?: bigint;
  /** Recovery batch size */
  batchSize?: number;
  /** Recovery timeout in milliseconds */
  timeout?: DurationMs;
  /** Skip validation during recovery */
  skipValidation?: boolean;
  /** Maximum recovery attempts */
  maxAttempts?: number;
}

// Wallet validation configuration
export interface WalletValidationConfig {
  /** Validate transactions */
  validateTransactions: boolean;
  /** Validate UTXOs */
  validateUtxos: boolean;
  /** Validation batch size */
  batchSize: number;
  /** Validation timeout in milliseconds */
  timeout: DurationMs;
  /** Retry failed validations */
  retryFailures: boolean;
  /** Maximum validation attempts */
  maxAttempts: number;
}

// Wallet monitoring configuration
export interface WalletMonitoringConfig {
  /** Enable transaction monitoring */
  transactions: boolean;
  /** Enable balance monitoring */
  balance: boolean;
  /** Enable connectivity monitoring */
  connectivity: boolean;
  /** Enable performance monitoring */
  performance: boolean;
  /** Monitoring interval in milliseconds */
  interval: DurationMs;
  /** Alert thresholds */
  thresholds: {
    /** Low balance threshold in MicroTari */
    lowBalance?: bigint;
    /** High fee threshold in MicroTari */
    highFee?: bigint;
    /** Sync lag threshold in blocks */
    syncLag?: number;
    /** Connection failure threshold */
    connectionFailures?: number;
  };
}

// Complete wallet configuration combining all aspects
export interface CompleteWalletConfig extends WalletConfig {
  /** Connection configuration */
  connection?: WalletConnectionConfig;
  /** Backup configuration */
  backup?: WalletBackupConfig;
  /** Recovery configuration */
  recovery?: WalletRecoveryConfig;
  /** Validation configuration */
  validation?: WalletValidationConfig;
  /** Monitoring configuration */
  monitoring?: WalletMonitoringConfig;
  /** Core SDK configuration */
  core?: Partial<CoreConfig>;
}

// Configuration presets for different use cases
export interface WalletConfigPresets {
  /** Development environment preset */
  development: Partial<CompleteWalletConfig>;
  /** Testing environment preset */
  testing: Partial<CompleteWalletConfig>;
  /** Production environment preset */
  production: Partial<CompleteWalletConfig>;
  /** Mobile optimized preset */
  mobile: Partial<CompleteWalletConfig>;
  /** Server optimized preset */
  server: Partial<CompleteWalletConfig>;
  /** High security preset */
  highSecurity: Partial<CompleteWalletConfig>;
  /** Performance optimized preset */
  performance: Partial<CompleteWalletConfig>;
}

// Default wallet configuration values
export const DEFAULT_WALLET_CONFIG: WalletConfig = {
  network: NetworkType.Testnet,
  storagePath: './wallet' as WalletPath,
  encrypted: true,
  logLevel: LogLevel.Info,
  numRollingLogFiles: 5,
  rollingLogFileSize: 10 * 1024 * 1024, // 10MB
  dbConnectionPoolSize: 10,
  queryTimeout: 30000 as DurationMs,
  enableWAL: true,
  autoSaveInterval: 60000 as DurationMs, // 1 minute
  secureDelete: true,
  keyDerivation: {
    iterations: 100000,
    memorySize: 64 * 1024 * 1024, // 64MB
    parallelism: 4
  },
  autoSync: true,
  syncCheckInterval: 30000 as DurationMs, // 30 seconds
  recoveryScanBatchSize: 1000,
  defaultFeePerGram: 25n,
  feeEstimationStrategy: 'balanced' as const,
  maxUtxosPerTx: 500,
  enableOneSidedPayments: true,
  transactionTimeout: 600000 as DurationMs, // 10 minutes
  enableCoinbaseMonitoring: false,
  torEnabled: false,
  dnsServers: []
};

// Configuration validation types
export interface WalletConfigValidationResult {
  valid: boolean;
  errors: WalletConfigValidationError[];
  warnings: WalletConfigValidationWarning[];
}

export interface WalletConfigValidationError {
  field: string;
  message: string;
  code: string;
  severity: 'error' | 'warning';
}

export interface WalletConfigValidationWarning {
  field: string;
  message: string;
  code: string;
  recommendation: string;
}

// Configuration factory types
export type WalletConfigFactory = {
  /** Create configuration for new wallet */
  forNewWallet(config: WalletCreateConfig): CompleteWalletConfig;
  /** Create configuration for wallet restoration */
  forRestoration(config: WalletRestoreConfig): CompleteWalletConfig;
  /** Create configuration with preset */
  withPreset(preset: keyof WalletConfigPresets, overrides?: Partial<CompleteWalletConfig>): CompleteWalletConfig;
  /** Validate configuration */
  validate(config: CompleteWalletConfig): WalletConfigValidationResult;
  /** Merge configurations */
  merge(...configs: Partial<CompleteWalletConfig>[]): CompleteWalletConfig;
  /** Create from environment variables */
  fromEnvironment(): CompleteWalletConfig;
};

// Type guards for wallet configuration
export function isWalletConfig(value: unknown): value is WalletConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'network' in value &&
    'storagePath' in value &&
    typeof (value as any).network === 'string' &&
    typeof (value as any).storagePath === 'string'
  );
}

export function isWalletCreateConfig(value: unknown): value is WalletCreateConfig {
  return (
    isWalletConfig(value) &&
    !('seedWords' in value)
  );
}

export function isWalletRestoreConfig(value: unknown): value is WalletRestoreConfig {
  return (
    isWalletConfig(value) &&
    'seedWords' in value &&
    Array.isArray((value as any).seedWords)
  );
}

// Configuration builder for fluent API
export class WalletConfigBuilder {
  private config: Partial<CompleteWalletConfig> = {};

  network(network: NetworkType): this {
    this.config.network = network;
    return this;
  }

  storagePath(path: WalletPath): this {
    this.config.storagePath = path;
    return this;
  }

  passphrase(passphrase: ValidatedPassphrase): this {
    this.config.passphrase = passphrase;
    return this;
  }

  seedWords(words: ValidatedSeedPhrase): this {
    this.config.seedWords = words;
    return this;
  }

  encrypted(enabled: boolean = true): this {
    this.config.encrypted = enabled;
    return this;
  }

  logLevel(level: LogLevel): this {
    this.config.logLevel = level;
    return this;
  }

  autoSync(enabled: boolean = true): this {
    this.config.autoSync = enabled;
    return this;
  }

  defaultFee(feePerGram: bigint): this {
    this.config.defaultFeePerGram = feePerGram;
    return this;
  }

  preset(preset: keyof WalletConfigPresets): this {
    // Implementation would merge preset configuration
    return this;
  }

  merge(other: Partial<CompleteWalletConfig>): this {
    this.config = { ...this.config, ...other };
    return this;
  }

  build(): CompleteWalletConfig {
    // Validate required fields and merge with defaults
    const merged = { ...DEFAULT_WALLET_CONFIG, ...this.config };
    return merged as CompleteWalletConfig;
  }

  validate(): WalletConfigValidationResult {
    // Implementation would validate the current configuration
    return {
      valid: true,
      errors: [],
      warnings: []
    };
  }
}

// Configuration utilities
export function createWalletConfig(): WalletConfigBuilder {
  return new WalletConfigBuilder();
}

export function mergeWalletConfigs(
  base: Partial<CompleteWalletConfig>,
  ...overrides: Partial<CompleteWalletConfig>[]
): CompleteWalletConfig {
  return overrides.reduce(
    (merged, override) => ({ ...merged, ...override }),
    { ...DEFAULT_WALLET_CONFIG, ...base }
  ) as CompleteWalletConfig;
}
