/**
 * @fileoverview Configuration interfaces for the Tari JavaScript SDK
 * 
 * Defines configuration types for SDK initialization, network settings,
 * and operational parameters with comprehensive validation support.
 */

import {
  NetworkType,
  LogLevel,
  MnemonicWordCount
} from './enums.js';
import type {
  ValidatedSeedPhrase,
  ValidatedPassphrase,
  WalletPath,
  LogPath,
  DurationMs
} from './branded.js';
import type { OptionalFields, RequireFields, DeepPartial } from './utils.js';

// Base configuration interface
export interface BaseConfig {
  /** Network type for the wallet */
  network: NetworkType;
  /** Logging level for the SDK */
  logLevel?: LogLevel;
}

// SDK-wide configuration
export interface SdkConfig extends BaseConfig {
  /** Enable debug mode */
  debug?: boolean;
  /** Timeout for operations in milliseconds */
  timeout?: DurationMs;
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Base delay between retries in milliseconds */
  retryDelay?: DurationMs;
  /** Enable FFI call tracing */
  enableTracing?: boolean;
  /** Memory pressure threshold (0-1) */
  memoryThreshold?: number;
}

// Network-specific configuration
export interface NetworkConfig {
  /** Network type */
  type: NetworkType;
  /** Base node peers */
  baseNodePeers?: string[];
  /** DNS seeds for peer discovery */
  dnsSeeds?: string[];
  /** Custom network ports */
  ports?: {
    baseNode?: number;
    wallet?: number;
    stratum?: number;
  };
  /** Protocol configuration */
  protocol?: {
    /** Block time in seconds */
    blockTime?: number;
    /** Target difficulty adjustment window */
    difficultyWindow?: number;
    /** Coinbase maturity in blocks */
    coinbaseMaturity?: number;
  };
}

// Logging configuration
export interface LoggingConfig {
  /** Log level */
  level: LogLevel;
  /** Log file path */
  path?: LogPath;
  /** Number of rolling log files */
  rollingFileCount?: number;
  /** Maximum size per log file in bytes */
  maxFileSize?: number;
  /** Enable console logging */
  console?: boolean;
  /** Enable structured logging (JSON) */
  structured?: boolean;
  /** Custom log format */
  format?: string;
}

// Security configuration
export interface SecurityConfig {
  /** Wallet passphrase */
  passphrase?: ValidatedPassphrase;
  /** Key derivation iterations */
  keyDerivationIterations?: number;
  /** Enable secure memory clearing */
  secureMemory?: boolean;
  /** Auto-lock timeout in milliseconds */
  autoLockTimeout?: DurationMs;
  /** Require passphrase for operations */
  requirePassphrase?: boolean;
}

// Storage configuration
export interface StorageConfig {
  /** Primary storage path */
  path: WalletPath;
  /** Database file name */
  databaseName?: string;
  /** Maximum database size in bytes */
  maxDatabaseSize?: number;
  /** Enable database encryption */
  encrypted?: boolean;
  /** Backup configuration */
  backup?: {
    enabled: boolean;
    interval?: DurationMs;
    maxBackups?: number;
    path?: string;
  };
  /** Cache configuration */
  cache?: {
    enabled: boolean;
    maxSize?: number;
    ttl?: DurationMs;
  };
}

// Performance configuration
export interface PerformanceConfig {
  /** Maximum concurrent FFI calls */
  maxConcurrentCalls?: number;
  /** FFI call timeout in milliseconds */
  callTimeout?: DurationMs;
  /** Enable call batching */
  enableBatching?: boolean;
  /** Batch size for operations */
  batchSize?: number;
  /** Memory pool configuration */
  memoryPool?: {
    maxSize?: number;
    cleanupInterval?: DurationMs;
  };
  /** Worker thread configuration */
  workers?: {
    enabled: boolean;
    maxWorkers?: number;
    idleTimeout?: DurationMs;
  };
}

