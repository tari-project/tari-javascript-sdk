use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, error, warn};

/// Wallet configuration for initialization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletConfig {
    pub network: String,
    pub storage_path: String,
    pub log_level: String,
    pub passphrase: Option<String>,
}

/// Wallet balance information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Balance {
    pub available: u64,
    pub pending_incoming: u64,
    pub pending_outgoing: u64,
    pub timelocked: u64,
}

/// Transaction information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionInfo {
    pub id: String,
    pub direction: String, // "incoming" or "outgoing"
    pub amount: u64,
    pub fee: u64,
    pub status: String,
    pub timestamp: i64,
    pub message: Option<String>,
    pub source_address: Option<String>,
    pub destination_address: Option<String>,
}

/// Wallet status information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletStatus {
    pub is_initialized: bool,
    pub is_connected: bool,
    pub network: Option<String>,
    pub node_peers: u32,
    pub chain_height: u64,
    pub wallet_height: u64,
}

/// Send transaction request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendTransactionRequest {
    pub recipient: String,
    pub amount: u64,
    pub fee_per_gram: Option<u64>,
    pub message: Option<String>,
}

/// Wallet manager handling all wallet operations with real FFI integration
pub struct WalletManager {
    wallet_handle: Arc<RwLock<Option<*mut minotari_wallet_ffi::TariWallet>>>,
    config: Arc<RwLock<Option<WalletConfig>>>,
    is_initialized: Arc<RwLock<bool>>,
}

unsafe impl Send for WalletManager {}
unsafe impl Sync for WalletManager {}

impl WalletManager {
    pub fn new() -> Self {
        Self {
            wallet_handle: Arc::new(RwLock::new(None)),
            config: Arc::new(RwLock::new(None)),
            is_initialized: Arc::new(RwLock::new(false)),
        }
    }

    /// Initialize wallet with real FFI integration
    pub async fn initialize(&self, config: WalletConfig) -> Result<()> {
        info!("Initializing wallet with config: {:?}", config);

        // Validate configuration
        self.validate_config(&config)?;

        // Initialize wallet using real minotari_wallet_ffi
        let wallet_ptr = unsafe {
            let network_str = std::ffi::CString::new(config.network.clone())
                .map_err(|e| AppError::Ffi(format!("Failed to create network string: {}", e)))?;
            
            let storage_path = std::ffi::CString::new(config.storage_path.clone())
                .map_err(|e| AppError::Ffi(format!("Failed to create storage path: {}", e)))?;

            let log_level = std::ffi::CString::new(config.log_level.clone())
                .map_err(|e| AppError::Ffi(format!("Failed to create log level: {}", e)))?;

            // Create wallet using real FFI
            let wallet = minotari_wallet_ffi::wallet_create(
                network_str.as_ptr(),
                storage_path.as_ptr(),
                log_level.as_ptr(),
                std::ptr::null(), // passphrase - TODO: implement secure passphrase handling
                std::ptr::null_mut(), // recovery seed - TODO: implement seed recovery
                std::ptr::null_mut(), // error pointer
            );

            if wallet.is_null() {
                return Err(AppError::Ffi("Failed to create wallet".to_string()));
            }

            wallet
        };

        // Store wallet handle and config
        {
            let mut handle = self.wallet_handle.write().await;
            *handle = Some(wallet_ptr);
        }

        {
            let mut stored_config = self.config.write().await;
            *stored_config = Some(config);
        }

        {
            let mut initialized = self.is_initialized.write().await;
            *initialized = true;
        }

        info!("Wallet initialized successfully");
        Ok(())
    }

