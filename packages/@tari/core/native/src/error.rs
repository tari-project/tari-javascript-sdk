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
    
    #[error("Not implemented: {0}")]
    NotImplemented(String),
    
    #[error("Neon error: {0}")]
    NeonError(String),
}

impl TariError {
    /// Convert to a JavaScript exception
    pub fn to_js_error<'a, T: neon::handle::Managed>(&self, cx: &mut FunctionContext<'a>) -> JsResult<'a, T> {
        let error_msg = format!("TariError: {}", self);
        cx.throw_error(error_msg)
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
        match err {
            minotari_wallet::error::WalletError::DatabaseError(e) => 
                TariError::DatabaseError(format!("Wallet database error: {}", e)),
            minotari_wallet::error::WalletError::CommsError(e) => 
                TariError::NetworkError(format!("Communication error: {}", e)),
            minotari_wallet::error::WalletError::TransactionServiceError(e) => 
                TariError::TransactionError(format!("Transaction service error: {}", e)),
            minotari_wallet::error::WalletError::OutputManagerError(e) => 
                TariError::WalletError(format!("Output manager error: {}", e)),
            minotari_wallet::error::WalletError::InsufficientFunds => 
                TariError::WalletError("Insufficient funds for transaction".to_string()),
            minotari_wallet::error::WalletError::InvalidAmount => 
                TariError::InvalidInput("Invalid transaction amount".to_string()),
            minotari_wallet::error::WalletError::InvalidAddress => 
                TariError::InvalidInput("Invalid wallet address".to_string()),
            minotari_wallet::error::WalletError::KeyManagerError(e) => 
                TariError::CryptoError(format!("Key manager error: {}", e)),
            _ => TariError::WalletError(format!("Wallet error: {}", err)),
        }
    }
}

/// Convert Tari communication errors to TariError
impl From<tari_comms::connectivity::ConnectivityError> for TariError {
    fn from(err: tari_comms::connectivity::ConnectivityError) -> Self {
        match err {
            tari_comms::connectivity::ConnectivityError::DialFailed => 
                TariError::NetworkError("Failed to dial peer".to_string()),
            tari_comms::connectivity::ConnectivityError::PeerBanned => 
                TariError::NetworkError("Peer is banned".to_string()),
            tari_comms::connectivity::ConnectivityError::NoTransport => 
                TariError::NetworkError("No transport available".to_string()),
            _ => TariError::NetworkError(format!("Connectivity error: {}", err)),
        }
    }
}

/// Convert Tari crypto errors to TariError
impl From<tari_crypto::errors::CryptoError> for TariError {
    fn from(err: tari_crypto::errors::CryptoError) -> Self {
        match err {
            tari_crypto::errors::CryptoError::InvalidKey => 
                TariError::CryptoError("Invalid cryptographic key".to_string()),
            tari_crypto::errors::CryptoError::InvalidSignature => 
                TariError::CryptoError("Invalid cryptographic signature".to_string()),
            tari_crypto::errors::CryptoError::InvalidSecretKey => 
                TariError::CryptoError("Invalid secret key".to_string()),
            tari_crypto::errors::CryptoError::InvalidPublicKey => 
                TariError::CryptoError("Invalid public key".to_string()),
            _ => TariError::CryptoError(format!("Cryptographic error: {}", err)),
        }
    }
}

/// Convert Tari key manager errors to TariError
impl From<tari_key_manager::error::KeyManagerError> for TariError {
    fn from(err: tari_key_manager::error::KeyManagerError) -> Self {
        match err {
            tari_key_manager::error::KeyManagerError::DatabaseError(e) => 
                TariError::DatabaseError(format!("Key manager database error: {}", e)),
            tari_key_manager::error::KeyManagerError::CipherError(e) => 
                TariError::CryptoError(format!("Cipher error: {}", e)),
            tari_key_manager::error::KeyManagerError::IndexOutOfRange => 
                TariError::InvalidInput("Key derivation index out of range".to_string()),
            _ => TariError::CryptoError(format!("Key manager error: {}", err)),
        }
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
