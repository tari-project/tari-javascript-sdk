/**
 * NAPI-RS type definitions for Tari wallet FFI
 * These types mirror the Tari wallet structures and provide JavaScript bindings
 */

use napi::bindgen_prelude::*;
use napi_derive::napi;

/// Wallet configuration for creating or restoring wallets
#[napi(object)]
pub struct JsWalletConfig {
    pub network: String,
    pub storage_path: String,
    pub log_path: Option<String>,
    pub log_level: Option<i32>,
    pub passphrase: Option<String>,
    pub seed_words: Option<Vec<String>>,
    pub num_rolling_log_files: Option<u32>,
    pub rolling_log_file_size: Option<u32>,
}

/// Balance information with all wallet balance components
#[napi(object)]
pub struct JsBalance {
    pub available: String, // Using string for bigint compatibility
    pub pending_incoming: String,
    pub pending_outgoing: String,
    pub timelocked: String,
}

/// Transaction information structure
#[napi(object)]
pub struct JsTransactionInfo {
    pub id: String, // Transaction ID as string
    pub amount: String,
    pub fee: String,
    pub status: i32, // Transaction status enum value
    pub message: String,
    pub timestamp: f64, // Unix timestamp
    pub is_inbound: bool,
    pub address: String, // Tari address as string
}

/// Contact information
#[napi(object)]
pub struct JsContact {
    pub alias: String,
    pub address: String,
    pub is_favorite: bool,
    pub last_seen: Option<f64>, // Unix timestamp
}

/// UTXO information
#[napi(object)]
pub struct JsUtxoInfo {
    pub amount: String,
    pub commitment: String,
    pub features: i32, // Output features enum
    pub maturity: String, // Using string for u64 compatibility
    pub status: i32, // UTXO status enum
}

/// Transaction sending options
#[napi(object)]
pub struct JsSendTransactionOptions {
    pub fee_per_gram: Option<String>,
    pub message: Option<String>,
    pub is_one_sided: Option<bool>,
}

/// Base node peer information
#[napi(object)]
pub struct JsBaseNodePeer {
    pub public_key: String,
    pub address: String,
}

/// Seed words structure for wallet recovery
#[napi(object)]
pub struct JsSeedWords {
    pub words: Vec<String>,
}

/// Network connectivity status
#[napi]
pub enum JsConnectivityStatus {
    Offline = 0,
    Connecting = 1,
    Online = 2,
}

/// Transaction status enumeration
#[napi]
pub enum JsTransactionStatus {
    Pending = 0,
    Broadcast = 1,
    MinedUnconfirmed = 2,
    Imported = 3,
    MinedConfirmed = 4,
    Rejected = 5,
    Cancelled = 6,
    Coinbase = 7,
}

/// Log level enumeration
#[napi]
pub enum JsLogLevel {
    Off = 0,
    Error = 1,
    Warn = 2,
    Info = 3,
    Debug = 4,
    Trace = 5,
}

/// Wallet handle type - opaque handle for wallet instances
pub type WalletHandle = i64;

impl JsWalletConfig {
    /// Convert from NAPI object to internal configuration
    pub fn validate(&self) -> Result<()> {
        if self.network.is_empty() {
            return Err(Error::new(
                Status::InvalidArg,
                "Network type is required".to_string(),
            ));
        }

        if self.storage_path.is_empty() {
            return Err(Error::new(
                Status::InvalidArg,
                "Storage path is required".to_string(),
            ));
        }

        // Validate network type
        match self.network.as_str() {
            "mainnet" | "testnet" | "nextnet" => {}
            _ => {
                return Err(Error::new(
                    Status::InvalidArg,
                    format!("Invalid network type: {}", self.network),
                ));
            }
        }

        // Validate log level if provided
        if let Some(level) = self.log_level {
            if !(0..=5).contains(&level) {
                return Err(Error::new(
                    Status::InvalidArg,
                    "Log level must be between 0 and 5".to_string(),
                ));
            }
        }

        // Validate seed words if provided
        if let Some(ref words) = self.seed_words {
            if words.len() != 24 {
                return Err(Error::new(
                    Status::InvalidArg,
                    "Seed words must contain exactly 24 words".to_string(),
                ));
            }
        }

        Ok(())
    }
}

impl JsBalance {
    /// Create a new balance with zero values
    pub fn zero() -> Self {
        Self {
            available: "0".to_string(),
            pending_incoming: "0".to_string(),
            pending_outgoing: "0".to_string(),
            timelocked: "0".to_string(),
        }
    }

    /// Calculate total balance (available + pending_incoming - pending_outgoing)
    pub fn total(&self) -> Result<String> {
        // In a real implementation, this would do proper bigint arithmetic
        // For now, return available as placeholder
        Ok(self.available.clone())
    }
}

impl From<i32> for JsConnectivityStatus {
    fn from(value: i32) -> Self {
        match value {
            0 => JsConnectivityStatus::Offline,
            1 => JsConnectivityStatus::Connecting,
            2 => JsConnectivityStatus::Online,
            _ => JsConnectivityStatus::Offline,
        }
    }
}

impl From<i32> for JsTransactionStatus {
    fn from(value: i32) -> Self {
        match value {
            0 => JsTransactionStatus::Pending,
            1 => JsTransactionStatus::Broadcast,
            2 => JsTransactionStatus::MinedUnconfirmed,
            3 => JsTransactionStatus::Imported,
            4 => JsTransactionStatus::MinedConfirmed,
            5 => JsTransactionStatus::Rejected,
            6 => JsTransactionStatus::Cancelled,
            7 => JsTransactionStatus::Coinbase,
            _ => JsTransactionStatus::Pending,
        }
    }
}

impl From<i32> for JsLogLevel {
    fn from(value: i32) -> Self {
        match value {
            0 => JsLogLevel::Off,
            1 => JsLogLevel::Error,
            2 => JsLogLevel::Warn,
            3 => JsLogLevel::Info,
            4 => JsLogLevel::Debug,
            5 => JsLogLevel::Trace,
            _ => JsLogLevel::Info,
        }
    }
}
