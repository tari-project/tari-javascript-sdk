/**
 * @fileoverview Comprehensive error codes for Tari JavaScript SDK
 * 
 * Error codes are organized by category using numeric ranges:
 * - 1000-1099: Initialization errors
 * - 2000-2099: Transaction errors  
 * - 3000-3099: Network errors
 * - 4000-4099: Validation errors
 * - 5000-5099: FFI errors
 * - 6000-6099: Resource errors
 * - 7000-7099: Security errors
 * - 8000-8099: Configuration errors
 * - 9000-9099: General errors
 */

/**
 * Comprehensive error codes for all wallet operations
 * Using const enum for better performance and smaller bundle size
 */
export const enum WalletErrorCode {
  // Initialization errors (1000-1099)
  InvalidConfig = 1000,
  WalletExists = 1001,
  WalletNotFound = 1002,
  InitializationFailed = 1003,
  DatabaseCorrupted = 1004,
  MigrationFailed = 1005,
  InvalidNetworkType = 1006,
  InvalidDataDir = 1007,
  PermissionDeniedInit = 1008,
  DiskSpaceInsufficient = 1009,
  
  // Transaction errors (2000-2099)
  InsufficientFunds = 2000,
  InvalidAddress = 2001,
  InvalidAmount = 2002,
  TransactionNotFound = 2003,
  TransactionAlreadyExists = 2004,
  TransactionFailed = 2005,
  FeeCalculationFailed = 2006,
  OutputNotFound = 2007,
  InputNotFound = 2008,
  TransactionTooLarge = 2009,
  InvalidFee = 2010,
  TransactionExpired = 2011,
  DuplicateTransaction = 2012,
  TransactionRejected = 2013,
  ChangeNotFound = 2014,
  InvalidSignature = 2015,
  InvalidScriptOffset = 2016,
  InvalidKernel = 2017,
  InvalidCommitment = 2018,
  InvalidRangeProof = 2019,
  
  // Additional transaction errors
  TransactionTimeout = 2020,
  TransactionNotCancellable = 2021,
  TransactionSendFailed = 2022,
  FeeEstimationFailed = 2023,
  InvalidStateTransition = 2024,
  
  // Network errors (3000-3099)
  NetworkUnavailable = 3000,
  ConnectionFailed = 3001,
  ConnectionTimeout = 3002,
  PeerNotFound = 3003,
  SyncFailed = 3004,
  BaseNodeUnavailable = 3005,
  ConsensusNotAchieved = 3006,
  BlockchainSyncRequired = 3007,
  InvalidPeerResponse = 3008,
  TooManyRequests = 3009,
  ServiceUnavailable = 3010,
  NetworkPartition = 3011,
  InvalidBlock = 3012,
  ChainReorg = 3013,
  ForkDetected = 3014,
  
  // Validation errors (4000-4099)
  RequiredFieldMissing = 4000,
  InvalidFormat = 4001,
  ValueOutOfRange = 4002,
  InvalidChecksum = 4003,
  InvalidLength = 4004,
  InvalidCharacters = 4005,
  InvalidNetworkByte = 4006,
  InvalidEmojiId = 4007,
  InvalidBase58 = 4008,
  InvalidHex = 4009,
  InvalidJson = 4010,
  SchemaValidationFailed = 4011,
  InvalidTimestamp = 4012,
  InvalidUrl = 4013,
  InvalidPortNumber = 4014,
  
  // FFI errors (5000-5099)
  FFICallFailed = 5000,
  UseAfterFree = 5001,
  ResourceDestroyed = 5002,
  NullPointer = 5003,
  InvalidHandle = 5004,
  HandleNotFound = 5005,
  MemoryAllocationFailed = 5006,
  SerializationFailed = 5007,
  DeserializationFailed = 5008,
  TypeConversionFailed = 5009,
  BufferOverflow = 5010,
  InvalidParameters = 5011,
  CallbackFailed = 5012,
  ThreadingError = 5013,
  AsyncOperationFailed = 5014,
  
  // Resource errors (6000-6099)
  ResourceExhausted = 6000,
  MemoryLimitExceeded = 6001,
  FileNotFound = 6002,
  FileAccessDenied = 6003,
  DirectoryNotFound = 6004,
  DiskFull = 6005,
  FileSystemError = 6006,
  DatabaseLocked = 6007,
  DatabaseBusy = 6008,
  TooManyOpenFiles = 6009,
  ResourceLeak = 6010,
  HandleLimitExceeded = 6011,
  MemoryCorruption = 6012,
  ResourceTimeout = 6013,
  ResourceUnavailable = 6014,
  ResourceCleanupFailed = 6015,
  ResourceNotFound = 6016,
  
  // Security errors (7000-7099)
  AuthenticationFailed = 7000,
  AuthorizationFailed = 7001,
  InvalidCredentials = 7002,
  PermissionDenied = 7003,
  SecurityViolation = 7004,
  TamperedData = 7005,
  InvalidCertificate = 7006,
  CertificateExpired = 7007,
  CryptoError = 7008,
  KeyGenerationFailed = 7009,
  EncryptionFailed = 7010,
  DecryptionFailed = 7011,
  HashingFailed = 7012,
  SigningFailed = 7013,
  VerificationFailed = 7014,
  
  // Configuration errors (8000-8099)
  ConfigNotFound = 8000,
  ConfigInvalid = 8001,
  ConfigCorrupted = 8002,
  ConfigVersionMismatch = 8003,
  MissingRequiredConfig = 8004,
  InvalidConfigFormat = 8005,
  ConfigParseError = 8006,
  ConfigValidationFailed = 8007,
  UnsupportedConfigVersion = 8008,
  ConfigMigrationFailed = 8009,
  ConfigAccessDenied = 8010,
  ConfigLocked = 8011,
  DefaultConfigFailed = 8012,
  ConfigBackupFailed = 8013,
  ConfigRestoreFailed = 8014,
  
  // General errors (9000-9099)
  Unknown = 9000,
  NotImplemented = 9001,
  Unsupported = 9002,
  Deprecated = 9003,
  InvalidState = 9004,
  OperationCancelled = 9005,
  OperationTimeout = 9006,
  RateLimited = 9007,
  ServiceDegraded = 9008,
  MaintenanceMode = 9009,
  VersionMismatch = 9010,
  IncompatibleVersion = 9011,
  FeatureDisabled = 9012,
  QuotaExceeded = 9013,
  InternalError = 9014,
  
  // Resource errors
  ResourceDisposed = 6017,
  
  // Legacy aliases for compatibility
  UnknownError = 9000, // Alias for Unknown
  FEE_ESTIMATION_FAILED = 2023, // Alias for FeeEstimationFailed
  TRANSACTION_SEND_FAILED = 2022, // Alias for TransactionSendFailed
}