// Sync configuration
export interface SyncConfig {
  /** Enable automatic sync */
  autoSync?: boolean;
  /** Sync interval in milliseconds */
  syncInterval?: DurationMs;
  /** Sync timeout in milliseconds */
  syncTimeout?: DurationMs;
  /** Number of blocks to sync in batch */
  batchSize?: number;
  /** Enable header-first sync */
  headerFirst?: boolean;
  /** Pruning configuration */
  pruning?: {
    enabled: boolean;
    keepBlocks?: number;
    interval?: DurationMs;
  };
}

// Monitoring configuration
export interface MonitoringConfig {
  /** Enable performance monitoring */
  enabled?: boolean;
  /** Metrics collection interval in milliseconds */
  interval?: DurationMs;
  /** Export metrics to external system */
  export?: {
    enabled: boolean;
    endpoint?: string;
    format?: 'prometheus' | 'json';
    interval?: DurationMs;
  };
  /** Alert configuration */
  alerts?: {
    enabled: boolean;
    thresholds?: {
      memoryUsage?: number;
      errorRate?: number;
      responseTime?: number;
    };
  };
}

// Core SDK configuration combining all aspects
export interface CoreConfig {
  /** Network type for the wallet */
  network: NetworkType;
  /** Logging level for the SDK */
  logLevel?: LogLevel;
  /** SDK-wide settings */
  sdk?: Partial<SdkConfig>;
  /** Network configuration details */
  networkConfig?: Partial<NetworkConfig>;
  /** Logging configuration */
  logging?: Partial<LoggingConfig>;
  /** Security configuration */
  security?: Partial<SecurityConfig>;
  /** Storage configuration */
  storage?: Partial<StorageConfig>;
  /** Performance configuration */
  performance?: Partial<PerformanceConfig>;
  /** Sync configuration */
  sync?: Partial<SyncConfig>;
  /** Monitoring configuration */
  monitoring?: Partial<MonitoringConfig>;
}

// Environment-specific configuration presets
export interface EnvironmentConfig {
  /** Development environment settings */
  development?: Partial<CoreConfig>;
  /** Testing environment settings */
  testing?: Partial<CoreConfig>;
  /** Production environment settings */
  production?: Partial<CoreConfig>;
}

// Configuration validation interfaces
export interface ConfigValidationResult {
  /** Whether configuration is valid */
  valid: boolean;
  /** Validation errors */
  errors: ConfigValidationError[];
  /** Validation warnings */
  warnings: ConfigValidationWarning[];
}

export interface ConfigValidationError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Configuration path where error occurred */
  path: string;
  /** Suggested fix */
  suggestion?: string;
}

export interface ConfigValidationWarning {
  /** Warning code */
  code: string;
  /** Warning message */
  message: string;
  /** Configuration path where warning occurred */
  path: string;
  /** Recommended action */
  recommendation?: string;
}

// Configuration builder types
export type ConfigBuilder<T> = {
  [K in keyof T]-?: T[K] extends object 
    ? ConfigBuilder<T[K]> & { [P in keyof T[K]]: (value: T[K][P]) => ConfigBuilder<T> }
    : (value: T[K]) => ConfigBuilder<T>;
} & {
  build(): T;
  validate(): ConfigValidationResult;
  merge(other: Partial<T>): ConfigBuilder<T>;
  reset(): ConfigBuilder<T>;
};

// Runtime configuration detection
export interface RuntimeConfig {
  /** Node.js version */
  nodeVersion: string;
  /** Platform information */
  platform: {
    os: string;
    arch: string;
    version: string;
  };
  /** Available memory in bytes */
  memory: {
    total: number;
    free: number;
    used: number;
  };
  /** Process information */
  process: {
    pid: number;
    uptime: number;
    argv: string[];
    env: Record<string, string | undefined>;
  };
}

