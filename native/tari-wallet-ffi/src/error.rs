/**
 * Legacy error handling for backward compatibility
 * 
 * This module maintains compatibility with existing code while
 * the new comprehensive error system is in error_mapping.rs
 */

use crate::error_mapping::{TariWalletError as NewTariWalletError};
use crate::error_codes::WalletErrorCode;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::fmt;

/// Legacy Tari wallet error types for backward compatibility
#[derive(Debug)]
pub enum LegacyTariWalletError {
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

/// Alias for backward compatibility
pub type TariWalletError = LegacyTariWalletError;

impl fmt::Display for LegacyTariWalletError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LegacyTariWalletError::InvalidConfig(msg) => write!(f, "Invalid configuration: {}", msg),
            LegacyTariWalletError::WalletNotFound => write!(f, "Wallet not found"),
            LegacyTariWalletError::WalletAlreadyExists => write!(f, "Wallet already exists"),
            LegacyTariWalletError::InsufficientFunds => write!(f, "Insufficient funds for transaction"),
            LegacyTariWalletError::InvalidAddress(addr) => write!(f, "Invalid address: {}", addr),
            LegacyTariWalletError::TransactionNotFound(id) => write!(f, "Transaction not found: {}", id),
            LegacyTariWalletError::NetworkError(msg) => write!(f, "Network error: {}", msg),
            LegacyTariWalletError::StorageError(msg) => write!(f, "Storage error: {}", msg),
            LegacyTariWalletError::FFIError(msg) => write!(f, "FFI error: {}", msg),
            LegacyTariWalletError::ValidationError(msg) => write!(f, "Validation error: {}", msg),
            LegacyTariWalletError::TemporaryFailure(msg) => write!(f, "Temporary failure: {}", msg),
        }
    }
}

impl std::error::Error for LegacyTariWalletError {}

// Implement AsRef<str> for NAPI-RS compatibility
impl AsRef<str> for LegacyTariWalletError {
    fn as_ref(&self) -> &str {
        match self {
            LegacyTariWalletError::InvalidConfig(_) => "InvalidConfig",
            LegacyTariWalletError::WalletNotFound => "WalletNotFound",
            LegacyTariWalletError::WalletAlreadyExists => "WalletAlreadyExists",
            LegacyTariWalletError::InsufficientFunds => "InsufficientFunds",
            LegacyTariWalletError::InvalidAddress(_) => "InvalidAddress",
            LegacyTariWalletError::TransactionNotFound(_) => "TransactionNotFound",
            LegacyTariWalletError::NetworkError(_) => "NetworkError",
            LegacyTariWalletError::StorageError(_) => "StorageError",
            LegacyTariWalletError::FFIError(_) => "FFIError",
            LegacyTariWalletError::ValidationError(_) => "ValidationError",
            LegacyTariWalletError::TemporaryFailure(_) => "TemporaryFailure",
        }
    }
}

impl From<LegacyTariWalletError> for napi::Error {
    fn from(err: LegacyTariWalletError) -> Self {
        let (status, message) = match &err {
            LegacyTariWalletError::InvalidConfig(_) => (Status::InvalidArg, err.to_string()),
            LegacyTariWalletError::WalletNotFound => (Status::GenericFailure, err.to_string()),
            LegacyTariWalletError::WalletAlreadyExists => (Status::InvalidArg, err.to_string()),
            LegacyTariWalletError::InsufficientFunds => (Status::GenericFailure, err.to_string()),
            LegacyTariWalletError::InvalidAddress(_) => (Status::InvalidArg, err.to_string()),
            LegacyTariWalletError::TransactionNotFound(_) => (Status::GenericFailure, err.to_string()),
            LegacyTariWalletError::NetworkError(_) => (Status::GenericFailure, err.to_string()),
            LegacyTariWalletError::StorageError(_) => (Status::GenericFailure, err.to_string()),
            LegacyTariWalletError::FFIError(_) => (Status::GenericFailure, err.to_string()),
            LegacyTariWalletError::ValidationError(_) => (Status::InvalidArg, err.to_string()),
            LegacyTariWalletError::TemporaryFailure(_) => (Status::GenericFailure, err.to_string()),
        };

        napi::Error::new(status, message)
    }
}

/// Convert legacy errors to new error system
impl From<LegacyTariWalletError> for NewTariWalletError {
    fn from(legacy: LegacyTariWalletError) -> Self {
        let (code, message) = match legacy {
            LegacyTariWalletError::InvalidConfig(msg) => (WalletErrorCode::InvalidConfig, msg),
            LegacyTariWalletError::WalletNotFound => (WalletErrorCode::WalletNotFound, "Wallet not found".to_string()),
            LegacyTariWalletError::WalletAlreadyExists => (WalletErrorCode::WalletExists, "Wallet already exists".to_string()),
            LegacyTariWalletError::InsufficientFunds => (WalletErrorCode::InsufficientFunds, "Insufficient funds".to_string()),
            LegacyTariWalletError::InvalidAddress(addr) => (WalletErrorCode::InvalidAddress, format!("Invalid address: {}", addr)),
            LegacyTariWalletError::TransactionNotFound(id) => (WalletErrorCode::TransactionNotFound, format!("Transaction not found: {}", id)),
            LegacyTariWalletError::NetworkError(msg) => (WalletErrorCode::NetworkUnavailable, msg),
            LegacyTariWalletError::StorageError(msg) => (WalletErrorCode::DatabaseCorrupted, msg),
            LegacyTariWalletError::FFIError(msg) => (WalletErrorCode::FFICallFailed, msg),
            LegacyTariWalletError::ValidationError(msg) => (WalletErrorCode::InvalidFormat, msg),
            LegacyTariWalletError::TemporaryFailure(msg) => (WalletErrorCode::OperationTimeout, msg),
        };

        NewTariWalletError::new(code, message).component("legacy")
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
