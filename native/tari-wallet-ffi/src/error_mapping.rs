/**
 * Comprehensive error mapping between Rust and JavaScript
 * 
 * This module provides sophisticated error translation that preserves context,
 * maintains error details, and ensures proper error code mapping across the FFI boundary.
 */

use crate::error_codes::{WalletErrorCode, ErrorCategory, ErrorSeverity};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::collections::HashMap;
use std::fmt;

/// Enhanced error information for JavaScript with full context preservation
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsErrorInfo {
    /// Numeric error code matching TypeScript WalletErrorCode
    pub code: i32,
    /// Human-readable error message
    pub message: String,
    /// Whether this error can be recovered through retry
    pub recoverable: bool,
    /// Error severity level
    pub severity: String,
    /// Error category
    pub category: String,
    /// Optional context information (JSON string)
    pub context: Option<String>,
    /// Timestamp when error occurred
    pub timestamp: String,
    /// Stack trace if available
    pub stack_trace: Option<String>,
    /// Operation that caused the error
    pub operation: Option<String>,
    /// Component where error originated
    pub component: Option<String>,
}

/// Internal error context for tracking error details
#[derive(Debug, Clone)]
pub struct ErrorContext {
    pub operation: Option<String>,
    pub component: Option<String>,
    pub metadata: HashMap<String, String>,
    pub stack_trace: Option<String>,
}

impl Default for ErrorContext {
    fn default() -> Self {
        Self {
            operation: None,
            component: None,
            metadata: HashMap::new(),
            stack_trace: None,
        }
    }
}

impl ErrorContext {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_operation(mut self, operation: impl Into<String>) -> Self {
        self.operation = Some(operation.into());
        self
    }

    pub fn with_component(mut self, component: impl Into<String>) -> Self {
        self.component = Some(component.into());
        self
    }

    pub fn with_metadata(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.metadata.insert(key.into(), value.into());
        self
    }

    pub fn with_stack_trace(mut self, stack_trace: impl Into<String>) -> Self {
        self.stack_trace = Some(stack_trace.into());
        self
    }

    /// Convert to JSON string for JavaScript
    pub fn to_json(&self) -> Option<String> {
        if self.operation.is_none() && self.component.is_none() && self.metadata.is_empty() {
            return None;
        }

        let mut context = serde_json::Map::new();
        
        if let Some(ref operation) = self.operation {
            context.insert("operation".to_string(), serde_json::Value::String(operation.clone()));
        }
        
        if let Some(ref component) = self.component {
            context.insert("component".to_string(), serde_json::Value::String(component.clone()));
        }
        
        if !self.metadata.is_empty() {
            let metadata: serde_json::Map<String, serde_json::Value> = self.metadata
                .iter()
                .map(|(k, v)| (k.clone(), serde_json::Value::String(v.clone())))
                .collect();
            context.insert("metadata".to_string(), serde_json::Value::Object(metadata));
        }

        serde_json::to_string(&context).ok()
    }
}

/// Enhanced Tari wallet error with comprehensive context
#[derive(Debug)]
pub struct TariWalletError {
    pub code: WalletErrorCode,
    pub message: String,
    pub context: ErrorContext,
    pub cause: Option<Box<dyn std::error::Error + Send + Sync>>,
}

impl TariWalletError {
    /// Create a new TariWalletError with the specified code and message
    pub fn new(code: WalletErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            context: ErrorContext::new(),
            cause: None,
        }
    }

    /// Create error with context
    pub fn with_context(
        code: WalletErrorCode,
        message: impl Into<String>,
        context: ErrorContext,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            context,
            cause: None,
        }
    }

    /// Create error with cause
    pub fn with_cause(
        code: WalletErrorCode,
        message: impl Into<String>,
        cause: Box<dyn std::error::Error + Send + Sync>,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            context: ErrorContext::new(),
            cause: Some(cause),
        }
    }

    /// Add operation context
    pub fn operation(mut self, operation: impl Into<String>) -> Self {
        self.context.operation = Some(operation.into());
        self
    }

    /// Add component context
    pub fn component(mut self, component: impl Into<String>) -> Self {
        self.context.component = Some(component.into());
        self
    }

    /// Add metadata
    pub fn metadata(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.context.metadata.insert(key.into(), value.into());
        self
    }

    /// Convert to JavaScript error information
    pub fn to_js_error_info(&self) -> JsErrorInfo {
        let now = chrono::Utc::now();
        
        JsErrorInfo {
            code: self.code as i32,
            message: self.message.clone(),
            recoverable: self.code.is_recoverable(),
            severity: self.code.severity().to_string(),
            category: self.code.category().to_string(),
            context: self.context.to_json(),
            timestamp: now.to_rfc3339(),
            stack_trace: self.context.stack_trace.clone(),
            operation: self.context.operation.clone(),
            component: self.context.component.clone(),
        }
    }

    /// Get error category
    pub fn category(&self) -> ErrorCategory {
        self.code.category()
    }

    /// Check if error is recoverable
    pub fn is_recoverable(&self) -> bool {
        self.code.is_recoverable()
    }

    /// Get error severity
    pub fn severity(&self) -> ErrorSeverity {
        self.code.severity()
    }
}

