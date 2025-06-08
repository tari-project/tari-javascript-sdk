use neon::prelude::*;
use neon::result::Throw;
use thiserror::Error;

/// Main error type for FFI operations
#[derive(Error, Debug)]
pub enum TariError {
    #[error("Wallet error: {0}")]
    WalletError(String),
    
    #[error("Invalid handle: {0}")]
    InvalidHandle(u64),
    
    #[error("Crypto error: {0}")]
    CryptoError(String),
    
    #[error("Transaction error: {0}")]
    TransactionError(String),
    
    #[error("Network error: {0}")]
    NetworkError(String),
    
    #[error("Invalid argument: {0}")]
    InvalidArgument(String),
    
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    
    #[error("Database error: {0}")]
    DatabaseError(String),
    
    #[error("Runtime error: {0}")]
    RuntimeError(String),
    
    #[error("Key manager error: {0}")]
    KeyManagerError(String),
    
    #[error("Not implemented: {0}")]
    NotImplemented(String),
    
    #[error("Neon error: {0}")]
    NeonError(String),
    
    #[error("Address parsing error: {0}")]
    AddressError(String),
    
    #[error("Transaction builder error: {0}")]
    TransactionBuilderError(String),
    
    #[error("Node connection error: {0}")]
    NodeConnectionError(String),
    
    #[error("Synchronization error: {0}")]
    SyncError(String),
    
    #[error("Configuration error: {0}")]
    ConfigError(String),
    
    #[error("Validation error: {0}")]
    ValidationError(String),

    #[error("Timeout error: {0}")]
    TimeoutError(String),

    #[error("Connectivity error: {0}")]
    ConnectivityError(String),
}

impl TariError {
    /// Convert to a JavaScript exception
    pub fn to_js_error<'a, T: neon::handle::Managed>(&self, cx: &mut FunctionContext<'a>) -> JsResult<'a, T> {
        let error_msg = format!("TariError: {}", self);
        cx.throw_error(error_msg)
    }

    /// Check if this error indicates a recoverable state
    pub fn is_recoverable(&self) -> bool {
        match self {
            TariError::NodeConnectionError(_) => true,
            TariError::NetworkError(_) => true,
            TariError::SyncError(_) => true,
            TariError::ConnectivityError(_) => true,
            TariError::TimeoutError(_) => true,
            TariError::DatabaseError(_) => false, // Usually not recoverable
            TariError::CryptoError(_) => false,
            TariError::ValidationError(_) => false,
            TariError::ConfigError(_) => false,
            _ => false,
        }
    }
}

/// Result type for FFI operations
pub type TariResult<T> = Result<T, TariError>;

/// Convert anyhow errors to TariError
impl From<anyhow::Error> for TariError {
    fn from(err: anyhow::Error) -> Self {
        TariError::RuntimeError(err.to_string())
    }
}

/// Convert tokio join errors to TariError
impl From<tokio::task::JoinError> for TariError {
    fn from(err: tokio::task::JoinError) -> Self {
        TariError::RuntimeError(format!("Async task failed: {}", err))
    }
}

/// Convert neon Throw errors to TariError
impl From<Throw> for TariError {
    fn from(_: Throw) -> Self {
        TariError::NeonError("JavaScript call failed".to_string())
    }
}

/// Convert Tari wallet errors to TariError
impl From<minotari_wallet::error::WalletError> for TariError {
    fn from(err: minotari_wallet::error::WalletError) -> Self {
        // For now, use a generic conversion until we can properly match error variants
        TariError::WalletError(format!("Wallet error: {}", err))
    }
}

/// Convert Tari key manager errors to TariError
impl From<tari_key_manager::error::KeyManagerError> for TariError {
    fn from(err: tari_key_manager::error::KeyManagerError) -> Self {
        // For now, use a generic conversion until we can properly match error variants
        TariError::CryptoError(format!("Key manager error: {}", err))
    }
}

/// Convert Tari utilities hex errors to TariError
impl From<tari_utilities::hex::HexError> for TariError {
    fn from(err: tari_utilities::hex::HexError) -> Self {
        TariError::InvalidInput(format!("Invalid hex string: {}", err))
    }
}