    /// Get wallet balance
    pub async fn get_balance(&self) -> Result<Balance> {
        let handle = self.get_wallet_handle().await?;

        let balance = unsafe {
            let mut error_ptr = std::ptr::null_mut();
            let available = minotari_wallet_ffi::wallet_get_available_balance(handle, &mut error_ptr);
            
            if !error_ptr.is_null() {
                let error_msg = std::ffi::CStr::from_ptr(minotari_wallet_ffi::error_get_message(error_ptr))
                    .to_string_lossy()
                    .to_string();
                minotari_wallet_ffi::error_destroy(error_ptr);
                return Err(AppError::Ffi(format!("Failed to get available balance: {}", error_msg)));
            }

            let pending_incoming = minotari_wallet_ffi::wallet_get_pending_inbound_balance(handle, &mut error_ptr);
            if !error_ptr.is_null() {
                let error_msg = std::ffi::CStr::from_ptr(minotari_wallet_ffi::error_get_message(error_ptr))
                    .to_string_lossy()
                    .to_string();
                minotari_wallet_ffi::error_destroy(error_ptr);
                return Err(AppError::Ffi(format!("Failed to get pending incoming balance: {}", error_msg)));
            }

            let pending_outgoing = minotari_wallet_ffi::wallet_get_pending_outbound_balance(handle, &mut error_ptr);
            if !error_ptr.is_null() {
                let error_msg = std::ffi::CStr::from_ptr(minotari_wallet_ffi::error_get_message(error_ptr))
                    .to_string_lossy()
                    .to_string();
                minotari_wallet_ffi::error_destroy(error_ptr);
                return Err(AppError::Ffi(format!("Failed to get pending outgoing balance: {}", error_msg)));
            }

            Balance {
                available,
                pending_incoming,
                pending_outgoing,
                timelocked: 0, // TODO: implement timelocked balance when available in FFI
            }
        };

        Ok(balance)
    }

    /// Get wallet address
    pub async fn get_address(&self) -> Result<String> {
        let handle = self.get_wallet_handle().await?;

        let address = unsafe {
            let mut error_ptr = std::ptr::null_mut();
            let address_ptr = minotari_wallet_ffi::wallet_get_public_key(handle, &mut error_ptr);
            
            if !error_ptr.is_null() {
                let error_msg = std::ffi::CStr::from_ptr(minotari_wallet_ffi::error_get_message(error_ptr))
                    .to_string_lossy()
                    .to_string();
                minotari_wallet_ffi::error_destroy(error_ptr);
                return Err(AppError::Ffi(format!("Failed to get public key: {}", error_msg)));
            }

            if address_ptr.is_null() {
                return Err(AppError::Ffi("Null address returned".to_string()));
            }

            // Convert public key to hex string representation
            let hex_str = minotari_wallet_ffi::public_key_get_bytes_as_hex(address_ptr, &mut error_ptr);
            if !error_ptr.is_null() {
                let error_msg = std::ffi::CStr::from_ptr(minotari_wallet_ffi::error_get_message(error_ptr))
                    .to_string_lossy()
                    .to_string();
                minotari_wallet_ffi::error_destroy(error_ptr);
                return Err(AppError::Ffi(format!("Failed to convert address to hex: {}", error_msg)));
            }

            let address_string = std::ffi::CStr::from_ptr(hex_str)
                .to_string_lossy()
                .to_string();

            // Cleanup FFI resources
            minotari_wallet_ffi::string_destroy(hex_str);
            minotari_wallet_ffi::public_key_destroy(address_ptr);

            address_string
        };

        Ok(address)
    }