/**
 * Error categories for grouping related error codes
 */
export enum ErrorCategory {
  Initialization = 'Initialization',
  Transaction = 'Transaction',
  Network = 'Network',
  Validation = 'Validation',
  FFI = 'FFI',
  Resource = 'Resource',
  Security = 'Security',
  Configuration = 'Configuration',
  General = 'General',
}

/**
 * Maps error codes to their categories
 */
export const ERROR_CATEGORIES: Record<WalletErrorCode, ErrorCategory> = {
  // Initialization errors (1000-1099)
  [WalletErrorCode.InvalidConfig]: ErrorCategory.Initialization,
  [WalletErrorCode.WalletExists]: ErrorCategory.Initialization,
  [WalletErrorCode.WalletNotFound]: ErrorCategory.Initialization,
  [WalletErrorCode.InitializationFailed]: ErrorCategory.Initialization,
  [WalletErrorCode.DatabaseCorrupted]: ErrorCategory.Initialization,
  [WalletErrorCode.MigrationFailed]: ErrorCategory.Initialization,
  [WalletErrorCode.InvalidNetworkType]: ErrorCategory.Initialization,
  [WalletErrorCode.InvalidDataDir]: ErrorCategory.Initialization,
  [WalletErrorCode.PermissionDeniedInit]: ErrorCategory.Initialization,
  [WalletErrorCode.DiskSpaceInsufficient]: ErrorCategory.Initialization,
  
  // Transaction errors (2000-2099)
  [WalletErrorCode.InsufficientFunds]: ErrorCategory.Transaction,
  [WalletErrorCode.InvalidAddress]: ErrorCategory.Transaction,
  [WalletErrorCode.InvalidAmount]: ErrorCategory.Transaction,
  [WalletErrorCode.TransactionNotFound]: ErrorCategory.Transaction,
  [WalletErrorCode.TransactionAlreadyExists]: ErrorCategory.Transaction,
  [WalletErrorCode.TransactionFailed]: ErrorCategory.Transaction,
  [WalletErrorCode.FeeCalculationFailed]: ErrorCategory.Transaction,
  [WalletErrorCode.OutputNotFound]: ErrorCategory.Transaction,
  [WalletErrorCode.InputNotFound]: ErrorCategory.Transaction,
  [WalletErrorCode.TransactionTooLarge]: ErrorCategory.Transaction,
  [WalletErrorCode.InvalidFee]: ErrorCategory.Transaction,
  [WalletErrorCode.TransactionExpired]: ErrorCategory.Transaction,
  [WalletErrorCode.DuplicateTransaction]: ErrorCategory.Transaction,
  [WalletErrorCode.TransactionRejected]: ErrorCategory.Transaction,
  [WalletErrorCode.ChangeNotFound]: ErrorCategory.Transaction,
  [WalletErrorCode.InvalidSignature]: ErrorCategory.Transaction,
  [WalletErrorCode.InvalidScriptOffset]: ErrorCategory.Transaction,
  [WalletErrorCode.InvalidKernel]: ErrorCategory.Transaction,
  [WalletErrorCode.InvalidCommitment]: ErrorCategory.Transaction,
  [WalletErrorCode.InvalidRangeProof]: ErrorCategory.Transaction,
  [WalletErrorCode.TransactionTimeout]: ErrorCategory.Transaction,
  [WalletErrorCode.TransactionNotCancellable]: ErrorCategory.Transaction,
  [WalletErrorCode.TransactionSendFailed]: ErrorCategory.Transaction,
  [WalletErrorCode.FeeEstimationFailed]: ErrorCategory.Transaction,
  [WalletErrorCode.InvalidStateTransition]: ErrorCategory.Transaction,
  
  // Network errors (3000-3099)
  [WalletErrorCode.NetworkUnavailable]: ErrorCategory.Network,
  [WalletErrorCode.ConnectionFailed]: ErrorCategory.Network,
  [WalletErrorCode.ConnectionTimeout]: ErrorCategory.Network,
  [WalletErrorCode.PeerNotFound]: ErrorCategory.Network,
  [WalletErrorCode.SyncFailed]: ErrorCategory.Network,
  [WalletErrorCode.BaseNodeUnavailable]: ErrorCategory.Network,
  [WalletErrorCode.ConsensusNotAchieved]: ErrorCategory.Network,
  [WalletErrorCode.BlockchainSyncRequired]: ErrorCategory.Network,
  [WalletErrorCode.InvalidPeerResponse]: ErrorCategory.Network,
  [WalletErrorCode.TooManyRequests]: ErrorCategory.Network,
  [WalletErrorCode.ServiceUnavailable]: ErrorCategory.Network,
  [WalletErrorCode.NetworkPartition]: ErrorCategory.Network,
  [WalletErrorCode.InvalidBlock]: ErrorCategory.Network,
  [WalletErrorCode.ChainReorg]: ErrorCategory.Network,
  [WalletErrorCode.ForkDetected]: ErrorCategory.Network,
  
  // Validation errors (4000-4099)
  [WalletErrorCode.RequiredFieldMissing]: ErrorCategory.Validation,
  [WalletErrorCode.InvalidFormat]: ErrorCategory.Validation,
  [WalletErrorCode.ValueOutOfRange]: ErrorCategory.Validation,
  [WalletErrorCode.InvalidChecksum]: ErrorCategory.Validation,
  [WalletErrorCode.InvalidLength]: ErrorCategory.Validation,
  [WalletErrorCode.InvalidCharacters]: ErrorCategory.Validation,
  [WalletErrorCode.InvalidNetworkByte]: ErrorCategory.Validation,
  [WalletErrorCode.InvalidEmojiId]: ErrorCategory.Validation,
  [WalletErrorCode.InvalidBase58]: ErrorCategory.Validation,
  [WalletErrorCode.InvalidHex]: ErrorCategory.Validation,
  [WalletErrorCode.InvalidJson]: ErrorCategory.Validation,
  [WalletErrorCode.SchemaValidationFailed]: ErrorCategory.Validation,
  [WalletErrorCode.InvalidTimestamp]: ErrorCategory.Validation,
  [WalletErrorCode.InvalidUrl]: ErrorCategory.Validation,
  [WalletErrorCode.InvalidPortNumber]: ErrorCategory.Validation,
  
  // FFI errors (5000-5099)
  [WalletErrorCode.FFICallFailed]: ErrorCategory.FFI,
  [WalletErrorCode.UseAfterFree]: ErrorCategory.FFI,
  [WalletErrorCode.ResourceDestroyed]: ErrorCategory.FFI,
  [WalletErrorCode.NullPointer]: ErrorCategory.FFI,
  [WalletErrorCode.InvalidHandle]: ErrorCategory.FFI,
  [WalletErrorCode.HandleNotFound]: ErrorCategory.FFI,
  [WalletErrorCode.MemoryAllocationFailed]: ErrorCategory.FFI,
  [WalletErrorCode.SerializationFailed]: ErrorCategory.FFI,
  [WalletErrorCode.DeserializationFailed]: ErrorCategory.FFI,
  [WalletErrorCode.TypeConversionFailed]: ErrorCategory.FFI,
  [WalletErrorCode.BufferOverflow]: ErrorCategory.FFI,
  [WalletErrorCode.InvalidParameters]: ErrorCategory.FFI,
  [WalletErrorCode.CallbackFailed]: ErrorCategory.FFI,
  [WalletErrorCode.ThreadingError]: ErrorCategory.FFI,
  [WalletErrorCode.AsyncOperationFailed]: ErrorCategory.FFI,
  
  // Resource errors (6000-6099)
  [WalletErrorCode.ResourceExhausted]: ErrorCategory.Resource,
  [WalletErrorCode.MemoryLimitExceeded]: ErrorCategory.Resource,
  [WalletErrorCode.FileNotFound]: ErrorCategory.Resource,
  [WalletErrorCode.FileAccessDenied]: ErrorCategory.Resource,
  [WalletErrorCode.DirectoryNotFound]: ErrorCategory.Resource,
  [WalletErrorCode.DiskFull]: ErrorCategory.Resource,
  [WalletErrorCode.FileSystemError]: ErrorCategory.Resource,
  [WalletErrorCode.DatabaseLocked]: ErrorCategory.Resource,
  [WalletErrorCode.DatabaseBusy]: ErrorCategory.Resource,
  [WalletErrorCode.TooManyOpenFiles]: ErrorCategory.Resource,
  [WalletErrorCode.ResourceLeak]: ErrorCategory.Resource,
  [WalletErrorCode.HandleLimitExceeded]: ErrorCategory.Resource,
  [WalletErrorCode.MemoryCorruption]: ErrorCategory.Resource,
  [WalletErrorCode.ResourceTimeout]: ErrorCategory.Resource,
  [WalletErrorCode.ResourceUnavailable]: ErrorCategory.Resource,
  [WalletErrorCode.ResourceCleanupFailed]: ErrorCategory.Resource,
  [WalletErrorCode.ResourceNotFound]: ErrorCategory.Resource,
  [WalletErrorCode.ResourceDisposed]: ErrorCategory.Resource,
  
  // Security errors (7000-7099)
  [WalletErrorCode.AuthenticationFailed]: ErrorCategory.Security,
  [WalletErrorCode.AuthorizationFailed]: ErrorCategory.Security,
  [WalletErrorCode.InvalidCredentials]: ErrorCategory.Security,
  [WalletErrorCode.PermissionDenied]: ErrorCategory.Security,
  [WalletErrorCode.SecurityViolation]: ErrorCategory.Security,
  [WalletErrorCode.TamperedData]: ErrorCategory.Security,
  [WalletErrorCode.InvalidCertificate]: ErrorCategory.Security,
  [WalletErrorCode.CertificateExpired]: ErrorCategory.Security,
  [WalletErrorCode.CryptoError]: ErrorCategory.Security,
  [WalletErrorCode.KeyGenerationFailed]: ErrorCategory.Security,
  [WalletErrorCode.EncryptionFailed]: ErrorCategory.Security,
  [WalletErrorCode.DecryptionFailed]: ErrorCategory.Security,
  [WalletErrorCode.HashingFailed]: ErrorCategory.Security,
  [WalletErrorCode.SigningFailed]: ErrorCategory.Security,
  [WalletErrorCode.VerificationFailed]: ErrorCategory.Security,
  
  // Configuration errors (8000-8099)
  [WalletErrorCode.ConfigNotFound]: ErrorCategory.Configuration,
  [WalletErrorCode.ConfigInvalid]: ErrorCategory.Configuration,
  [WalletErrorCode.ConfigCorrupted]: ErrorCategory.Configuration,
  [WalletErrorCode.ConfigVersionMismatch]: ErrorCategory.Configuration,
  [WalletErrorCode.MissingRequiredConfig]: ErrorCategory.Configuration,
  [WalletErrorCode.InvalidConfigFormat]: ErrorCategory.Configuration,
  [WalletErrorCode.ConfigParseError]: ErrorCategory.Configuration,
  [WalletErrorCode.ConfigValidationFailed]: ErrorCategory.Configuration,
  [WalletErrorCode.UnsupportedConfigVersion]: ErrorCategory.Configuration,
  [WalletErrorCode.ConfigMigrationFailed]: ErrorCategory.Configuration,
  [WalletErrorCode.ConfigAccessDenied]: ErrorCategory.Configuration,
  [WalletErrorCode.ConfigLocked]: ErrorCategory.Configuration,
  [WalletErrorCode.DefaultConfigFailed]: ErrorCategory.Configuration,
  [WalletErrorCode.ConfigBackupFailed]: ErrorCategory.Configuration,
  [WalletErrorCode.ConfigRestoreFailed]: ErrorCategory.Configuration,
  
  // General errors (9000-9099)
  [WalletErrorCode.Unknown]: ErrorCategory.General,
  [WalletErrorCode.NotImplemented]: ErrorCategory.General,
  [WalletErrorCode.Unsupported]: ErrorCategory.General,
  [WalletErrorCode.Deprecated]: ErrorCategory.General,
  [WalletErrorCode.InvalidState]: ErrorCategory.General,
  [WalletErrorCode.OperationCancelled]: ErrorCategory.General,
  [WalletErrorCode.OperationTimeout]: ErrorCategory.General,
  [WalletErrorCode.RateLimited]: ErrorCategory.General,
  [WalletErrorCode.ServiceDegraded]: ErrorCategory.General,
  [WalletErrorCode.MaintenanceMode]: ErrorCategory.General,
  [WalletErrorCode.VersionMismatch]: ErrorCategory.General,
  [WalletErrorCode.IncompatibleVersion]: ErrorCategory.General,
  [WalletErrorCode.FeatureDisabled]: ErrorCategory.General,
  [WalletErrorCode.QuotaExceeded]: ErrorCategory.General,
  [WalletErrorCode.InternalError]: ErrorCategory.General,
};

/**
 * Helper function to get the category for an error code
 */
export function getErrorCategory(code: WalletErrorCode): ErrorCategory {
  return ERROR_CATEGORIES[code] || ErrorCategory.General;
}

/**
 * Helper function to check if an error code is in a specific category
 */
export function isErrorInCategory(code: WalletErrorCode, category: ErrorCategory): boolean {
  return getErrorCategory(code) === category;
}

/**
 * Get all error codes in a specific category
 */
export function getErrorCodesInCategory(category: ErrorCategory): WalletErrorCode[] {
  return Object.entries(ERROR_CATEGORIES)
    .filter(([, cat]) => cat === category)
    .map(([code]) => Number(code) as WalletErrorCode);
}