/// Convert standard string parse errors to TariError
impl From<std::num::ParseIntError> for TariError {
    fn from(err: std::num::ParseIntError) -> Self {
        TariError::InvalidInput(format!("Invalid number format: {}", err))
    }
}

/// Convert standard IO errors to TariError  
impl From<std::io::Error> for TariError {
    fn from(err: std::io::Error) -> Self {
        match err.kind() {
            std::io::ErrorKind::NotFound => 
                TariError::DatabaseError("Database file not found".to_string()),
            std::io::ErrorKind::PermissionDenied => 
                TariError::DatabaseError("Permission denied accessing database".to_string()),
            std::io::ErrorKind::InvalidData => 
                TariError::DatabaseError("Invalid database format".to_string()),
            _ => TariError::RuntimeError(format!("IO error: {}", err)),
        }
    }
}

/// Convert hex decode errors to TariError
impl From<hex::FromHexError> for TariError {
    fn from(err: hex::FromHexError) -> Self {
        TariError::AddressError(format!("Invalid hex encoding: {}", err))
    }
}

/// Convert address format errors to TariError
impl TariError {
    /// Create an address parsing error
    pub fn address_parse_error(msg: &str) -> Self {
        TariError::AddressError(msg.to_string())
    }
    
    /// Create a transaction builder error
    pub fn transaction_builder_error(msg: &str) -> Self {
        TariError::TransactionBuilderError(msg.to_string())
    }
    
    /// Create a node connection error
    pub fn node_connection_error(msg: &str) -> Self {
        TariError::NodeConnectionError(msg.to_string())
    }
    
    /// Create a synchronization error
    pub fn sync_error(msg: &str) -> Self {
        TariError::SyncError(msg.to_string())
    }
    
    /// Create a configuration error
    pub fn config_error(msg: &str) -> Self {
        TariError::ConfigError(msg.to_string())
    }
    
    /// Create a validation error
    pub fn validation_error(msg: &str) -> Self {
        TariError::ValidationError(msg.to_string())
    }
    
    /// Check if error is retryable (for resilience patterns)
    pub fn is_retryable(&self) -> bool {
        match self {
            TariError::NetworkError(_) => true,
            TariError::NodeConnectionError(_) => true,
            TariError::SyncError(_) => true,
            TariError::RuntimeError(_) => true,
            TariError::DatabaseError(_) => false, // Usually not retryable
            TariError::InvalidInput(_) => false,
            TariError::InvalidArgument(_) => false,
            TariError::AddressError(_) => false,
            _ => false,
        }
    }
    
    /// Get error category for logging and metrics
    pub fn category(&self) -> &'static str {
        match self {
            TariError::WalletError(_) => "wallet",
            TariError::CryptoError(_) => "crypto",
            TariError::TransactionError(_) => "transaction",
            TariError::TransactionBuilderError(_) => "transaction_builder",
            TariError::NetworkError(_) => "network",
            TariError::NodeConnectionError(_) => "node_connection",
            TariError::SyncError(_) => "sync",
            TariError::DatabaseError(_) => "database",
            TariError::ConfigError(_) => "config",
            TariError::AddressError(_) => "address",
            TariError::ValidationError(_) => "validation",
            TariError::RuntimeError(_) => "runtime",
            TariError::KeyManagerError(_) => "key_manager",
            TariError::InvalidHandle(_) => "invalid_handle",
            TariError::InvalidArgument(_) => "invalid_argument",
            TariError::InvalidInput(_) => "invalid_input",
            TariError::NotImplemented(_) => "not_implemented",
            TariError::TimeoutError(_) => "timeout",
            TariError::ConnectivityError(_) => "connectivity",
            TariError::NeonError(_) => "neon",
        }
    }
}

/// Macro for safe execution that handles errors properly
#[macro_export]
macro_rules! try_js {
    ($cx:expr, $expr:expr) => {
        match $expr {
            Ok(v) => v,
            Err(e) => return e.to_js_error($cx),
        }
    };
}

/// Convert from UTF-8 errors
impl From<std::str::Utf8Error> for TariError {
    fn from(err: std::str::Utf8Error) -> Self {
        TariError::ValidationError(format!("UTF-8 error: {}", err))
    }
}
