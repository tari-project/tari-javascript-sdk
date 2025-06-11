//! Tari Wallet FFI Bindings
//!
//! This module provides NAPI-RS bindings for Tari wallet functionality,
//! enabling JavaScript applications to interact with the Tari wallet
//! through a high-performance FFI interface.

#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use once_cell::sync::Lazy;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{info, warn};

/// Initialize logging for the FFI module
static INIT: Lazy<()> = Lazy::new(|| {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();
    info!("Tari Wallet FFI initialized");
});

/// Ensures logging is initialized when the module is loaded
fn ensure_init() {
    Lazy::force(&INIT);
}

/// JavaScript-accessible wallet configuration
#[napi(object)]
pub struct JsWalletConfig {
    /// Network type: "mainnet", "testnet", or "nextnet"
    pub network: String,
    /// Path for wallet storage directory
    pub storage_path: String,
    /// Optional log file path
    pub log_path: Option<String>,
    /// Log level: "error", "warn", "info", "debug", "trace"
    pub log_level: Option<String>,
    /// Optional wallet passphrase
    pub passphrase: Option<String>,
    /// Optional seed words for wallet recovery
    pub seed_words: Option<Vec<String>>,
    /// Number of rolling log files to keep
    pub num_rolling_log_files: Option<u32>,
    /// Size of each rolling log file in bytes
    pub rolling_log_file_size: Option<u32>,
}

/// JavaScript-accessible wallet balance information
#[napi(object)]
pub struct JsBalance {
    /// Available balance in microTari
    pub available: String,
    /// Pending incoming balance in microTari
    pub pending_incoming: String,
    /// Pending outgoing balance in microTari
    pub pending_outgoing: String,
    /// Time-locked balance in microTari
    pub timelocked: String,
}

/// JavaScript-accessible transaction information
#[napi(object)]
pub struct JsTransactionInfo {
    /// Transaction ID
    pub id: String,
    /// Transaction amount in microTari
    pub amount: String,
    /// Transaction fee in microTari
    pub fee: String,
    /// Transaction status
    pub status: String,
    /// Transaction message
    pub message: String,
    /// Transaction timestamp (Unix timestamp)
    pub timestamp: f64,
    /// Whether this is an inbound transaction
    pub is_inbound: bool,
    /// Source/destination address
    pub address: String,
}

/// JavaScript-accessible wallet handle
#[napi]
pub struct JsWallet {
    // Placeholder for actual Tari wallet instance
    // This will be replaced with Arc<Mutex<TariWallet>> when Tari FFI is integrated
    _config: JsWalletConfig,
    _id: String,
}

#[napi]
impl JsWallet {
    /// Create a new wallet instance
    #[napi(constructor)]
    pub fn new(config: JsWalletConfig) -> Result<Self> {
        ensure_init();
        
        // Validate network type
        match config.network.as_str() {
            "mainnet" | "testnet" | "nextnet" => {},
            _ => return Err(Error::new(
                Status::InvalidArg,
                "Invalid network type. Must be 'mainnet', 'testnet', or 'nextnet'"
            )),
        }

        // Generate unique wallet ID for tracking
        let wallet_id = format!("wallet_{}", uuid::Uuid::new_v4().simple());
        
        info!(
            "Creating wallet instance '{}' for network '{}'",
            wallet_id, config.network
        );

        Ok(Self {
            _config: config,
            _id: wallet_id,
        })
    }

    /// Get wallet balance
    /// 
    /// Note: This is a placeholder implementation for Phase 2.
    /// Actual Tari wallet integration will be implemented in Phase 3.
    #[napi]
    pub async fn get_balance(&self) -> Result<JsBalance> {
        warn!("get_balance called - placeholder implementation");
        
        // Return mock balance data for development
        Ok(JsBalance {
            available: "0".to_string(),
            pending_incoming: "0".to_string(),
            pending_outgoing: "0".to_string(),
            timelocked: "0".to_string(),
        })
    }

    /// Get wallet address
    /// 
    /// Note: This is a placeholder implementation for Phase 2.
    /// Actual Tari wallet integration will be implemented in Phase 3.
    #[napi]
    pub async fn get_address(&self) -> Result<String> {
        warn!("get_address called - placeholder implementation");
        
        // Return mock address for development
        Ok("f2c8d2f94c5808a4d4b3b2e7d8c5b4a3c2e1f9e8d7c6b5a4f3e2d1c0b9a8f7e6".to_string())
    }

    /// Send a transaction
    /// 
    /// Note: This is a placeholder implementation for Phase 2.
    /// Actual Tari wallet integration will be implemented in Phase 3.
    #[napi]
    pub async fn send_transaction(
        &self,
        destination: String,
        amount: String,
        fee_per_gram: Option<String>,
        message: Option<String>,
        is_one_sided: Option<bool>,
    ) -> Result<String> {
        warn!("send_transaction called - placeholder implementation");
        
        // Validate inputs
        if destination.is_empty() {
            return Err(Error::new(
                Status::InvalidArg,
                "Destination address cannot be empty"
            ));
        }

        if amount.is_empty() || amount.parse::<u64>().is_err() {
            return Err(Error::new(
                Status::InvalidArg,
                "Amount must be a valid number"
            ));
        }

        info!(
            "Mock transaction: {} µT to {} (message: {:?})",
            amount,
            destination,
            message.as_deref().unwrap_or("none")
        );

        // Return mock transaction ID
        Ok(format!("tx_{}", uuid::Uuid::new_v4().simple()))
    }

    /// Get transaction history
    /// 
    /// Note: This is a placeholder implementation for Phase 2.
    /// Actual Tari wallet integration will be implemented in Phase 3.
    #[napi]
    pub async fn get_transactions(&self) -> Result<Vec<JsTransactionInfo>> {
        warn!("get_transactions called - placeholder implementation");
        
        // Return empty transaction list for development
        Ok(vec![])
    }

    /// Destroy wallet and cleanup resources
    #[napi]
    pub async fn destroy(&self) -> Result<()> {
        info!("Destroying wallet instance '{}'", self._id);
        
        // Resource cleanup will be implemented when actual Tari FFI is integrated
        Ok(())
    }
}

/// Module initialization function called by Node.js when the module is loaded
#[napi]
pub fn init_tari_wallet_ffi() -> Result<String> {
    ensure_init();
    info!("Tari Wallet FFI module loaded successfully");
    Ok("Tari Wallet FFI v0.0.1".to_string())
}

// Add uuid dependency to Cargo.toml when implementing actual functionality
mod uuid {
    pub struct Uuid;
    
    impl Uuid {
        pub fn new_v4() -> Self {
            Self
        }
        
        pub fn simple(&self) -> String {
            format!("{:016x}", std::ptr::addr_of!(*self) as usize)
        }
    }
}