    /// Send transaction
    pub async fn send_transaction(&self, request: SendTransactionRequest) -> Result<String> {
        let handle = self.get_wallet_handle().await?;

        // Validate recipient address
        self.validate_address(&request.recipient)?;

        let tx_id = unsafe {
            let mut error_ptr = std::ptr::null_mut();
            
            // Create recipient public key from hex string
            let recipient_cstr = std::ffi::CString::new(request.recipient.clone())
                .map_err(|e| AppError::Validation(format!("Invalid recipient address: {}", e)))?;
            
            let recipient_pubkey = minotari_wallet_ffi::public_key_from_hex(recipient_cstr.as_ptr(), &mut error_ptr);
            if !error_ptr.is_null() {
                let error_msg = std::ffi::CStr::from_ptr(minotari_wallet_ffi::error_get_message(error_ptr))
                    .to_string_lossy()
                    .to_string();
                minotari_wallet_ffi::error_destroy(error_ptr);
                return Err(AppError::Validation(format!("Invalid recipient address: {}", error_msg)));
            }

            // Create message if provided
            let message_ptr = if let Some(ref msg) = request.message {
                let message_cstr = std::ffi::CString::new(msg.clone())
                    .map_err(|e| AppError::Validation(format!("Invalid message: {}", e)))?;
                message_cstr.as_ptr()
            } else {
                std::ptr::null()
            };

            // Send transaction
            let tx_id = minotari_wallet_ffi::wallet_send_transaction(
                handle,
                recipient_pubkey,
                request.amount,
                request.fee_per_gram.unwrap_or(25), // Default fee per gram
                message_ptr,
                &mut error_ptr,
            );

            // Cleanup recipient public key
            minotari_wallet_ffi::public_key_destroy(recipient_pubkey);

            if !error_ptr.is_null() {
                let error_msg = std::ffi::CStr::from_ptr(minotari_wallet_ffi::error_get_message(error_ptr))
                    .to_string_lossy()
                    .to_string();
                minotari_wallet_ffi::error_destroy(error_ptr);
                return Err(AppError::Wallet(format!("Failed to send transaction: {}", error_msg)));
            }

            tx_id
        };

        info!("Transaction sent successfully with ID: {}", tx_id);
        Ok(tx_id.to_string())
    }

    /// Get transaction history
    pub async fn get_transactions(&self) -> Result<Vec<TransactionInfo>> {
        let handle = self.get_wallet_handle().await?;

        let transactions = unsafe {
            let mut error_ptr = std::ptr::null_mut();
            
            // Get completed transactions
            let completed_txs = minotari_wallet_ffi::wallet_get_completed_transactions(handle, &mut error_ptr);
            if !error_ptr.is_null() {
                let error_msg = std::ffi::CStr::from_ptr(minotari_wallet_ffi::error_get_message(error_ptr))
                    .to_string_lossy()
                    .to_string();
                minotari_wallet_ffi::error_destroy(error_ptr);
                return Err(AppError::Ffi(format!("Failed to get completed transactions: {}", error_msg)));
            }

            let mut result = Vec::new();

            // Get count of completed transactions
            let count = minotari_wallet_ffi::completed_transactions_get_length(completed_txs, &mut error_ptr);
            if !error_ptr.is_null() {
                let error_msg = std::ffi::CStr::from_ptr(minotari_wallet_ffi::error_get_message(error_ptr))
                    .to_string_lossy()
                    .to_string();
                minotari_wallet_ffi::error_destroy(error_ptr);
                minotari_wallet_ffi::completed_transactions_destroy(completed_txs);
                return Err(AppError::Ffi(format!("Failed to get transaction count: {}", error_msg)));
            }

            // Process each transaction
            for i in 0..count {
                let tx = minotari_wallet_ffi::completed_transactions_get_at(completed_txs, i, &mut error_ptr);
                if !error_ptr.is_null() {
                    warn!("Failed to get transaction at index {}: skipping", i);
                    minotari_wallet_ffi::error_destroy(error_ptr);
                    error_ptr = std::ptr::null_mut();
                    continue;
                }

                if let Ok(tx_info) = self.convert_ffi_transaction(tx) {
                    result.push(tx_info);
                }

                minotari_wallet_ffi::completed_transaction_destroy(tx);
            }

            // Cleanup
            minotari_wallet_ffi::completed_transactions_destroy(completed_txs);

            result
        };

        Ok(transactions)
    }

    /// Get wallet status
    pub async fn get_status(&self) -> Result<WalletStatus> {
        let is_initialized = *self.is_initialized.read().await;
        
        if !is_initialized {
            return Ok(WalletStatus {
                is_initialized: false,
                is_connected: false,
                network: None,
                node_peers: 0,
                chain_height: 0,
                wallet_height: 0,
            });
        }

        let config = self.config.read().await;
        let network = config.as_ref().map(|c| c.network.clone());

        // TODO: Implement actual connectivity and sync status checks
        Ok(WalletStatus {
            is_initialized,
            is_connected: true, // Placeholder - implement real connectivity check
            network,
            node_peers: 0, // Placeholder - implement real peer count
            chain_height: 0, // Placeholder - implement real chain height
            wallet_height: 0, // Placeholder - implement real wallet height
        })
    }