impl fmt::Display for TariWalletError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code as i32, self.message)
    }
}

impl std::error::Error for TariWalletError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        self.cause.as_ref().map(|e| {
            let err: &(dyn std::error::Error + Send + Sync) = e.as_ref();
            err as &(dyn std::error::Error + 'static)
        })
    }
}

/// Convert TariWalletError to NAPI Error
impl From<TariWalletError> for napi::Error {
    fn from(err: TariWalletError) -> Self {
        let status = match err.category() {
            ErrorCategory::Validation => Status::InvalidArg,
            ErrorCategory::Security => Status::GenericFailure,
            ErrorCategory::Resource => Status::GenericFailure,
            ErrorCategory::Network => Status::GenericFailure,
            _ => Status::GenericFailure,
        };

        // Include error code in the message for easier debugging
        let enhanced_message = format!("[{}] {}", err.code as i32, err.message);
        
        napi::Error::new(status, enhanced_message)
    }
}

/// Result type alias for Tari wallet operations
pub type TariResult<T> = std::result::Result<T, TariWalletError>;

/// Error mapping utilities for different types of native Tari errors
pub struct ErrorMapper;

impl ErrorMapper {
    /// Map generic I/O errors to appropriate Tari error codes
    pub fn map_io_error(err: std::io::Error, context: ErrorContext) -> TariWalletError {
        let code = match err.kind() {
            std::io::ErrorKind::NotFound => WalletErrorCode::FileNotFound,
            std::io::ErrorKind::PermissionDenied => WalletErrorCode::PermissionDenied,
            std::io::ErrorKind::ConnectionRefused => WalletErrorCode::ConnectionFailed,
            std::io::ErrorKind::ConnectionAborted => WalletErrorCode::PeerConnectionLost,
            std::io::ErrorKind::TimedOut => WalletErrorCode::ConnectionTimeout,
            std::io::ErrorKind::WriteZero => WalletErrorCode::DiskFull,
            std::io::ErrorKind::Interrupted => WalletErrorCode::OperationCancelled,
            std::io::ErrorKind::OutOfMemory => WalletErrorCode::MemoryAllocationError,
            _ => WalletErrorCode::InternalError,
        };

        TariWalletError::with_context(code, err.to_string(), context)
            .component("io")
    }

    /// Map serialization errors
    pub fn map_serde_error(err: serde_json::Error, context: ErrorContext) -> TariWalletError {
        TariWalletError::with_context(
            WalletErrorCode::SerializationError,
            format!("JSON serialization failed: {}", err),
            context,
        )
        .component("serialization")
    }

    /// Map network-related errors
    pub fn map_network_error(message: impl Into<String>, context: ErrorContext) -> TariWalletError {
        TariWalletError::with_context(WalletErrorCode::NetworkUnavailable, message, context)
            .component("network")
    }

    /// Map database/storage errors
    pub fn map_storage_error(message: impl Into<String>, context: ErrorContext) -> TariWalletError {
        TariWalletError::with_context(WalletErrorCode::DatabaseCorrupted, message, context)
            .component("storage")
    }

    /// Map validation errors
    pub fn map_validation_error(
        message: impl Into<String>,
        context: ErrorContext,
    ) -> TariWalletError {
        TariWalletError::with_context(WalletErrorCode::InvalidFormat, message, context)
            .component("validation")
    }

    /// Map FFI-specific errors
    pub fn map_ffi_error(message: impl Into<String>, context: ErrorContext) -> TariWalletError {
        TariWalletError::with_context(WalletErrorCode::FFICallFailed, message, context)
            .component("ffi")
    }

