use crate::error::{ApiResponse, AppError, Result};
use crate::wallet::{WalletConfig, Balance, TransactionInfo, WalletStatus, SendTransactionRequest};
use crate::storage::{StorageMetadata, StorageInfo};
use crate::{AppState, WalletManager, SecureStorage};
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{info, error};

/// Platform information
#[derive(Debug, Serialize, Deserialize)]
pub struct PlatformInfo {
    pub platform: String,
    pub arch: String,
    pub version: String,
    pub tauri_version: String,
}

// ============================================================================
// Wallet Commands
// ============================================================================

#[tauri::command]
pub async fn wallet_initialize(
    config: WalletConfig,
    state: State<'_, AppState>,
) -> Result<ApiResponse<()>, String> {
    info!("Initializing wallet with network: {}", config.network);
    
    let result = {
        let wallet_manager = state.wallet_manager.lock()
            .map_err(|e| AppError::Generic(format!("Failed to acquire wallet lock: {}", e)))?;
        wallet_manager.initialize(config).await
    };

    Ok(result.into())
}

#[tauri::command]
pub async fn wallet_get_balance(
    state: State<'_, AppState>,
) -> Result<ApiResponse<Balance>, String> {
    let result = {
        let wallet_manager = state.wallet_manager.lock()
            .map_err(|e| AppError::Generic(format!("Failed to acquire wallet lock: {}", e)))?;
        wallet_manager.get_balance().await
    };

    Ok(result.into())
}

#[tauri::command]
pub async fn wallet_get_address(
    state: State<'_, AppState>,
) -> Result<ApiResponse<String>, String> {
    let result = {
        let wallet_manager = state.wallet_manager.lock()
            .map_err(|e| AppError::Generic(format!("Failed to acquire wallet lock: {}", e)))?;
        wallet_manager.get_address().await
    };

    Ok(result.into())
}

#[tauri::command]
pub async fn wallet_send_transaction(
    request: SendTransactionRequest,
    state: State<'_, AppState>,
) -> Result<ApiResponse<String>, String> {
    info!("Sending transaction to: {}, amount: {}", request.recipient, request.amount);
    
    let result = {
        let wallet_manager = state.wallet_manager.lock()
            .map_err(|e| AppError::Generic(format!("Failed to acquire wallet lock: {}", e)))?;
        wallet_manager.send_transaction(request).await
    };

    Ok(result.into())
}

#[tauri::command]
pub async fn wallet_get_transactions(
    state: State<'_, AppState>,
) -> Result<ApiResponse<Vec<TransactionInfo>>, String> {
    let result = {
        let wallet_manager = state.wallet_manager.lock()
            .map_err(|e| AppError::Generic(format!("Failed to acquire wallet lock: {}", e)))?;
        wallet_manager.get_transactions().await
    };

    Ok(result.into())
}

#[tauri::command]
pub async fn wallet_get_status(
    state: State<'_, AppState>,
) -> Result<ApiResponse<WalletStatus>, String> {
    let result = {
        let wallet_manager = state.wallet_manager.lock()
            .map_err(|e| AppError::Generic(format!("Failed to acquire wallet lock: {}", e)))?;
        wallet_manager.get_status().await
    };

    Ok(result.into())
}

#[tauri::command]
pub async fn wallet_destroy(
    state: State<'_, AppState>,
) -> Result<ApiResponse<()>, String> {
    info!("Destroying wallet");
    
    let result = {
        let wallet_manager = state.wallet_manager.lock()
            .map_err(|e| AppError::Generic(format!("Failed to acquire wallet lock: {}", e)))?;
        wallet_manager.destroy().await
    };

    Ok(result.into())
}

#[tauri::command]
pub async fn validate_address(
    address: String,
    state: State<'_, AppState>,
) -> Result<ApiResponse<bool>, String> {
    let result = {
        let wallet_manager = state.wallet_manager.lock()
            .map_err(|e| AppError::Generic(format!("Failed to acquire wallet lock: {}", e)))?;
        wallet_manager.validate_address(&address)
    };

    Ok(result.into())
}