    /// Validate address format
    pub fn validate_address(&self, address: &str) -> Result<bool> {
        if address.is_empty() {
            return Err(AppError::Validation("Address cannot be empty".to_string()));
        }

        // Basic hex validation - should be 64 characters for public key
        if address.len() != 64 {
            return Err(AppError::Validation("Address must be 64 characters long".to_string()));
        }

        // Check if it's valid hex
        if !address.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(AppError::Validation("Address must be valid hexadecimal".to_string()));
        }

        Ok(true)
    }

    /// Destroy wallet and cleanup resources
    pub async fn destroy(&self) -> Result<()> {
        let mut handle = self.wallet_handle.write().await;
        
        if let Some(wallet_ptr) = handle.take() {
            unsafe {
                minotari_wallet_ffi::wallet_destroy(wallet_ptr);
            }
            info!("Wallet destroyed successfully");
        }

        {
            let mut config = self.config.write().await;
            *config = None;
        }

        {
            let mut initialized = self.is_initialized.write().await;
            *initialized = false;
        }

        Ok(())
    }

    /// Get wallet handle, ensuring wallet is initialized
    async fn get_wallet_handle(&self) -> Result<*mut minotari_wallet_ffi::TariWallet> {
        let handle = self.wallet_handle.read().await;
        handle.ok_or_else(|| AppError::Wallet("Wallet not initialized".to_string()))
    }

    /// Validate wallet configuration
    fn validate_config(&self, config: &WalletConfig) -> Result<()> {
        if config.network.is_empty() {
            return Err(AppError::Validation("Network cannot be empty".to_string()));
        }

        if config.storage_path.is_empty() {
            return Err(AppError::Validation("Storage path cannot be empty".to_string()));
        }

        if !["testnet", "mainnet", "localnet"].contains(&config.network.as_str()) {
            return Err(AppError::Validation("Invalid network. Must be testnet, mainnet, or localnet".to_string()));
        }

        Ok(())
    }

    /// Convert FFI transaction to our TransactionInfo structure
    unsafe fn convert_ffi_transaction(&self, tx: *mut minotari_wallet_ffi::TariCompletedTransaction) -> Result<TransactionInfo> {
        let mut error_ptr = std::ptr::null_mut();

        let tx_id = minotari_wallet_ffi::completed_transaction_get_transaction_id(tx, &mut error_ptr);
        if !error_ptr.is_null() {
            minotari_wallet_ffi::error_destroy(error_ptr);
            return Err(AppError::Ffi("Failed to get transaction ID".to_string()));
        }

        let amount = minotari_wallet_ffi::completed_transaction_get_amount(tx, &mut error_ptr);
        if !error_ptr.is_null() {
            minotari_wallet_ffi::error_destroy(error_ptr);
            return Err(AppError::Ffi("Failed to get transaction amount".to_string()));
        }

        let fee = minotari_wallet_ffi::completed_transaction_get_fee(tx, &mut error_ptr);
        if !error_ptr.is_null() {
            minotari_wallet_ffi::error_destroy(error_ptr);
            return Err(AppError::Ffi("Failed to get transaction fee".to_string()));
        }

        let timestamp = minotari_wallet_ffi::completed_transaction_get_timestamp(tx, &mut error_ptr);
        if !error_ptr.is_null() {
            minotari_wallet_ffi::error_destroy(error_ptr);
            return Err(AppError::Ffi("Failed to get transaction timestamp".to_string()));
        }

        let direction = if minotari_wallet_ffi::completed_transaction_is_outbound(tx) {
            "outgoing"
        } else {
            "incoming"
        };

        Ok(TransactionInfo {
            id: tx_id.to_string(),
            direction: direction.to_string(),
            amount,
            fee,
            status: "completed".to_string(), // All from completed_transactions are completed
            timestamp: timestamp as i64,
            message: None, // TODO: Extract message when available in FFI
            source_address: None, // TODO: Extract when available
            destination_address: None, // TODO: Extract when available
        })
    }
}

impl Drop for WalletManager {
    fn drop(&mut self) {
        // Cleanup will be handled by the destroy method when called explicitly
        // The FFI wallet should be properly destroyed before dropping
    }
}
