/**
 * @fileoverview Core enumerations for the Tari JavaScript SDK
 * 
 * Provides comprehensive enumerations matching mobile wallet implementations
 * with string literal types for better serialization and debugging.
 */

// Network configuration
export const NetworkType = {
  Mainnet: 'mainnet',
  Testnet: 'testnet', 
  Nextnet: 'nextnet'
} as const;

export type NetworkType = typeof NetworkType[keyof typeof NetworkType];

// Logging levels with numeric values for filtering
export const LogLevel = {
  Error: 0,
  Warn: 1,
  Info: 2,
  Debug: 3,
  Trace: 4
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

// Transaction status enum
export const TransactionStatus = {
  Pending: 'pending',
  Broadcast: 'broadcast',
  MinedUnconfirmed: 'mined_unconfirmed',
  MinedConfirmed: 'mined_confirmed',
  Imported: 'imported',
  Coinbase: 'coinbase',
  Cancelled: 'cancelled',
  Unknown: 'unknown'
} as const;

export type TransactionStatus = typeof TransactionStatus[keyof typeof TransactionStatus];

// Transaction direction
export const TransactionDirection = {
  Inbound: 'inbound',
  Outbound: 'outbound'
} as const;

export type TransactionDirection = typeof TransactionDirection[keyof typeof TransactionDirection];

// UTXO status enum
export const UtxoStatus = {
  Unspent: 'unspent',
  Spent: 'spent',
  EncumberedToBeReceived: 'encumbered_to_be_received',
  EncumberedToBeSpent: 'encumbered_to_be_spent',
  Invalid: 'invalid',
  Abandoned: 'abandoned',
  Unknown: 'unknown'
} as const;

export type UtxoStatus = typeof UtxoStatus[keyof typeof UtxoStatus];

// Connectivity status
export const ConnectivityStatus = {
  Initializing: 'initializing',
  Online: 'online',
  Connecting: 'connecting',
  Offline: 'offline'
} as const;

export type ConnectivityStatus = typeof ConnectivityStatus[keyof typeof ConnectivityStatus];

// Output features enum
export const OutputFeatures = {
  Default: 'default',
  Coinbase: 'coinbase',
  Sidechain: 'sidechain',
  BurnCommitment: 'burn_commitment'
} as const;

export type OutputFeatures = typeof OutputFeatures[keyof typeof OutputFeatures];

// Mnemonic word count for seed phrases
export const MnemonicWordCount = {
  Twelve: 12,
  Fifteen: 15,
  Eighteen: 18,
  TwentyOne: 21,
  TwentyFour: 24
} as const;

export type MnemonicWordCount = typeof MnemonicWordCount[keyof typeof MnemonicWordCount];

// Address format types
export const AddressFormat = {
  Emoji: 'emoji',
  Base58: 'base58',
  Hex: 'hex'
} as const;

export type AddressFormat = typeof AddressFormat[keyof typeof AddressFormat];

// Validation result types
export const ValidationResult = {
  Valid: 'valid',
  Invalid: 'invalid',
  Unknown: 'unknown'
} as const;

export type ValidationResult = typeof ValidationResult[keyof typeof ValidationResult];

// Key types for cryptographic operations
export const KeyType = {
  PublicKey: 'public_key',
  PrivateKey: 'private_key',
  Signature: 'signature'
} as const;

export type KeyType = typeof KeyType[keyof typeof KeyType];

// Sync status for wallet operations
export const SyncStatus = {
  NotStarted: 'not_started',
  InProgress: 'in_progress',
  Completed: 'completed',
  Failed: 'failed'
} as const;

export type SyncStatus = typeof SyncStatus[keyof typeof SyncStatus];

// Export all enum values for runtime checks
export const AllNetworkTypes = Object.values(NetworkType);
export const AllLogLevels = Object.values(LogLevel);
export const AllTransactionStatuses = Object.values(TransactionStatus);
export const AllTransactionDirections = Object.values(TransactionDirection);
export const AllUtxoStatuses = Object.values(UtxoStatus);
export const AllConnectivityStatuses = Object.values(ConnectivityStatus);
export const AllOutputFeatures = Object.values(OutputFeatures);
export const AllMnemonicWordCounts = Object.values(MnemonicWordCount);
export const AllAddressFormats = Object.values(AddressFormat);
export const AllValidationResults = Object.values(ValidationResult);
export const AllKeyTypes = Object.values(KeyType);
export const AllSyncStatuses = Object.values(SyncStatus);