    /// Map configuration errors
    pub fn map_config_error(message: impl Into<String>, context: ErrorContext) -> TariWalletError {
        TariWalletError::with_context(WalletErrorCode::InvalidConfig, message, context)
            .component("config")
    }

    /// Map transaction-related errors
    pub fn map_transaction_error(
        message: impl Into<String>,
        context: ErrorContext,
    ) -> TariWalletError {
        TariWalletError::with_context(WalletErrorCode::TransactionFailed, message, context)
            .component("transaction")
    }
}

/// Convenience functions for creating common errors
pub fn insufficient_funds(amount: u64, available: u64) -> TariWalletError {
    TariWalletError::new(
        WalletErrorCode::InsufficientFunds,
        format!("Insufficient funds: need {}, have {}", amount, available),
    )
    .metadata("required_amount", amount.to_string())
    .metadata("available_amount", available.to_string())
    .component("wallet")
}

pub fn invalid_address(address: impl Into<String>) -> TariWalletError {
    let addr = address.into();
    TariWalletError::new(
        WalletErrorCode::InvalidAddress,
        format!("Invalid Tari address: {}", addr),
    )
    .metadata("address", addr)
    .component("address")
}

pub fn wallet_not_found(wallet_id: impl Into<String>) -> TariWalletError {
    let id = wallet_id.into();
    TariWalletError::new(
        WalletErrorCode::WalletNotFound,
        format!("Wallet not found: {}", id),
    )
    .metadata("wallet_id", id)
    .component("wallet")
}

pub fn transaction_not_found(tx_id: impl Into<String>) -> TariWalletError {
    let id = tx_id.into();
    TariWalletError::new(
        WalletErrorCode::TransactionNotFound,
        format!("Transaction not found: {}", id),
    )
    .metadata("transaction_id", id)
    .component("transaction")
}

pub fn network_unavailable(reason: impl Into<String>) -> TariWalletError {
    TariWalletError::new(
        WalletErrorCode::NetworkUnavailable,
        format!("Network unavailable: {}", reason.into()),
    )
    .component("network")
}

/// Export error information to JavaScript
#[napi]
pub fn create_error_info(
    code: i32,
    message: String,
    context: Option<String>,
) -> napi::Result<JsErrorInfo> {
    // Try to convert the code to a known WalletErrorCode
    let wallet_code = match code {
        1000 => WalletErrorCode::InvalidConfig,
        1001 => WalletErrorCode::WalletExists,
        1002 => WalletErrorCode::WalletNotFound,
        2000 => WalletErrorCode::InsufficientFunds,
        2001 => WalletErrorCode::InvalidAddress,
        3000 => WalletErrorCode::NetworkUnavailable,
        _ => WalletErrorCode::Unknown,
    };

    let now = chrono::Utc::now();
    
    Ok(JsErrorInfo {
        code,
        message,
        recoverable: wallet_code.is_recoverable(),
        severity: wallet_code.severity().to_string(),
        category: wallet_code.category().to_string(),
        context,
        timestamp: now.to_rfc3339(),
        stack_trace: None,
        operation: None,
        component: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_context_json() {
        let context = ErrorContext::new()
            .with_operation("send_transaction")
            .with_component("wallet")
            .with_metadata("amount", "1000")
            .with_metadata("address", "test_address");

        let json = context.to_json().unwrap();
        assert!(json.contains("send_transaction"));
        assert!(json.contains("wallet"));
        assert!(json.contains("1000"));
    }

    #[test]
    fn test_error_mapping() {
        let error = insufficient_funds(1000, 500);
        assert_eq!(error.code, WalletErrorCode::InsufficientFunds);
        assert!(error.message.contains("1000"));
        assert!(error.message.contains("500"));
        assert_eq!(error.category(), ErrorCategory::Transaction);
    }

    #[test]
    fn test_js_error_info_conversion() {
        let error = invalid_address("invalid_addr");
        let js_info = error.to_js_error_info();
        
        assert_eq!(js_info.code, WalletErrorCode::InvalidAddress as i32);
        assert!(!js_info.recoverable);
        assert_eq!(js_info.category, "Transaction");
        assert!(js_info.context.is_some());
    }

    #[test]
    fn test_io_error_mapping() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let context = ErrorContext::new().with_operation("read_file");
        let error = ErrorMapper::map_io_error(io_err, context);
        
        assert_eq!(error.code, WalletErrorCode::FileNotFound);
        assert_eq!(error.context.operation, Some("read_file".to_string()));
    }
}
