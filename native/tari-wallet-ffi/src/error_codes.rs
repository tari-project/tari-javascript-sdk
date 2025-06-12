/**
 * Comprehensive error codes matching the TypeScript WalletErrorCode enum
 * 
 * This module provides a complete mapping of all error codes used in the
 * JavaScript SDK, ensuring consistent error identification across the FFI boundary.
 */

use napi_derive::napi;

/// JavaScript-compatible error codes that map exactly to WalletErrorCode
#[napi]
#[derive(Debug, PartialEq, Eq)]
pub enum WalletErrorCode {
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
    
    // Network errors (3000-3099)
    NetworkUnavailable = 3000,
    ConnectionFailed = 3001,
    ConnectionTimeout = 3002,
    PeerNotFound = 3003,
    SyncFailed = 3004,
    InvalidPeerAddress = 3005,
    PeerConnectionLost = 3006,
    NetworkConfigError = 3007,
    ProtocolVersionMismatch = 3008,
    InvalidMessage = 3009,
    MessageTooLarge = 3010,
    HandshakeFailed = 3011,
    InvalidNetworkId = 3012,
    ConnectivityIssue = 3013,
    BaseNodeNotReachable = 3014,
    
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
    
    // FFI errors (5000-5099)
    UseAfterFree = 5000,
    ResourceDestroyed = 5001,
    InvalidHandle = 5002,
    HandleNotFound = 5003,
    FFICallFailed = 5004,
    ThreadingError = 5005,
    SerializationError = 5006,
    DeserializationError = 5007,
    TypeConversionError = 5008,
    NullPointerError = 5009,
    MemoryAllocationError = 5010,
    BufferOverflow = 5011,
    InvalidParameter = 5012,
    CallbackError = 5013,
    AsyncOperationFailed = 5014,
    
    // Resource errors (6000-6099)
    ResourceNotFound = 6000,
    ResourceBusy = 6001,
    ResourceExhausted = 6002,
    MemoryLeak = 6003,
    TooManyOpenFiles = 6004,
    FileLocked = 6005,
    DirectoryNotFound = 6006,
    FileNotFound = 6007,
    PermissionDenied = 6008,
    DiskFull = 6009,
    InvalidPath = 6010,
    FileAccessDenied = 6011,
    FileAlreadyExists = 6012,
    ResourceTimeout = 6013,
    ResourceQuotaExceeded = 6014,
    
    // Security errors (7000-7099)
    InvalidKey = 7000,
    KeyNotFound = 7001,
    InvalidCertificate = 7002,
    CertificateExpired = 7003,
    AuthenticationFailed = 7004,
    UnauthorizedAccess = 7005,
    SecurityViolation = 7006,
    TamperedData = 7007,
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
}

impl WalletErrorCode {
    /// Get the error category for this error code
    pub fn category(&self) -> ErrorCategory {
        match *self as u32 {
            1000..=1099 => ErrorCategory::Initialization,
            2000..=2099 => ErrorCategory::Transaction,
            3000..=3099 => ErrorCategory::Network,
            4000..=4099 => ErrorCategory::Validation,
            5000..=5099 => ErrorCategory::FFI,
            6000..=6099 => ErrorCategory::Resource,
            7000..=7099 => ErrorCategory::Security,
            8000..=8099 => ErrorCategory::Configuration,
            9000..=9099 => ErrorCategory::General,
            _ => ErrorCategory::General,
        }
    }

    /// Check if this error is typically recoverable through retry
    pub fn is_recoverable(&self) -> bool {
        match self {
            // Network errors are usually recoverable
            WalletErrorCode::NetworkUnavailable
            | WalletErrorCode::ConnectionFailed
            | WalletErrorCode::ConnectionTimeout
            | WalletErrorCode::PeerConnectionLost
            | WalletErrorCode::ConnectivityIssue
            | WalletErrorCode::BaseNodeNotReachable => true,
            
            // Some resource errors are recoverable
            WalletErrorCode::ResourceBusy
            | WalletErrorCode::ResourceTimeout
            | WalletErrorCode::FileLocked => true,
            
            // Rate limiting is recoverable with backoff
            WalletErrorCode::RateLimited => true,
            
            // Service issues are often temporary
            WalletErrorCode::ServiceDegraded
            | WalletErrorCode::OperationTimeout => true,
            
            // Some FFI errors can be retried
            WalletErrorCode::AsyncOperationFailed => true,
            
            // Most other errors are not recoverable
            _ => false,
        }
    }

