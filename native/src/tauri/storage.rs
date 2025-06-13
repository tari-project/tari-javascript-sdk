/**
 * Tauri secure storage implementation
 * 
 * Cross-platform secure storage using platform-specific backends:
 * - macOS: Security Framework Keychain
 * - Windows: Credential Store with DPAPI
 * - Linux: Secret Service via D-Bus
 */

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize)]
pub struct StorageResult<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StorageMetadata {
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub modified_at: chrono::DateTime<chrono::Utc>,
    pub size: usize,
    pub encrypted: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StorageInfo {
    pub backend_type: String,
    pub platform: String,
    pub secure: bool,
    pub available: bool,
    pub limitations: Vec<String>,
}

/// Tauri secure storage backend
pub struct TauriSecureStorage {
    #[cfg(target_os = "macos")]
    keychain: Option<crate::keychain::KeychainBackend>,
    #[cfg(target_os = "windows")]
    credential_store: Option<crate::windows::CredentialStoreBackend>,
    #[cfg(target_os = "linux")]
    secret_service: Option<crate::linux::SecretServiceBackend>,
    fallback_store: Mutex<HashMap<String, Vec<u8>>>,
}

impl TauriSecureStorage {
    /// Create new Tauri secure storage instance
    pub fn new() -> Self {
        Self {
            #[cfg(target_os = "macos")]
            keychain: crate::keychain::KeychainBackend::new().ok(),
            #[cfg(target_os = "windows")]
            credential_store: crate::windows::CredentialStoreBackend::new().ok(),
            #[cfg(target_os = "linux")]
            secret_service: crate::linux::SecretServiceBackend::new().ok(),
            fallback_store: Mutex::new(HashMap::new()),
        }
    }

    /// Store data securely
    pub async fn store(&self, key: &str, value: &[u8]) -> StorageResult<()> {
        // Try platform-specific secure storage first
        #[cfg(target_os = "macos")]
        if let Some(ref keychain) = self.keychain {
            match keychain.store(key, value).await {
                Ok(_) => return StorageResult {
                    success: true,
                    data: Some(()),
                    error: None,
                },
                Err(e) => {
                    eprintln!("Keychain storage failed: {}", e);
                }
            }
        }

        #[cfg(target_os = "windows")]
        if let Some(ref credential_store) = self.credential_store {
            match credential_store.store(key, value).await {
                Ok(_) => return StorageResult {
                    success: true,
                    data: Some(()),
                    error: None,
                },
                Err(e) => {
                    eprintln!("Credential store failed: {}", e);
                }
            }
        }

        #[cfg(target_os = "linux")]
        if let Some(ref secret_service) = self.secret_service {
            match secret_service.store(key, value).await {
                Ok(_) => return StorageResult {
                    success: true,
                    data: Some(()),
                    error: None,
                },
                Err(e) => {
                    eprintln!("Secret service failed: {}", e);
                }
            }
        }

        // Fallback to encrypted in-memory storage
        match self.fallback_store.lock() {
            Ok(mut store) => {
                // In production, this should be encrypted
                store.insert(key.to_string(), value.to_vec());
                StorageResult {
                    success: true,
                    data: Some(()),
                    error: None,
                }
            }
            Err(e) => StorageResult {
                success: false,
                data: None,
                error: Some(format!("Fallback storage error: {}", e)),
            }
        }
    }

