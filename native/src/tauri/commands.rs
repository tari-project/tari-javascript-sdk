/**
 * Tauri commands for secure storage operations
 * 
 * Provides type-safe Tauri commands with explicit permission controls
 * and comprehensive error handling for wallet security operations.
 */

use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use tauri::State;

use super::storage::{TauriSecureStorage, StorageResult, StorageMetadata, StorageInfo};

/// Global storage instance (thread-safe)
static STORAGE: OnceLock<TauriSecureStorage> = OnceLock::new();

/// Get or initialize the global storage instance
fn get_storage() -> &'static TauriSecureStorage {
    STORAGE.get_or_init(|| TauriSecureStorage::new())
}

/// Storage operation command structure
#[derive(Debug, Deserialize)]
pub struct StorageCommand {
    pub operation: String,
    pub key: Option<String>,
    pub value: Option<Vec<u8>>,
    pub options: Option<serde_json::Value>,
}

/// Unified storage response
#[derive(Debug, Serialize)]
pub struct StorageResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
    pub timestamp: i64,
}

impl<T> From<StorageResult<T>> for StorageResponse<T> {
    fn from(result: StorageResult<T>) -> Self {
        Self {
            success: result.success,
            data: result.data,
            error: result.error,
            timestamp: chrono::Utc::now().timestamp_millis(),
        }
    }
}

/// Store data securely
#[tauri::command]
pub async fn secure_storage_store(
    key: String,
    value: Vec<u8>,
) -> Result<StorageResponse<()>, String> {
    let storage = get_storage();
    let result = storage.store(&key, &value).await;
    Ok(result.into())
}

/// Retrieve data securely
#[tauri::command]
pub async fn secure_storage_retrieve(
    key: String,
) -> Result<StorageResponse<Vec<u8>>, String> {
    let storage = get_storage();
    let result = storage.retrieve(&key).await;
    Ok(result.into())
}

/// Remove data securely
#[tauri::command]
pub async fn secure_storage_remove(
    key: String,
) -> Result<StorageResponse<()>, String> {
    let storage = get_storage();
    let result = storage.remove(&key).await;
    Ok(result.into())
}

/// Check if key exists
#[tauri::command]
pub async fn secure_storage_exists(
    key: String,
) -> Result<StorageResponse<bool>, String> {
    let storage = get_storage();
    let result = storage.exists(&key).await;
    Ok(result.into())
}

/// List all keys
#[tauri::command]
pub async fn secure_storage_list() -> Result<StorageResponse<Vec<String>>, String> {
    let storage = get_storage();
    let result = storage.list().await;
    Ok(result.into())
}

/// Get metadata for a key
#[tauri::command]
pub async fn secure_storage_get_metadata(
    key: String,
) -> Result<StorageResponse<StorageMetadata>, String> {
    let storage = get_storage();
    let result = storage.get_metadata(&key).await;
    Ok(result.into())
}

/// Clear all data
#[tauri::command]
pub async fn secure_storage_clear() -> Result<StorageResponse<()>, String> {
    let storage = get_storage();
    let result = storage.clear().await;
    Ok(result.into())
}

/// Get storage information
#[tauri::command]
pub async fn secure_storage_get_info() -> Result<StorageResponse<StorageInfo>, String> {
    let storage = get_storage();
    let result = storage.get_info().await;
    Ok(result.into())
}

/// Test storage functionality
#[tauri::command]
pub async fn secure_storage_test() -> Result<StorageResponse<()>, String> {
    let storage = get_storage();
    let result = storage.test().await;
    Ok(result.into())
}