    /// Get the severity level for this error
    pub fn severity(&self) -> ErrorSeverity {
        match self {
            // Critical errors that require immediate attention
            WalletErrorCode::DatabaseCorrupted
            | WalletErrorCode::SecurityViolation
            | WalletErrorCode::TamperedData
            | WalletErrorCode::UseAfterFree
            | WalletErrorCode::MemoryLeak
            | WalletErrorCode::BufferOverflow => ErrorSeverity::Critical,
            
            // Errors that prevent operation but aren't critical
            WalletErrorCode::InsufficientFunds
            | WalletErrorCode::InvalidAddress
            | WalletErrorCode::TransactionFailed
            | WalletErrorCode::InitializationFailed
            | WalletErrorCode::AuthenticationFailed => ErrorSeverity::Error,
            
            // Warnings for degraded functionality
            WalletErrorCode::ServiceDegraded
            | WalletErrorCode::VersionMismatch
            | WalletErrorCode::Deprecated
            | WalletErrorCode::FeatureDisabled => ErrorSeverity::Warning,
            
            // Informational
            WalletErrorCode::OperationCancelled
            | WalletErrorCode::MaintenanceMode => ErrorSeverity::Info,
            
            // Default to Error for unknown cases
            _ => ErrorSeverity::Error,
        }
    }
}

/// Error category enum matching TypeScript ErrorCategory
#[napi]
#[derive(Debug, PartialEq, Eq)]
pub enum ErrorCategory {
    Initialization,
    Transaction,
    Network,
    Validation,
    FFI,
    Resource,
    Security,
    Configuration,
    General,
}

/// Error severity levels matching TypeScript ErrorSeverity
#[napi]
#[derive(Debug, PartialEq, Eq)]
pub enum ErrorSeverity {
    Info,
    Warning,
    Error,
    Critical,
}

impl std::fmt::Display for ErrorCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ErrorCategory::Initialization => write!(f, "Initialization"),
            ErrorCategory::Transaction => write!(f, "Transaction"),
            ErrorCategory::Network => write!(f, "Network"),
            ErrorCategory::Validation => write!(f, "Validation"),
            ErrorCategory::FFI => write!(f, "FFI"),
            ErrorCategory::Resource => write!(f, "Resource"),
            ErrorCategory::Security => write!(f, "Security"),
            ErrorCategory::Configuration => write!(f, "Configuration"),
            ErrorCategory::General => write!(f, "General"),
        }
    }
}

impl std::fmt::Display for ErrorSeverity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ErrorSeverity::Info => write!(f, "info"),
            ErrorSeverity::Warning => write!(f, "warning"),
            ErrorSeverity::Error => write!(f, "error"),
            ErrorSeverity::Critical => write!(f, "critical"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_category_mapping() {
        assert_eq!(WalletErrorCode::InvalidConfig.category(), ErrorCategory::Initialization);
        assert_eq!(WalletErrorCode::InsufficientFunds.category(), ErrorCategory::Transaction);
        assert_eq!(WalletErrorCode::NetworkUnavailable.category(), ErrorCategory::Network);
        assert_eq!(WalletErrorCode::InvalidFormat.category(), ErrorCategory::Validation);
        assert_eq!(WalletErrorCode::UseAfterFree.category(), ErrorCategory::FFI);
        assert_eq!(WalletErrorCode::ResourceNotFound.category(), ErrorCategory::Resource);
        assert_eq!(WalletErrorCode::InvalidKey.category(), ErrorCategory::Security);
        assert_eq!(WalletErrorCode::ConfigNotFound.category(), ErrorCategory::Configuration);
        assert_eq!(WalletErrorCode::Unknown.category(), ErrorCategory::General);
    }

    #[test]
    fn test_recoverability() {
        assert!(WalletErrorCode::NetworkUnavailable.is_recoverable());
        assert!(WalletErrorCode::ConnectionTimeout.is_recoverable());
        assert!(WalletErrorCode::RateLimited.is_recoverable());
        assert!(!WalletErrorCode::InvalidConfig.is_recoverable());
        assert!(!WalletErrorCode::DatabaseCorrupted.is_recoverable());
    }

    #[test]
    fn test_severity_levels() {
        assert_eq!(WalletErrorCode::DatabaseCorrupted.severity(), ErrorSeverity::Critical);
        assert_eq!(WalletErrorCode::InsufficientFunds.severity(), ErrorSeverity::Error);
        assert_eq!(WalletErrorCode::ServiceDegraded.severity(), ErrorSeverity::Warning);
        assert_eq!(WalletErrorCode::OperationCancelled.severity(), ErrorSeverity::Info);
    }
}