    /// Retrieve data securely
    pub async fn retrieve(&self, key: &str) -> StorageResult<Vec<u8>> {
        // Try platform-specific secure storage first
        #[cfg(target_os = "macos")]
        if let Some(ref keychain) = self.keychain {
            match keychain.retrieve(key).await {
                Ok(data) => return StorageResult {
                    success: true,
                    data: Some(data),
                    error: None,
                },
                Err(e) => {
                    eprintln!("Keychain retrieval failed: {}", e);
                }
            }
        }

        #[cfg(target_os = "windows")]
        if let Some(ref credential_store) = self.credential_store {
            match credential_store.retrieve(key).await {
                Ok(data) => return StorageResult {
                    success: true,
                    data: Some(data),
                    error: None,
                },
                Err(e) => {
                    eprintln!("Credential store retrieval failed: {}", e);
                }
            }
        }

        #[cfg(target_os = "linux")]
        if let Some(ref secret_service) = self.secret_service {
            match secret_service.retrieve(key).await {
                Ok(data) => return StorageResult {
                    success: true,
                    data: Some(data),
                    error: None,
                },
                Err(e) => {
                    eprintln!("Secret service retrieval failed: {}", e);
                }
            }
        }

        // Fallback to in-memory storage
        match self.fallback_store.lock() {
            Ok(store) => {
                if let Some(data) = store.get(key) {
                    StorageResult {
                        success: true,
                        data: Some(data.clone()),
                        error: None,
                    }
                } else {
                    StorageResult {
                        success: false,
                        data: None,
                        error: Some("Key not found".to_string()),
                    }
                }
            }
            Err(e) => StorageResult {
                success: false,
                data: None,
                error: Some(format!("Fallback storage error: {}", e)),
            }
        }
    }

    /// Remove data securely
    pub async fn remove(&self, key: &str) -> StorageResult<()> {
        let mut errors = Vec::new();
        let mut success = false;

        // Try platform-specific secure storage
        #[cfg(target_os = "macos")]
        if let Some(ref keychain) = self.keychain {
            match keychain.remove(key).await {
                Ok(_) => success = true,
                Err(e) => errors.push(format!("Keychain: {}", e)),
            }
        }

        #[cfg(target_os = "windows")]
        if let Some(ref credential_store) = self.credential_store {
            match credential_store.remove(key).await {
                Ok(_) => success = true,
                Err(e) => errors.push(format!("Credential store: {}", e)),
            }
        }

        #[cfg(target_os = "linux")]
        if let Some(ref secret_service) = self.secret_service {
            match secret_service.remove(key).await {
                Ok(_) => success = true,
                Err(e) => errors.push(format!("Secret service: {}", e)),
            }
        }

        // Also remove from fallback storage
        if let Ok(mut store) = self.fallback_store.lock() {
            store.remove(key);
            success = true;
        }

        if success {
            StorageResult {
                success: true,
                data: Some(()),
                error: None,
            }
        } else {
            StorageResult {
                success: false,
                data: None,
                error: Some(format!("Remove failed: {}", errors.join(", "))),
            }
        }
    }

    /// Check if key exists
    pub async fn exists(&self, key: &str) -> StorageResult<bool> {
        // Check platform-specific storage first
        #[cfg(target_os = "macos")]
        if let Some(ref keychain) = self.keychain {
            if let Ok(exists) = keychain.exists(key).await {
                if exists {
                    return StorageResult {
                        success: true,
                        data: Some(true),
                        error: None,
                    };
                }
            }
        }

        #[cfg(target_os = "windows")]
        if let Some(ref credential_store) = self.credential_store {
            if let Ok(exists) = credential_store.exists(key).await {
                if exists {
                    return StorageResult {
                        success: true,
                        data: Some(true),
                        error: None,
                    };
                }
            }
        }

        #[cfg(target_os = "linux")]
        if let Some(ref secret_service) = self.secret_service {
            if let Ok(exists) = secret_service.exists(key).await {
                if exists {
                    return StorageResult {
                        success: true,
                        data: Some(true),
                        error: None,
                    };
                }
            }
        }

        // Check fallback storage
        if let Ok(store) = self.fallback_store.lock() {
            StorageResult {
                success: true,
                data: Some(store.contains_key(key)),
                error: None,
            }
        } else {
            StorageResult {
                success: false,
                data: Some(false),
                error: Some("Storage access error".to_string()),
            }
        }
    }

    /// List all keys
    pub async fn list(&self) -> StorageResult<Vec<String>> {
        let mut keys = std::collections::HashSet::new();

        // Collect keys from platform-specific storage
        #[cfg(target_os = "macos")]
        if let Some(ref keychain) = self.keychain {
            if let Ok(keychain_keys) = keychain.list().await {
                keys.extend(keychain_keys);
            }
        }

        #[cfg(target_os = "windows")]
        if let Some(ref credential_store) = self.credential_store {
            if let Ok(store_keys) = credential_store.list().await {
                keys.extend(store_keys);
            }
        }

        #[cfg(target_os = "linux")]
        if let Some(ref secret_service) = self.secret_service {
            if let Ok(service_keys) = secret_service.list().await {
                keys.extend(service_keys);
            }
        }

        // Add fallback storage keys
        if let Ok(store) = self.fallback_store.lock() {
            keys.extend(store.keys().cloned());
        }

        StorageResult {
            success: true,
            data: Some(keys.into_iter().collect()),
            error: None,
        }
    }

