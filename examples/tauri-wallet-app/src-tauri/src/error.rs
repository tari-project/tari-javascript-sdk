use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Application error types
#[derive(Error, Debug)]
pub enum AppError {
    #[error("Wallet error: {0}")]
    Wallet(String),
    
    #[error("Storage error: {0}")]
    Storage(String),
    
    #[error("FFI error: {0}")]
    Ffi(String),
    
    #[error("Validation error: {0}")]
    Validation(String),
    
    #[error("Network error: {0}")]
    Network(String),
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    
    #[error("Generic error: {0}")]
    Generic(String),
}

/// Result type alias
pub type Result<T> = std::result::Result<T, AppError>;

/// Serializable error response for Tauri commands
#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub error: String,
    pub code: String,
    pub timestamp: i64,
}

impl From<AppError> for ErrorResponse {
    fn from(error: AppError) -> Self {
        let (code, message) = match &error {
            AppError::Wallet(_) => ("WALLET_ERROR", error.to_string()),
            AppError::Storage(_) => ("STORAGE_ERROR", error.to_string()),
            AppError::Ffi(_) => ("FFI_ERROR", error.to_string()),
            AppError::Validation(_) => ("VALIDATION_ERROR", error.to_string()),
            AppError::Network(_) => ("NETWORK_ERROR", error.to_string()),
            AppError::Io(_) => ("IO_ERROR", error.to_string()),
            AppError::Serialization(_) => ("SERIALIZATION_ERROR", error.to_string()),
            AppError::Generic(_) => ("GENERIC_ERROR", error.to_string()),
        };

        Self {
            error: message,
            code: code.to_string(),
            timestamp: chrono::Utc::now().timestamp_millis(),
        }
    }
}

/// Standard response wrapper for Tauri commands
#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<ErrorResponse>,
    pub timestamp: i64,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
            timestamp: chrono::Utc::now().timestamp_millis(),
        }
    }

    pub fn error(error: AppError) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(error.into()),
            timestamp: chrono::Utc::now().timestamp_millis(),
        }
    }
}

impl<T> From<Result<T>> for ApiResponse<T> {
    fn from(result: Result<T>) -> Self {
        match result {
            Ok(data) => Self::success(data),
            Err(error) => Self::error(error),
        }
    }
}