/// Unified storage command handler
#[tauri::command]
pub async fn secure_storage_command(
    command: StorageCommand,
) -> Result<StorageResponse<serde_json::Value>, String> {
    let storage = get_storage();
    
    match command.operation.as_str() {
        "store" => {
            let key = command.key.ok_or("Key required for store operation")?;
            let value = command.value.ok_or("Value required for store operation")?;
            
            let result = storage.store(&key, &value).await;
            Ok(StorageResponse {
                success: result.success,
                data: result.data.map(|_| serde_json::Value::Null),
                error: result.error,
                timestamp: chrono::Utc::now().timestamp_millis(),
            })
        },
        
        "retrieve" => {
            let key = command.key.ok_or("Key required for retrieve operation")?;
            
            let result = storage.retrieve(&key).await;
            Ok(StorageResponse {
                success: result.success,
                data: result.data.map(|data| serde_json::Value::Array(
                    data.into_iter().map(|b| serde_json::Value::Number(b.into())).collect()
                )),
                error: result.error,
                timestamp: chrono::Utc::now().timestamp_millis(),
            })
        },
        
        "remove" => {
            let key = command.key.ok_or("Key required for remove operation")?;
            
            let result = storage.remove(&key).await;
            Ok(StorageResponse {
                success: result.success,
                data: result.data.map(|_| serde_json::Value::Null),
                error: result.error,
                timestamp: chrono::Utc::now().timestamp_millis(),
            })
        },
        
        "exists" => {
            let key = command.key.ok_or("Key required for exists operation")?;
            
            let result = storage.exists(&key).await;
            Ok(StorageResponse {
                success: result.success,
                data: result.data.map(|exists| serde_json::Value::Bool(exists)),
                error: result.error,
                timestamp: chrono::Utc::now().timestamp_millis(),
            })
        },
        
        "list" => {
            let result = storage.list().await;
            Ok(StorageResponse {
                success: result.success,
                data: result.data.map(|keys| serde_json::Value::Array(
                    keys.into_iter().map(serde_json::Value::String).collect()
                )),
                error: result.error,
                timestamp: chrono::Utc::now().timestamp_millis(),
            })
        },
        
        "clear" => {
            let result = storage.clear().await;
            Ok(StorageResponse {
                success: result.success,
                data: result.data.map(|_| serde_json::Value::Null),
                error: result.error,
                timestamp: chrono::Utc::now().timestamp_millis(),
            })
        },
        
        "get_info" => {
            let result = storage.get_info().await;
            Ok(StorageResponse {
                success: result.success,
                data: result.data.and_then(|info| serde_json::to_value(info).ok()),
                error: result.error,
                timestamp: chrono::Utc::now().timestamp_millis(),
            })
        },
        
        "test" => {
            let result = storage.test().await;
            Ok(StorageResponse {
                success: result.success,
                data: result.data.map(|_| serde_json::Value::Null),
                error: result.error,
                timestamp: chrono::Utc::now().timestamp_millis(),
            })
        },
        
        _ => Err(format!("Unknown operation: {}", command.operation)),
    }
}

/// Platform information command
#[tauri::command]
pub async fn get_platform_info() -> Result<serde_json::Value, String> {
    let info = serde_json::json!({
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "family": std::env::consts::FAMILY,
        "tauri_version": env!("CARGO_PKG_VERSION"),
        "secure_storage_available": true,
    });
    
    Ok(info)
}

/// Register all Tauri commands
pub fn register_commands<R: tauri::Runtime>() -> impl Fn(tauri::Builder<R>) -> tauri::Builder<R> {
    |builder| {
        builder.invoke_handler(tauri::generate_handler![
            secure_storage_store,
            secure_storage_retrieve,
            secure_storage_remove,
            secure_storage_exists,
            secure_storage_list,
            secure_storage_get_metadata,
            secure_storage_clear,
            secure_storage_get_info,
            secure_storage_test,
            secure_storage_command,
            get_platform_info
        ])
    }
}

/// Tauri plugin builder for easy integration
pub fn tauri_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("secure-storage")
        .invoke_handler(tauri::generate_handler![
            secure_storage_store,
            secure_storage_retrieve,
            secure_storage_remove,
            secure_storage_exists,
            secure_storage_list,
            secure_storage_get_metadata,
            secure_storage_clear,
            secure_storage_get_info,
            secure_storage_test,
            secure_storage_command,
            get_platform_info
        ])
        .build()
}
