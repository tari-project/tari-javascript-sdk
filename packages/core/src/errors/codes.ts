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
 * Using regular enum for compatibility with isolatedModules
 */
export enum WalletErrorCode {
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
  SelfSendNotAllowed = 2025,
  AddressResolutionFailed = 2026,
  DuplicateRecipients = 2027,
  BalanceFailed = 2028,
  MemoOperationFailed = 2029,
  
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
  NetworkError = 3015,
  
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
  InvalidArgument = 4015,
  InvalidInput = 4016,
  
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
  
  // Contact errors (8000-8099)
  ContactInitializationFailed = 8000,
  ContactCleanupFailed = 8001,
  ContactValidationFailed = 8002,
  ContactAddFailed = 8003,
  ContactUpdateFailed = 8004,
  ContactRemoveFailed = 8005,
  ContactGetFailed = 8006,
  ContactListFailed = 8007,
  ContactSearchFailed = 8008,
  ContactExportFailed = 8009,
  ContactImportFailed = 8010,
  ContactClearFailed = 8011,
  ContactNotFound = 8012,
  ContactDuplicateId = 8013,
  ContactDuplicateAlias = 8014,
  ContactDuplicateAddress = 8015,
  ContactStorageInitFailed = 8016,
  ContactStorageAddFailed = 8017,
  ContactStorageUpdateFailed = 8018,
  ContactStorageRemoveFailed = 8019,
  ContactStorageLoadFailed = 8020,
  ContactStoragePersistFailed = 8021,
  ContactStorageClearFailed = 8022,
  ContactStorageDirectoryFailed = 8023,
  ContactStoreNotInitialized = 8024,
  ContactStatsFailed = 8025,
  ContactEventTimeout = 8026,
  ContactSyncFailed = 8027,
  ContactCacheStatsFailed = 8028,
  
  // UTXO errors (8200-8299)
  UtxoInitializationFailed = 8200,
  UtxoCleanupFailed = 8201,
  UtxoQueryFailed = 8202,
  UtxoNotFound = 8203,
  UtxoMappingFailed = 8204,
  UtxoSelectionFailed = 8205,
  UtxoServiceFailed = 8206,
  UtxoRepositoryFailed = 8207,
  UtxoStatisticsFailed = 8208,
  UtxoRefreshFailed = 8209,
  UtxoBalanceFailed = 8210,
  UtxoMaturityCheckFailed = 8211,
  UtxoCountFailed = 8212,
  UtxoFilterInvalid = 8213,
  UtxoSelectionTimeout = 8214,
  UtxoInsufficientCandidates = 8215,
  UtxoSelectionParameterInvalid = 8216,
  UtxoSelectionStrategyFailed = 8217,
  
  // Coin operation errors (8300-8399)
  CoinSplitFailed = 8300,
  CoinJoinFailed = 8301,
  CoinSplitParameterInvalid = 8302,
  CoinJoinParameterInvalid = 8303,
  CoinSplitAmountInvalid = 8304,
  CoinSplitCountInvalid = 8305,
  CoinSplitCountExceeded = 8306,
  CoinSplitInsufficientFunds = 8307,
  CoinSplitDustOutputs = 8308,
  CoinJoinMinimumUtxos = 8309,
  CoinJoinMaximumUtxos = 8310,
  CoinJoinUtxoNotFound = 8311,
  CoinJoinInsufficientUtxos = 8312,
  CoinOperationServiceFailed = 8313,
  CoinSplitCustomAmountMismatch = 8314,
  CoinSplitNoSpendableUtxos = 8315,
  CoinSplitUtxoSelectionFailed = 8316,
  CoinSplitExecutionFailed = 8317,
  CoinJoinExecutionFailed = 8318,
  
  // Configuration errors (8100-8199)
  ConfigNotFound = 8100,
  ConfigInvalid = 8101,
  ConfigCorrupted = 8102,
  ConfigVersionMismatch = 8103,
  MissingRequiredConfig = 8104,
  InvalidConfigFormat = 8105,
  ConfigParseError = 8106,
  ConfigValidationFailed = 8107,
  UnsupportedConfigVersion = 8108,
  ConfigMigrationFailed = 8109,
  ConfigAccessDenied = 8110,
  ConfigLocked = 8111,
  DefaultConfigFailed = 8112,
  ConfigBackupFailed = 8113,
  ConfigRestoreFailed = 8114,
  
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
  FeatureNotEnabled = 9016,
  
