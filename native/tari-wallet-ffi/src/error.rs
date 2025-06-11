/**
 * Error handling and conversion for Tari wallet FFI
 */

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::fmt;

/// Tari wallet error types that can be converted to JavaScript errors
#[derive(Debug)]
pub enum TariWalletError {
    InvalidConfig(String),
    WalletNotFound,
    WalletAlreadyExists,
    InsufficientFunds,
    InvalidAddress(String),
    TransactionNotFound(String),
    NetworkError(String),
    StorageError(String),
    FFIError(String),
    ValidationError(String),
    TemporaryFailure(String),
}

impl fmt::Display for TariWalletError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TariWalletError::InvalidConfig(msg) => write!(f, "Invalid configuration: {}", msg),
            TariWalletError::WalletNotFound => write!(f, "Wallet not found"),
            TariWalletError::WalletAlreadyExists => write!(f, "Wallet already exists"),
            TariWalletError::InsufficientFunds => write!(f, "Insufficient funds for transaction"),
            TariWalletError::InvalidAddress(addr) => write!(f, "Invalid address: {}", addr),
            TariWalletError::TransactionNotFound(id) => write!(f, "Transaction not found: {}", id),
            TariWalletError::NetworkError(msg) => write!(f, "Network error: {}", msg),
            TariWalletError::StorageError(msg) => write!(f, "Storage error: {}", msg),
            TariWalletError::FFIError(msg) => write!(f, "FFI error: {}", msg),
            TariWalletError::ValidationError(msg) => write!(f, "Validation error: {}", msg),
            TariWalletError::TemporaryFailure(msg) => write!(f, "Temporary failure: {}", msg),
        }
    }
}

impl std::error::Error for TariWalletError {}

impl From<TariWalletError> for napi::Error {
    fn from(err: TariWalletError) -> Self {
        let (status, message) = match &err {
            TariWalletError::InvalidConfig(_) => (Status::InvalidArg, err.to_string()),
            TariWalletError::WalletNotFound => (Status::GenericFailure, err.to_string()),
            TariWalletError::WalletAlreadyExists => (Status::InvalidArg, err.to_string()),
            TariWalletError::InsufficientFunds => (Status::GenericFailure, err.to_string()),
            TariWalletError::InvalidAddress(_) => (Status::InvalidArg, err.to_string()),
            TariWalletError::TransactionNotFound(_) => (Status::GenericFailure, err.to_string()),
            TariWalletError::NetworkError(_) => (Status::GenericFailure, err.to_string()),
            TariWalletError::StorageError(_) => (Status::GenericFailure, err.to_string()),
            TariWalletError::FFIError(_) => (Status::GenericFailure, err.to_string()),
            TariWalletError::ValidationError(_) => (Status::InvalidArg, err.to_string()),
            TariWalletError::TemporaryFailure(_) => (Status::GenericFailure, err.to_string()),
        };

        napi::Error::new(status, message)
    }
}

/// JavaScript error codes that correspond to TariWalletError variants
#[napi]
pub enum JsErrorCode {
    InvalidConfig = 1000,
    WalletNotFound = 1001,
    WalletAlreadyExists = 1002,
    InsufficientFunds = 2000,
    InvalidAddress = 2001,
    TransactionNotFound = 2002,
    NetworkError = 3000,
    StorageError = 4000,
    FFIError = 5000,
    ValidationError = 5001,
    TemporaryFailure = 5002,
}

/// Enhanced error information for JavaScript
#[napi(object)]
pub struct JsErrorInfo {
    pub code: i32,
    pub message: String,
    pub recoverable: bool,
    pub context: Option<String>,
}

impl TariWalletError {
    /// Convert to JavaScript error information
    pub fn to_js_error_info(&self) -> JsErrorInfo {
        let (code, recoverable) = match self {
            TariWalletError::InvalidConfig(_) => (JsErrorCode::InvalidConfig as i32, false),
            TariWalletError::WalletNotFound => (JsErrorCode::WalletNotFound as i32, false),
            TariWalletError::WalletAlreadyExists => (JsErrorCode::WalletAlreadyExists as i32, false),
            TariWalletError::InsufficientFunds => (JsErrorCode::InsufficientFunds as i32, false),
            TariWalletError::InvalidAddress(_) => (JsErrorCode::InvalidAddress as i32, false),
            TariWalletError::TransactionNotFound(_) => (JsErrorCode::TransactionNotFound as i32, false),
            TariWalletError::NetworkError(_) => (JsErrorCode::NetworkError as i32, true),
            TariWalletError::StorageError(_) => (JsErrorCode::StorageError as i32, false),
            TariWalletError::FFIError(_) => (JsErrorCode::FFIError as i32, false),
            TariWalletError::ValidationError(_) => (JsErrorCode::ValidationError as i32, false),
            TariWalletError::TemporaryFailure(_) => (JsErrorCode::TemporaryFailure as i32, true),
        };

        JsErrorInfo {
            code,
            message: self.to_string(),
            recoverable,
            context: None,
        }
    }

    /// Check if error indicates a retryable condition
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            TariWalletError::NetworkError(_) | TariWalletError::TemporaryFailure(_)
        )
    }

    /// Get error category for logging and metrics
    pub fn category(&self) -> &'static str {
        match self {
            TariWalletError::InvalidConfig(_) => "config",
            TariWalletError::WalletNotFound | TariWalletError::WalletAlreadyExists => "wallet",
            TariWalletError::InsufficientFunds
            | TariWalletError::TransactionNotFound(_) => "transaction",
            TariWalletError::InvalidAddress(_) => "address",
            TariWalletError::NetworkError(_) => "network",
            TariWalletError::StorageError(_) => "storage",
            TariWalletError::FFIError(_) | TariWalletError::ValidationError(_) => "internal",
            TariWalletError::TemporaryFailure(_) => "temporary",
        }
    }
}

/// Result type alias for Tari wallet operations
pub type TariResult<T> = std::result::Result<T, TariWalletError>;

/// Utility function to convert generic errors to TariWalletError
pub fn map_ffi_error<E: std::error::Error>(err: E) -> TariWalletError {
    TariWalletError::FFIError(err.to_string())
}

/// Utility function to create validation errors
pub fn validation_error(msg: &str) -> TariWalletError {
    TariWalletError::ValidationError(msg.to_string())
}

/// Utility function to create network errors
pub fn network_error(msg: &str) -> TariWalletError {
    TariWalletError::NetworkError(msg.to_string())
}

/// Utility function to create storage errors
pub fn storage_error(msg: &str) -> TariWalletError {
    TariWalletError::StorageError(msg.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_conversion() {
        let error = TariWalletError::InvalidConfig("test".to_string());
        let napi_error: napi::Error = error.into();
        assert_eq!(napi_error.status, Status::InvalidArg);
    }

    #[test]
    fn test_error_info() {
        let error = TariWalletError::NetworkError("connection failed".to_string());
        let info = error.to_js_error_info();
        assert_eq!(info.code, JsErrorCode::NetworkError as i32);
        assert!(info.recoverable);
        assert_eq!(error.category(), "network");
    }

    #[test]
    fn test_retryable_errors() {
        assert!(TariWalletError::NetworkError("test".to_string()).is_retryable());
        assert!(TariWalletError::TemporaryFailure("test".to_string()).is_retryable());
        assert!(!TariWalletError::InvalidConfig("test".to_string()).is_retryable());
    }
}
