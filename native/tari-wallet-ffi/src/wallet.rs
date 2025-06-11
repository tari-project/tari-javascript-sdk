/**
 * Core wallet FFI implementation using NAPI-RS
 * Provides JavaScript bindings for Tari wallet functionality
 */

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::RwLock;

use crate::error::{TariResult, TariWalletError};
use crate::types::*;

/// Global wallet storage - maps handles to wallet instances
type WalletStorage = Arc<RwLock<HashMap<WalletHandle, Arc<Mutex<WalletInstance>>>>>;

static mut WALLET_STORAGE: Option<WalletStorage> = None;
static mut NEXT_HANDLE: WalletHandle = 1;

/// Internal wallet instance structure
/// This will be replaced with actual Tari wallet in Phase 3 integration
struct WalletInstance {
    handle: WalletHandle,
    config: JsWalletConfig,
    initialized: bool,
    destroyed: bool,
}

impl WalletInstance {
    fn new(handle: WalletHandle, config: JsWalletConfig) -> Self {
        Self {
            handle,
            config,
            initialized: false,
            destroyed: false,
        }
    }

    fn ensure_not_destroyed(&self) -> TariResult<()> {
        if self.destroyed {
            return Err(TariWalletError::FFIError(
                "Wallet handle has been destroyed".to_string(),
            ));
        }
        Ok(())
    }
}

/// Initialize the wallet storage system
fn ensure_storage_initialized() -> &'static WalletStorage {
    unsafe {
        if WALLET_STORAGE.is_none() {
            WALLET_STORAGE = Some(Arc::new(RwLock::new(HashMap::new())));
        }
        WALLET_STORAGE.as_ref().unwrap()
    }
}

/// Generate next wallet handle
fn generate_handle() -> WalletHandle {
    unsafe {
        let handle = NEXT_HANDLE;
        NEXT_HANDLE += 1;
        handle
    }
}

/// Create a new wallet instance
#[napi]
pub async fn wallet_create(config: JsWalletConfig) -> Result<WalletHandle> {
    // Validate configuration
    config.validate()?;

    let handle = generate_handle();
    let storage = ensure_storage_initialized();

    // Create wallet instance
    let wallet = WalletInstance::new(handle, config);
    let wallet_arc = Arc::new(Mutex::new(wallet));

    // Store in global storage
    {
        let mut storage_lock = storage.write().await;
        storage_lock.insert(handle, wallet_arc.clone());
    }

    // Initialize wallet (placeholder for actual Tari wallet creation)
    {
        let mut wallet_lock = wallet_arc.lock().map_err(|e| {
            napi::Error::new(
                Status::GenericFailure,
                format!("Failed to acquire wallet lock: {}", e),
            )
        })?;
        wallet_lock.initialized = true;
    }

    Ok(handle)
}

/// Destroy a wallet instance and clean up resources
#[napi]
pub async fn wallet_destroy(handle: WalletHandle) -> Result<()> {
    let storage = ensure_storage_initialized();

    // Remove from storage
    let wallet_arc = {
        let mut storage_lock = storage.write().await;
        storage_lock.remove(&handle)
    };

    if let Some(wallet_arc) = wallet_arc {
        // Mark as destroyed
        let mut wallet_lock = wallet_arc.lock().map_err(|e| {
            napi::Error::new(
                Status::GenericFailure,
                format!("Failed to acquire wallet lock: {}", e),
            )
        })?;

        wallet_lock.destroyed = true;
        wallet_lock.initialized = false;

        // Cleanup would happen here in real implementation
        Ok(())
    } else {
        Err(napi::Error::new(
            Status::InvalidArg,
            format!("Invalid wallet handle: {}", handle),
        ))
    }
}

/// Get wallet balance
#[napi]
pub async fn wallet_get_balance(handle: WalletHandle) -> Result<JsBalance> {
    let storage = ensure_storage_initialized();
    let storage_lock = storage.read().await;

    if let Some(wallet_arc) = storage_lock.get(&handle) {
        let wallet_lock = wallet_arc.lock().map_err(|e| {
            napi::Error::new(
                Status::GenericFailure,
                format!("Failed to acquire wallet lock: {}", e),
            )
        })?;

        wallet_lock.ensure_not_destroyed()?;

        // Placeholder implementation - would call actual Tari wallet
        Ok(JsBalance {
            available: "1000000".to_string(), // 1 Tari in µT
            pending_incoming: "0".to_string(),
            pending_outgoing: "0".to_string(),
            timelocked: "0".to_string(),
        })
    } else {
        Err(napi::Error::new(
            Status::InvalidArg,
            format!("Invalid wallet handle: {}", handle),
        ))
    }
}

/// Get wallet address
#[napi]
pub async fn wallet_get_address(handle: WalletHandle) -> Result<String> {
    let storage = ensure_storage_initialized();
    let storage_lock = storage.read().await;

    if let Some(wallet_arc) = storage_lock.get(&handle) {
        let wallet_lock = wallet_arc.lock().map_err(|e| {
            napi::Error::new(
                Status::GenericFailure,
                format!("Failed to acquire wallet lock: {}", e),
            )
        })?;

        wallet_lock.ensure_not_destroyed()?;

        // Placeholder implementation - would call actual Tari wallet
        Ok("tari://testnet/placeholder_address".to_string())
    } else {
        Err(napi::Error::new(
            Status::InvalidArg,
            format!("Invalid wallet handle: {}", handle),
        ))
    }
}