// ============================================================================
// Storage Commands
// ============================================================================

#[tauri::command]
pub async fn secure_storage_store(
    key: String,
    value: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<ApiResponse<()>, String> {
    let result = {
        let storage = state.secure_storage.lock()
            .map_err(|e| AppError::Generic(format!("Failed to acquire storage lock: {}", e)))?;
        storage.store(&key, &value).await
    };

    Ok(result.into())
}

#[tauri::command]
pub async fn secure_storage_retrieve(
    key: String,
    state: State<'_, AppState>,
) -> Result<ApiResponse<Vec<u8>>, String> {
    let result = {
        let storage = state.secure_storage.lock()
            .map_err(|e| AppError::Generic(format!("Failed to acquire storage lock: {}", e)))?;
        storage.retrieve(&key).await
    };

    Ok(result.into())
}

#[tauri::command]
pub async fn secure_storage_remove(
    key: String,
    state: State<'_, AppState>,
) -> Result<ApiResponse<()>, String> {
    let result = {
        let storage = state.secure_storage.lock()
            .map_err(|e| AppError::Generic(format!("Failed to acquire storage lock: {}", e)))?;
        storage.remove(&key).await
    };

    Ok(result.into())
}

#[tauri::command]
pub async fn secure_storage_exists(
    key: String,
    state: State<'_, AppState>,
) -> Result<ApiResponse<bool>, String> {
    let result = {
        let storage = state.secure_storage.lock()
            .map_err(|e| AppError::Generic(format!("Failed to acquire storage lock: {}", e)))?;
        storage.exists(&key).await
    };

    Ok(result.into())
}

#[tauri::command]
pub async fn secure_storage_list(
    state: State<'_, AppState>,
) -> Result<ApiResponse<Vec<String>>, String> {
    let result = {
        let storage = state.secure_storage.lock()
            .map_err(|e| AppError::Generic(format!("Failed to acquire storage lock: {}", e)))?;
        storage.list().await
    };

    Ok(result.into())
}

#[tauri::command]
pub async fn secure_storage_get_metadata(
    key: String,
    state: State<'_, AppState>,
) -> Result<ApiResponse<StorageMetadata>, String> {
    let result = {
        let storage = state.secure_storage.lock()
            .map_err(|e| AppError::Generic(format!("Failed to acquire storage lock: {}", e)))?;
        storage.get_metadata(&key).await
    };

    Ok(result.into())
}

#[tauri::command]
pub async fn secure_storage_clear(
    state: State<'_, AppState>,
) -> Result<ApiResponse<()>, String> {
    info!("Clearing all secure storage data");
    
    let result = {
        let storage = state.secure_storage.lock()
            .map_err(|e| AppError::Generic(format!("Failed to acquire storage lock: {}", e)))?;
        storage.clear().await
    };

    Ok(result.into())
}

#[tauri::command]
pub async fn secure_storage_get_info(
    state: State<'_, AppState>,
) -> Result<ApiResponse<StorageInfo>, String> {
    let result = {
        let storage = state.secure_storage.lock()
            .map_err(|e| AppError::Generic(format!("Failed to acquire storage lock: {}", e)))?;
        storage.get_info().await
    };

    Ok(result.into())
}

#[tauri::command]
pub async fn secure_storage_test(
    state: State<'_, AppState>,
) -> Result<ApiResponse<()>, String> {
    let result = {
        let storage = state.secure_storage.lock()
            .map_err(|e| AppError::Generic(format!("Failed to acquire storage lock: {}", e)))?;
        storage.test().await
    };

    Ok(result.into())
}

// ============================================================================
// Platform Commands  
// ============================================================================

#[tauri::command]
pub async fn get_platform_info() -> Result<ApiResponse<PlatformInfo>, String> {
    let platform_info = PlatformInfo {
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        tauri_version: "1.5".to_string(), // TODO: Get actual Tauri version
    };

    Ok(ApiResponse::success(platform_info))
}
