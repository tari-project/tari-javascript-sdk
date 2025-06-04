use neon::prelude::*;
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
    
    #[error("Runtime error: {0}")]
    RuntimeError(String),
    
    #[error("Not implemented: {0}")]
    NotImplemented(String),
}

impl TariError {
    /// Convert to a JavaScript exception
    pub fn to_js_error<'a, T>(&self, cx: &mut FunctionContext<'a>) -> JsResult<'a, T> {
        let error_msg = format!("TariError: {}", self);
        cx.throw_error(error_msg)
    }
}

/// Result type for FFI operations
pub type TariResult<T> = Result<T, TariError>;

/// Safe execution wrapper for FFI functions
pub fn safe_execute<'a, F, T>(
    cx: &mut FunctionContext<'a>,
    operation: F,
) -> JsResult<'a, T>
where
    F: FnOnce() -> TariResult<T>,
    T: neon::types::Value,
{
    match operation() {
        Ok(result) => Ok(result),
        Err(e) => e.to_js_error(cx),
    }
}

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