// Configuration factory types
export type ConfigFactory<T> = {
  /** Create default configuration */
  default(): T;
  /** Create configuration for environment */
  forEnvironment(env: 'development' | 'testing' | 'production'): T;
  /** Create configuration from environment variables */
  fromEnv(): T;
  /** Create configuration from file */
  fromFile(path: string): Promise<T>;
  /** Validate configuration */
  validate(config: T): ConfigValidationResult;
  /** Merge configurations */
  merge(...configs: Partial<T>[]): T;
};

// Default configuration values
export const DEFAULT_CONFIG: Required<CoreConfig> = {
  network: NetworkType.Testnet,
  logLevel: LogLevel.Info,
  sdk: {
    network: NetworkType.Testnet,
    logLevel: LogLevel.Info,
    debug: false,
    timeout: 30000 as DurationMs,
    maxRetries: 3,
    retryDelay: 1000 as DurationMs,
    enableTracing: false,
    memoryThreshold: 0.8
  },
  networkConfig: {
    type: NetworkType.Testnet,
    baseNodePeers: [],
    dnsSeeds: [],
    ports: {
      baseNode: 18152,
      wallet: 18153,
      stratum: 18154
    },
    protocol: {
      blockTime: 120,
      difficultyWindow: 90,
      coinbaseMaturity: 1000
    }
  },
  logging: {
    level: LogLevel.Info,
    rollingFileCount: 5,
    maxFileSize: 10 * 1024 * 1024,
    console: true,
    structured: false,
    format: '%timestamp% [%level%] %message%'
  },
  security: {
    keyDerivationIterations: 100000,
    secureMemory: true,
    autoLockTimeout: 300000 as DurationMs,
    requirePassphrase: false
  },
  storage: {
    path: './wallet' as WalletPath,
    databaseName: 'wallet.db',
    maxDatabaseSize: 1024 * 1024 * 1024,
    encrypted: true,
    backup: {
      enabled: true,
      interval: 3600000 as DurationMs,
      maxBackups: 10,
      path: './backups'
    },
    cache: {
      enabled: true,
      maxSize: 100,
      ttl: 300000 as DurationMs
    }
  },
  performance: {
    maxConcurrentCalls: 10,
    callTimeout: 30000 as DurationMs,
    enableBatching: true,
    batchSize: 50,
    memoryPool: {
      maxSize: 1024 * 1024 * 100,
      cleanupInterval: 60000 as DurationMs
    },
    workers: {
      enabled: false,
      maxWorkers: 4,
      idleTimeout: 30000 as DurationMs
    }
  },
  sync: {
    autoSync: true,
    syncInterval: 60000 as DurationMs,
    syncTimeout: 300000 as DurationMs,
    batchSize: 100,
    headerFirst: true,
    pruning: {
      enabled: false,
      keepBlocks: 10000,
      interval: 86400000 as DurationMs
    }
  },
  monitoring: {
    enabled: false,
    interval: 30000 as DurationMs,
    export: {
      enabled: false,
      format: 'json',
      interval: 60000 as DurationMs
    },
    alerts: {
      enabled: false,
      thresholds: {
        memoryUsage: 0.9,
        errorRate: 0.05,
        responseTime: 5000
      }
    }
  }
};

// Configuration type guards
export function isCoreConfig(value: unknown): value is CoreConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'network' in value &&
    typeof (value as any).network === 'string'
  );
}

export function isValidNetworkType(value: unknown): value is NetworkType {
  return Object.values(NetworkType).includes(value as NetworkType);
}

export function isValidLogLevel(value: unknown): value is LogLevel {
  return Object.values(LogLevel).includes(value as LogLevel);
}

// Configuration utilities
export type ConfigDefaults<T> = {
  [K in keyof T]: T[K] extends object ? ConfigDefaults<T[K]> : T[K];
};

export type ConfigOverrides<T> = DeepPartial<T>;

export type MergedConfig<T, U> = T extends object 
  ? U extends object 
    ? { [K in keyof T | keyof U]: K extends keyof U ? U[K] : K extends keyof T ? T[K] : never }
    : T
  : U extends object 
    ? U 
    : T;