  // Resource errors
  ResourceDisposed = 6017,
  
  // Additional missing error codes referenced in wallet package
  OperationInProgress = 9015,
  FFIError = 5017,
  TransactionProcessingFailed = 2030,
  AutoCancellationFailed = 2031,
  AutoRefreshFailed = 2032,
  TransactionCancellationFailed = 2033,
  TransactionQueryFailed = 2034,
  TransactionDetailRetrievalFailed = 2035,
  ConfirmationTrackingFailed = 2036,
  TransactionCancellationNotAllowed = 2037,
  BalanceQueryFailed = 2038,
  AmountBelowDustLimit = 2039,
  AmountExceedsMaximum = 2040,
  InsufficientUtxos = 2041,
  UtxoValidationFailed = 2042,
  InsufficientFundsWithMargin = 2043,
  
  // FFI errors continued
  FFIOperationFailed = 5018,
  
  // Legacy aliases for compatibility
  UnknownError = 9000, // Alias for Unknown
  FEE_ESTIMATION_FAILED = 2023, // Alias for FeeEstimationFailed
  TRANSACTION_SEND_FAILED = 2022, // Alias for TransactionSendFailed
  
  // Legacy configuration error aliases
  InvalidConfiguration = 8115, // Alias for ConfigInvalid
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
  Contact = 'Contact',
  Utxo = 'Utxo',
  Coin = 'Coin',
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
  [WalletErrorCode.SelfSendNotAllowed]: ErrorCategory.Transaction,
  [WalletErrorCode.AddressResolutionFailed]: ErrorCategory.Transaction,
  [WalletErrorCode.DuplicateRecipients]: ErrorCategory.Transaction,
  [WalletErrorCode.BalanceFailed]: ErrorCategory.Transaction,
  [WalletErrorCode.TransactionProcessingFailed]: ErrorCategory.Transaction,
  [WalletErrorCode.AutoCancellationFailed]: ErrorCategory.Transaction,
  [WalletErrorCode.AutoRefreshFailed]: ErrorCategory.Transaction,
  [WalletErrorCode.InsufficientFundsWithMargin]: ErrorCategory.Transaction,
  [WalletErrorCode.MemoOperationFailed]: ErrorCategory.Transaction,
  
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
  [WalletErrorCode.NetworkError]: ErrorCategory.Network,
  
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
  [WalletErrorCode.InvalidArgument]: ErrorCategory.Validation,
  [WalletErrorCode.InvalidInput]: ErrorCategory.Validation,
  
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
  [WalletErrorCode.FFIError]: ErrorCategory.FFI,
  
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
  
  // Contact errors (8000-8099)
  [WalletErrorCode.ContactInitializationFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactCleanupFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactValidationFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactAddFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactUpdateFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactRemoveFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactGetFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactListFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactSearchFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactExportFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactImportFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactClearFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactNotFound]: ErrorCategory.Contact,
  [WalletErrorCode.ContactDuplicateId]: ErrorCategory.Contact,
  [WalletErrorCode.ContactDuplicateAlias]: ErrorCategory.Contact,
  [WalletErrorCode.ContactDuplicateAddress]: ErrorCategory.Contact,
  [WalletErrorCode.ContactStorageInitFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactStorageAddFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactStorageUpdateFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactStorageRemoveFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactStorageLoadFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactStoragePersistFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactStorageClearFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactStorageDirectoryFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactStoreNotInitialized]: ErrorCategory.Contact,
  [WalletErrorCode.ContactStatsFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactEventTimeout]: ErrorCategory.Contact,
  [WalletErrorCode.ContactSyncFailed]: ErrorCategory.Contact,
  [WalletErrorCode.ContactCacheStatsFailed]: ErrorCategory.Contact,
  