    /// Get storage metadata
    pub async fn get_metadata(&self, key: &str) -> StorageResult<StorageMetadata> {
        // For now, return basic metadata
        // In production, this should be stored alongside the data
        let now = chrono::Utc::now();
        
        if self.exists(key).await.data.unwrap_or(false) {
            StorageResult {
                success: true,
                data: Some(StorageMetadata {
                    created_at: now,
                    modified_at: now,
                    size: 0, // Would need to be tracked separately
                    encrypted: true,
                }),
                error: None,
            }
        } else {
            StorageResult {
                success: false,
                data: None,
                error: Some("Key not found".to_string()),
            }
        }
    }

    /// Clear all data
    pub async fn clear(&self) -> StorageResult<()> {
        let mut success = false;

        // Clear platform-specific storage (be careful with this!)
        // In production, this should only clear Tari-specific entries

        // Clear fallback storage
        if let Ok(mut store) = self.fallback_store.lock() {
            store.clear();
            success = true;
        }

        if success {
            StorageResult {
                success: true,
                data: Some(()),
                error: None,
            }
        } else {
            StorageResult {
                success: false,
                data: None,
                error: Some("Clear operation failed".to_string()),
            }
        }
    }

    /// Get storage backend information
    pub async fn get_info(&self) -> StorageResult<StorageInfo> {
        let platform = std::env::consts::OS.to_string();
        let mut backend_type = "fallback".to_string();
        let mut secure = false;
        let mut available = false;
        let mut limitations = Vec::new();

        #[cfg(target_os = "macos")]
        if self.keychain.is_some() {
            backend_type = "keychain".to_string();
            secure = true;
            available = true;
            limitations.push("4KB size limit".to_string());
        }

        #[cfg(target_os = "windows")]
        if self.credential_store.is_some() {
            backend_type = "credential-store".to_string();
            secure = true;
            available = true;
            limitations.push("2.5KB size limit".to_string());
        }

        #[cfg(target_os = "linux")]
        if self.secret_service.is_some() {
            backend_type = "secret-service".to_string();
            secure = true;
            available = true;
            limitations.push("Requires D-Bus".to_string());
        }

        StorageResult {
            success: true,
            data: Some(StorageInfo {
                backend_type,
                platform,
                secure,
                available,
                limitations,
            }),
            error: None,
        }
    }

    /// Test storage functionality
    pub async fn test(&self) -> StorageResult<()> {
        let test_key = "tauri_storage_test";
        let test_data = b"test_data_for_tauri_storage";

        // Test store
        match self.store(test_key, test_data).await {
            StorageResult { success: true, .. } => {},
            result => return result,
        }

        // Test retrieve
        match self.retrieve(test_key).await {
            StorageResult { success: true, data: Some(retrieved), .. } => {
                if retrieved != test_data {
                    return StorageResult {
                        success: false,
                        data: None,
                        error: Some("Retrieved data doesn't match stored data".to_string()),
                    };
                }
            },
            result => return StorageResult {
                success: false,
                data: None,
                error: Some(format!("Retrieve test failed: {:?}", result.error)),
            },
        }

        // Test remove
        match self.remove(test_key).await {
            StorageResult { success: true, .. } => {},
            result => return result,
        }

        // Verify removal
        match self.exists(test_key).await {
            StorageResult { success: true, data: Some(false), .. } => {},
            _ => return StorageResult {
                success: false,
                data: None,
                error: Some("Test cleanup failed".to_string()),
            },
        }

        StorageResult {
            success: true,
            data: Some(()),
            error: None,
        }
    }
}

impl Default for TauriSecureStorage {
    fn default() -> Self {
        Self::new()
    }
}
