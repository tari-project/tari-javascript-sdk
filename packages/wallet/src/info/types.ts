/**
 * @fileoverview Wallet information types and interfaces
 */

import type { 
  NetworkType,
  TariAddress as CoreTariAddress 
} from '@tari-project/tarijs-core';

/**
 * Comprehensive wallet information
 */
export interface WalletInfo {
  /** Wallet identifier (non-sensitive) */
  readonly id: string;
  /** Wallet display name */
  readonly name?: string;
  /** Network type (mainnet, testnet, nextnet) */
  readonly network: NetworkType;
  /** Wallet's primary address */
  readonly address: CoreTariAddress;
  /** Wallet creation timestamp */
  readonly createdAt: Date;
  /** Last activity timestamp */
  readonly lastActivity?: Date;
  /** Current wallet version */
  readonly version: string;
  /** Whether wallet is in recovery mode */
  readonly isRecovering: boolean;
  /** Whether wallet is synchronized */
  readonly isSynchronized: boolean;
  /** Synchronization progress (0-1) */
  readonly syncProgress: number;
  /** Total number of transactions */
  readonly transactionCount: number;
  /** Wallet data directory path */
  readonly dataPath?: string;
  /** Whether wallet has a passphrase */
  readonly hasPassphrase: boolean;
}

/**
 * Network information and status
 */
export interface NetworkInfo {
  /** Network type */
  readonly network: NetworkType;
  /** Current blockchain height */
  readonly blockHeight: number;
  /** Best known block hash */
  readonly bestBlockHash: string;
  /** Timestamp of best block */
  readonly bestBlockTimestamp: Date;
  /** Number of connected peers */
  readonly connectedPeers: number;
  /** Whether wallet is fully synchronized */
  readonly isSynced: boolean;
  /** Sync progress as percentage (0-100) */
  readonly syncProgress: number;
  /** Network difficulty */
  readonly difficulty: bigint;
  /** Estimated hashrate */
  readonly hashrate: bigint;
  /** Time to next difficulty adjustment */
  readonly timeToNextDifficultyAdjustment?: number;
  /** Average block time in seconds */
  readonly averageBlockTime: number;
}

/**
 * Base node connection information
 */
export interface BaseNodeInfo {
  /** Base node public key */
  readonly publicKey: string;
  /** Base node network address */
  readonly address: string;
  /** Connection status */
  readonly status: BaseNodeConnectionStatus;
  /** Latency in milliseconds */
  readonly latency?: number;
  /** Last successful ping timestamp */
  readonly lastPing?: Date;
  /** Connection established timestamp */
  readonly connectedAt?: Date;
  /** Base node version */
  readonly version?: string;
  /** User agent string */
  readonly userAgent?: string;
}

/**
 * Base node connection status
 */
export type BaseNodeConnectionStatus = 
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'failed'
  | 'unknown';

/**
 * Version compatibility information
 */
export interface VersionInfo {
  /** Current SDK version */
  readonly sdkVersion: string;
  /** Core wallet version */
  readonly coreVersion: string;
  /** FFI bindings version */
  readonly ffiVersion: string;
  /** Protocol version */
  readonly protocolVersion: string;
  /** Minimum compatible core version */
  readonly minCoreVersion: string;
  /** Maximum compatible core version */
  readonly maxCoreVersion: string;
  /** Whether versions are compatible */
  readonly isCompatible: boolean;
  /** Compatibility warnings */
  readonly warnings: VersionWarning[];
  /** Upgrade recommendations */
  readonly upgradeRequired: boolean;
}

/**
 * Version compatibility warning
 */
export interface VersionWarning {
  /** Warning type */
  readonly type: 'deprecated' | 'incompatible' | 'upgrade_recommended' | 'experimental';
  /** Warning message */
  readonly message: string;
  /** Component affected */
  readonly component: string;
  /** Severity level */
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  /** Recommended action */
  readonly action?: string;
}

/**
 * Wallet sync status information
 */
export interface SyncStatus {
  /** Whether sync is in progress */
  readonly isSyncing: boolean;
  /** Sync progress percentage (0-100) */
  readonly progress: number;
  /** Current block height being processed */
  readonly currentHeight: number;
  /** Target height to sync to */
  readonly targetHeight: number;
  /** Blocks remaining to sync */
  readonly blocksRemaining: number;
  /** Estimated time to completion */
  readonly estimatedTimeRemaining?: number;
  /** Sync stage description */
  readonly stage: SyncStage;
  /** Last sync error if any */
  readonly lastError?: string;
  /** Sync start timestamp */
  readonly syncStartedAt?: Date;
}

/**
 * Synchronization stages
 */
export type SyncStage = 
  | 'initializing'
  | 'downloading_blocks'
  | 'validating_blocks'
  | 'updating_utxos'
  | 'finalizing'
  | 'complete'
  | 'error';

/**
 * Configuration for wallet info service
 */
export interface WalletInfoConfig {
  /** Whether to include sensitive information */
  includeSensitive?: boolean;
  /** Refresh interval for cached data in milliseconds */
  refreshInterval?: number;
  /** Whether to auto-refresh network info */
  autoRefresh?: boolean;
  /** Timeout for network queries in milliseconds */
  networkTimeout?: number;
}

/**
 * Network information query options
 */
export interface NetworkInfoOptions {
  /** Whether to force refresh of cached data */
  forceRefresh?: boolean;
  /** Timeout for network operations */
  timeout?: number;
  /** Whether to include detailed peer information */
  includePeerDetails?: boolean;
}

/**
 * Version compatibility check options
 */
export interface VersionCompatibility {
  /** Check against specific core version */
  targetCoreVersion?: string;
  /** Include experimental version checks */
  includeExperimental?: boolean;
  /** Strict compatibility checking */
  strict?: boolean;
}

/**
 * Wallet feature capabilities
 */
export interface WalletCapabilities {
  /** Supported transaction types */
  readonly supportedTransactionTypes: string[];
  /** Whether hardware wallet support is available */
  readonly hardwareWalletSupport: boolean;
  /** Whether multi-signature is supported */
  readonly multiSigSupport: boolean;
  /** Whether stealth addresses are supported */
  readonly stealthAddressSupport: boolean;
  /** Maximum number of concurrent transactions */
  readonly maxConcurrentTransactions: number;
  /** Supported address formats */
  readonly supportedAddressFormats: string[];
  /** Whether atomic swaps are supported */
  readonly atomicSwapSupport: boolean;
}

/**
 * Performance metrics for monitoring
 */
export interface WalletMetrics {
  /** Memory usage in bytes */
  readonly memoryUsage: number;
  /** Number of active FFI handles */
  readonly activeHandles: number;
  /** Database size in bytes */
  readonly databaseSize: number;
  /** Average transaction processing time */
  readonly avgTransactionTime: number;
  /** Cache hit ratio percentage */
  readonly cacheHitRatio: number;
  /** Network latency in milliseconds */
  readonly networkLatency: number;
  /** Number of failed operations */
  readonly failedOperations: number;
  /** Uptime in milliseconds */
  readonly uptime: number;
}