  // UTXO errors (8200-8299)
  [WalletErrorCode.UtxoInitializationFailed]: ErrorCategory.Utxo,
  [WalletErrorCode.UtxoCleanupFailed]: ErrorCategory.Utxo,
  [WalletErrorCode.UtxoQueryFailed]: ErrorCategory.Utxo,
  [WalletErrorCode.UtxoNotFound]: ErrorCategory.Utxo,
  [WalletErrorCode.UtxoMappingFailed]: ErrorCategory.Utxo,
  [WalletErrorCode.UtxoSelectionFailed]: ErrorCategory.Utxo,
  [WalletErrorCode.UtxoServiceFailed]: ErrorCategory.Utxo,
  [WalletErrorCode.UtxoRepositoryFailed]: ErrorCategory.Utxo,
  [WalletErrorCode.UtxoStatisticsFailed]: ErrorCategory.Utxo,
  [WalletErrorCode.UtxoRefreshFailed]: ErrorCategory.Utxo,
  [WalletErrorCode.UtxoBalanceFailed]: ErrorCategory.Utxo,
  [WalletErrorCode.UtxoMaturityCheckFailed]: ErrorCategory.Utxo,
  [WalletErrorCode.UtxoCountFailed]: ErrorCategory.Utxo,
  [WalletErrorCode.UtxoFilterInvalid]: ErrorCategory.Utxo,
  [WalletErrorCode.UtxoSelectionTimeout]: ErrorCategory.Utxo,
  [WalletErrorCode.UtxoInsufficientCandidates]: ErrorCategory.Utxo,
  [WalletErrorCode.UtxoSelectionParameterInvalid]: ErrorCategory.Utxo,
  [WalletErrorCode.UtxoSelectionStrategyFailed]: ErrorCategory.Utxo,
  
  // Coin operation errors (8300-8399)
  [WalletErrorCode.CoinSplitFailed]: ErrorCategory.Coin,
  [WalletErrorCode.CoinJoinFailed]: ErrorCategory.Coin,
  [WalletErrorCode.CoinSplitParameterInvalid]: ErrorCategory.Coin,
  [WalletErrorCode.CoinJoinParameterInvalid]: ErrorCategory.Coin,
  [WalletErrorCode.CoinSplitAmountInvalid]: ErrorCategory.Coin,
  [WalletErrorCode.CoinSplitCountInvalid]: ErrorCategory.Coin,
  [WalletErrorCode.CoinSplitCountExceeded]: ErrorCategory.Coin,
  [WalletErrorCode.CoinSplitInsufficientFunds]: ErrorCategory.Coin,
  [WalletErrorCode.CoinSplitDustOutputs]: ErrorCategory.Coin,
  [WalletErrorCode.CoinJoinMinimumUtxos]: ErrorCategory.Coin,
  [WalletErrorCode.CoinJoinMaximumUtxos]: ErrorCategory.Coin,
  [WalletErrorCode.CoinJoinUtxoNotFound]: ErrorCategory.Coin,
  [WalletErrorCode.CoinJoinInsufficientUtxos]: ErrorCategory.Coin,
  [WalletErrorCode.CoinOperationServiceFailed]: ErrorCategory.Coin,
  [WalletErrorCode.CoinSplitCustomAmountMismatch]: ErrorCategory.Coin,
  [WalletErrorCode.CoinSplitNoSpendableUtxos]: ErrorCategory.Coin,
  [WalletErrorCode.CoinSplitUtxoSelectionFailed]: ErrorCategory.Coin,
  [WalletErrorCode.CoinSplitExecutionFailed]: ErrorCategory.Coin,
  [WalletErrorCode.CoinJoinExecutionFailed]: ErrorCategory.Coin,
  
  // Configuration errors (8100-8199)
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
  [WalletErrorCode.OperationInProgress]: ErrorCategory.General,
  [WalletErrorCode.FeatureNotEnabled]: ErrorCategory.General,

  // Additional error codes 
  [WalletErrorCode.TransactionCancellationFailed]: ErrorCategory.Transaction,
  [WalletErrorCode.TransactionQueryFailed]: ErrorCategory.Transaction,
  [WalletErrorCode.TransactionDetailRetrievalFailed]: ErrorCategory.Transaction,
  [WalletErrorCode.ConfirmationTrackingFailed]: ErrorCategory.Transaction,
  [WalletErrorCode.TransactionCancellationNotAllowed]: ErrorCategory.Transaction,
  [WalletErrorCode.BalanceQueryFailed]: ErrorCategory.Transaction,
  [WalletErrorCode.AmountBelowDustLimit]: ErrorCategory.Validation,
  [WalletErrorCode.AmountExceedsMaximum]: ErrorCategory.Validation,
  [WalletErrorCode.InsufficientUtxos]: ErrorCategory.Transaction,
  [WalletErrorCode.UtxoValidationFailed]: ErrorCategory.Validation,
  [WalletErrorCode.FFIOperationFailed]: ErrorCategory.FFI,
  [WalletErrorCode.InvalidConfiguration]: ErrorCategory.Configuration,
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