/// Send a transaction
#[napi]
pub async fn wallet_send_transaction(
    handle: WalletHandle,
    recipient_address: String,
    amount: String,
    _options: Option<JsSendTransactionOptions>,
) -> Result<String> {
    let storage = ensure_storage_initialized();
    let storage_lock = storage.read().await;

    if let Some(wallet_arc) = storage_lock.get(&handle) {
        let wallet_lock = wallet_arc.lock().map_err(|e| {
            napi::Error::new(
                Status::GenericFailure,
                format!("Failed to acquire wallet lock: {}", e),
            )
        })?;

        wallet_lock.ensure_not_destroyed()?;

        // Validate inputs
        if recipient_address.is_empty() {
            return Err(TariWalletError::InvalidAddress(
                "Recipient address cannot be empty".to_string(),
            )
            .into());
        }

        if amount.is_empty() || amount == "0" {
            return Err(TariWalletError::ValidationError(
                "Amount must be greater than zero".to_string(),
            )
            .into());
        }

        // Placeholder implementation - would call actual Tari wallet
        let transaction_id = format!("tx_{}", generate_handle());
        Ok(transaction_id)
    } else {
        Err(napi::Error::new(
            Status::InvalidArg,
            format!("Invalid wallet handle: {}", handle),
        ))
    }
}

/// Get wallet seed words
#[napi]
pub async fn wallet_get_seed_words(handle: WalletHandle) -> Result<Vec<String>> {
    let storage = ensure_storage_initialized();
    let storage_lock = storage.read().await;

    if let Some(wallet_arc) = storage_lock.get(&handle) {
        let wallet_lock = wallet_arc.lock().map_err(|e| {
            napi::Error::new(
                Status::GenericFailure,
                format!("Failed to acquire wallet lock: {}", e),
            )
        })?;

        wallet_lock.ensure_not_destroyed()?;

        // Placeholder implementation - would return actual seed words
        Ok(vec![
            "abandon".to_string(),
            "ability".to_string(),
            "able".to_string(),
            "about".to_string(),
            "above".to_string(),
            "absent".to_string(),
            "absorb".to_string(),
            "abstract".to_string(),
            "absurd".to_string(),
            "abuse".to_string(),
            "access".to_string(),
            "accident".to_string(),
            "account".to_string(),
            "accuse".to_string(),
            "achieve".to_string(),
            "acid".to_string(),
            "acoustic".to_string(),
            "acquire".to_string(),
            "across".to_string(),
            "act".to_string(),
            "action".to_string(),
            "actor".to_string(),
            "actress".to_string(),
            "actual".to_string(),
        ])
    } else {
        Err(napi::Error::new(
            Status::InvalidArg,
            format!("Invalid wallet handle: {}", handle),
        ))
    }
}

/// Set base node peer for the wallet
#[napi]
pub async fn wallet_set_base_node(
    handle: WalletHandle,
    base_node: JsBaseNodePeer,
) -> Result<()> {
    let storage = ensure_storage_initialized();
    let storage_lock = storage.read().await;

    if let Some(wallet_arc) = storage_lock.get(&handle) {
        let wallet_lock = wallet_arc.lock().map_err(|e| {
            napi::Error::new(
                Status::GenericFailure,
                format!("Failed to acquire wallet lock: {}", e),
            )
        })?;

        wallet_lock.ensure_not_destroyed()?;

        // Validate base node info
        if base_node.public_key.is_empty() {
            return Err(TariWalletError::ValidationError(
                "Base node public key cannot be empty".to_string(),
            )
            .into());
        }

        if base_node.address.is_empty() {
            return Err(TariWalletError::ValidationError(
                "Base node address cannot be empty".to_string(),
            )
            .into());
        }

        // Placeholder implementation - would configure actual base node
        Ok(())
    } else {
        Err(napi::Error::new(
            Status::InvalidArg,
            format!("Invalid wallet handle: {}", handle),
        ))
    }
}

/// Get number of active wallet handles (for debugging)
#[napi]
pub async fn wallet_get_active_handle_count() -> Result<i32> {
    let storage = ensure_storage_initialized();
    let storage_lock = storage.read().await;
    Ok(storage_lock.len() as i32)
}

/// Validate a wallet handle without accessing the wallet
#[napi]
pub async fn wallet_validate_handle(handle: WalletHandle) -> Result<bool> {
    let storage = ensure_storage_initialized();
    let storage_lock = storage.read().await;

    if let Some(wallet_arc) = storage_lock.get(&handle) {
        let wallet_lock = wallet_arc.lock().map_err(|e| {
            napi::Error::new(
                Status::GenericFailure,
                format!("Failed to acquire wallet lock: {}", e),
            )
        })?;

        Ok(!wallet_lock.destroyed && wallet_lock.initialized)
    } else {
        Ok(false)
    }
}

/// Cleanup all wallet handles (for testing and shutdown)
#[napi]
pub async fn wallet_cleanup_all() -> Result<i32> {
    let storage = ensure_storage_initialized();
    let mut storage_lock = storage.write().await;

    let count = storage_lock.len() as i32;

    // Mark all wallets as destroyed
    for (_, wallet_arc) in storage_lock.iter() {
        if let Ok(mut wallet_lock) = wallet_arc.lock() {
            wallet_lock.destroyed = true;
            wallet_lock.initialized = false;
        }
    }

    // Clear storage
    storage_lock.clear();

    Ok(count)
}
