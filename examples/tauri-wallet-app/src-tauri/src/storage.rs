use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, error, warn};

/// Storage metadata information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageMetadata {
    pub created_at: i64,
    pub updated_at: i64,
    pub size: usize,
    pub encrypted: bool,
}

/// Storage backend information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageInfo {
    pub backend: String,
    pub version: String,
    pub secure: bool,
    pub supports_metadata: bool,
}

/// Cross-platform secure storage implementation
pub struct SecureStorage {
    // In-memory cache for frequently accessed items
    cache: Arc<RwLock<HashMap<String, (Vec<u8>, StorageMetadata)>>>,
    backend_info: StorageInfo,
}

impl SecureStorage {
    pub fn new() -> Self {
        let backend_info = Self::detect_backend();
        info!("Initialized secure storage with backend: {}", backend_info.backend);
        
        Self {
            cache: Arc::new(RwLock::new(HashMap::new())),
            backend_info,
        }
    }

    /// Store data securely using platform-specific backend
    pub async fn store(&self, key: &str, value: &[u8]) -> Result<()> {
        self.validate_key(key)?;
        
        let metadata = StorageMetadata {
            created_at: chrono::Utc::now().timestamp_millis(),
            updated_at: chrono::Utc::now().timestamp_millis(),
            size: value.len(),
            encrypted: true,
        };

        // Store in platform-specific backend
        self.store_platform_specific(key, value).await?;

        // Update cache
        {
            let mut cache = self.cache.write().await;
            cache.insert(key.to_string(), (value.to_vec(), metadata));
        }

        info!("Stored {} bytes for key: {}", value.len(), key);
        Ok(())
    }

    /// Retrieve data securely from platform-specific backend
    pub async fn retrieve(&self, key: &str) -> Result<Vec<u8>> {
        self.validate_key(key)?;

        // Check cache first
        {
            let cache = self.cache.read().await;
            if let Some((value, _metadata)) = cache.get(key) {
                return Ok(value.clone());
            }
        }

        // Retrieve from platform-specific backend
        let value = self.retrieve_platform_specific(key).await?;

        // Update cache
        {
            let mut cache = self.cache.write().await;
            let metadata = StorageMetadata {
                created_at: chrono::Utc::now().timestamp_millis(),
                updated_at: chrono::Utc::now().timestamp_millis(),
                size: value.len(),
                encrypted: true,
            };
            cache.insert(key.to_string(), (value.clone(), metadata));
        }

        Ok(value)
    }

    /// Remove data securely
    pub async fn remove(&self, key: &str) -> Result<()> {
        self.validate_key(key)?;

        // Remove from platform-specific backend
        self.remove_platform_specific(key).await?;

        // Remove from cache
        {
            let mut cache = self.cache.write().await;
            cache.remove(key);
        }

        info!("Removed key: {}", key);
        Ok(())
    }

    /// Check if key exists
    pub async fn exists(&self, key: &str) -> Result<bool> {
        self.validate_key(key)?;

        // Check cache first
        {
            let cache = self.cache.read().await;
            if cache.contains_key(key) {
                return Ok(true);
            }
        }

        // Check platform-specific backend
        self.exists_platform_specific(key).await
    }

    /// List all stored keys
    pub async fn list(&self) -> Result<Vec<String>> {
        self.list_platform_specific().await
    }

    /// Get metadata for a key
    pub async fn get_metadata(&self, key: &str) -> Result<StorageMetadata> {
        self.validate_key(key)?;

        // Check cache first
        {
            let cache = self.cache.read().await;
            if let Some((_value, metadata)) = cache.get(key) {
                return Ok(metadata.clone());
            }
        }

        // For platform backends that don't support metadata, return basic info
        if self.exists(key).await? {
            Ok(StorageMetadata {
                created_at: 0, // Unknown
                updated_at: 0, // Unknown
                size: 0, // Unknown - would need to retrieve to get size
                encrypted: true,
            })
        } else {
            Err(AppError::Storage("Key not found".to_string()))
        }
    }

    /// Clear all stored data
    pub async fn clear(&self) -> Result<()> {
        // Clear platform-specific backend
        self.clear_platform_specific().await?;

        // Clear cache
        {
            let mut cache = self.cache.write().await;
            cache.clear();
        }

        info!("Cleared all stored data");
        Ok(())
    }

    /// Get storage backend information
    pub async fn get_info(&self) -> Result<StorageInfo> {
        Ok(self.backend_info.clone())
    }

    /// Test storage functionality
    pub async fn test(&self) -> Result<()> {
        let test_key = "test_storage_functionality";
        let test_value = b"test_data_for_storage_validation";

        // Test store
        self.store(test_key, test_value).await?;

        // Test exists
        if !self.exists(test_key).await? {
            return Err(AppError::Storage("Test key not found after storing".to_string()));
        }

        // Test retrieve
        let retrieved = self.retrieve(test_key).await?;
        if retrieved != test_value {
            return Err(AppError::Storage("Retrieved data doesn't match stored data".to_string()));
        }

        // Test remove
        self.remove(test_key).await?;

        // Verify removal
        if self.exists(test_key).await? {
            return Err(AppError::Storage("Test key still exists after removal".to_string()));
        }

        info!("Storage test completed successfully");
        Ok(())
    }

    /// Detect the best available storage backend for the current platform
    fn detect_backend() -> StorageInfo {
        #[cfg(target_os = "macos")]
        {
            StorageInfo {
                backend: "macOS Keychain".to_string(),
                version: "1.0".to_string(),
                secure: true,
                supports_metadata: false,
            }
        }

        #[cfg(target_os = "windows")]
        {
            StorageInfo {
                backend: "Windows Credential Store".to_string(),
                version: "1.0".to_string(),
                secure: true,
                supports_metadata: false,
            }
        }

        #[cfg(target_os = "linux")]
        {
            StorageInfo {
                backend: "Linux Secret Service".to_string(),
                version: "1.0".to_string(),
                secure: true,
                supports_metadata: false,
            }
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
        {
            StorageInfo {
                backend: "Memory Storage".to_string(),
                version: "1.0".to_string(),
                secure: false,
                supports_metadata: true,
            }
        }
    }

    /// Platform-specific storage implementation for macOS
    #[cfg(target_os = "macos")]
    async fn store_platform_specific(&self, key: &str, value: &[u8]) -> Result<()> {
        use keyring::Entry;
        
        let entry = Entry::new("tari-wallet", key)
            .map_err(|e| AppError::Storage(format!("Failed to create keychain entry: {}", e)))?;
        
        let value_str = base64::encode(value);
        entry.set_password(&value_str)
            .map_err(|e| AppError::Storage(format!("Failed to store in keychain: {}", e)))?;
        
        Ok(())
    }

    #[cfg(target_os = "macos")]
    async fn retrieve_platform_specific(&self, key: &str) -> Result<Vec<u8>> {
        use keyring::Entry;
        
        let entry = Entry::new("tari-wallet", key)
            .map_err(|e| AppError::Storage(format!("Failed to create keychain entry: {}", e)))?;
        
        let value_str = entry.get_password()
            .map_err(|e| AppError::Storage(format!("Failed to retrieve from keychain: {}", e)))?;
        
        base64::decode(&value_str)
            .map_err(|e| AppError::Storage(format!("Failed to decode stored value: {}", e)))
    }

    #[cfg(target_os = "macos")]
    async fn remove_platform_specific(&self, key: &str) -> Result<()> {
        use keyring::Entry;
        
        let entry = Entry::new("tari-wallet", key)
            .map_err(|e| AppError::Storage(format!("Failed to create keychain entry: {}", e)))?;
        
        entry.delete_password()
            .map_err(|e| AppError::Storage(format!("Failed to remove from keychain: {}", e)))?;
        
        Ok(())
    }

    #[cfg(target_os = "macos")]
    async fn exists_platform_specific(&self, key: &str) -> Result<bool> {
        use keyring::Entry;
        
        let entry = Entry::new("tari-wallet", key)
            .map_err(|e| AppError::Storage(format!("Failed to create keychain entry: {}", e)))?;
        
        match entry.get_password() {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    #[cfg(target_os = "macos")]
    async fn list_platform_specific(&self) -> Result<Vec<String>> {
        // macOS Keychain doesn't provide an easy way to list all keys
        // Return cached keys for now
        let cache = self.cache.read().await;
        Ok(cache.keys().cloned().collect())
    }

    #[cfg(target_os = "macos")]
    async fn clear_platform_specific(&self) -> Result<()> {
        // Get all keys from cache and remove them individually
        let keys: Vec<String> = {
            let cache = self.cache.read().await;
            cache.keys().cloned().collect()
        };

        for key in keys {
            if let Err(e) = self.remove_platform_specific(&key).await {
                warn!("Failed to remove key {}: {}", key, e);
            }
        }

        Ok(())
    }

    /// Platform-specific storage implementation for Windows
    #[cfg(target_os = "windows")]
    async fn store_platform_specific(&self, key: &str, value: &[u8]) -> Result<()> {
        use keyring::Entry;
        
        let entry = Entry::new("tari-wallet", key)
            .map_err(|e| AppError::Storage(format!("Failed to create credential entry: {}", e)))?;
        
        let value_str = base64::encode(value);
        entry.set_password(&value_str)
            .map_err(|e| AppError::Storage(format!("Failed to store in credential store: {}", e)))?;
        
        Ok(())
    }

    #[cfg(target_os = "windows")]
    async fn retrieve_platform_specific(&self, key: &str) -> Result<Vec<u8>> {
        use keyring::Entry;
        
        let entry = Entry::new("tari-wallet", key)
            .map_err(|e| AppError::Storage(format!("Failed to create credential entry: {}", e)))?;
        
        let value_str = entry.get_password()
            .map_err(|e| AppError::Storage(format!("Failed to retrieve from credential store: {}", e)))?;
        
        base64::decode(&value_str)
            .map_err(|e| AppError::Storage(format!("Failed to decode stored value: {}", e)))
    }

    #[cfg(target_os = "windows")]
    async fn remove_platform_specific(&self, key: &str) -> Result<()> {
        use keyring::Entry;
        
        let entry = Entry::new("tari-wallet", key)
            .map_err(|e| AppError::Storage(format!("Failed to create credential entry: {}", e)))?;
        
        entry.delete_password()
            .map_err(|e| AppError::Storage(format!("Failed to remove from credential store: {}", e)))?;
        
        Ok(())
    }

    #[cfg(target_os = "windows")]
    async fn exists_platform_specific(&self, key: &str) -> Result<bool> {
        use keyring::Entry;
        
        let entry = Entry::new("tari-wallet", key)
            .map_err(|e| AppError::Storage(format!("Failed to create credential entry: {}", e)))?;
        
        match entry.get_password() {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    #[cfg(target_os = "windows")]
    async fn list_platform_specific(&self) -> Result<Vec<String>> {
        // Windows Credential Store doesn't provide an easy way to list all keys
        // Return cached keys for now
        let cache = self.cache.read().await;
        Ok(cache.keys().cloned().collect())
    }

    #[cfg(target_os = "windows")]
    async fn clear_platform_specific(&self) -> Result<()> {
        // Get all keys from cache and remove them individually
        let keys: Vec<String> = {
            let cache = self.cache.read().await;
            cache.keys().cloned().collect()
        };

        for key in keys {
            if let Err(e) = self.remove_platform_specific(&key).await {
                warn!("Failed to remove key {}: {}", key, e);
            }
        }

        Ok(())
    }

    /// Platform-specific storage implementation for Linux
    #[cfg(target_os = "linux")]
    async fn store_platform_specific(&self, key: &str, value: &[u8]) -> Result<()> {
        use keyring::Entry;
        
        let entry = Entry::new("tari-wallet", key)
            .map_err(|e| AppError::Storage(format!("Failed to create secret service entry: {}", e)))?;
        
        let value_str = base64::encode(value);
        entry.set_password(&value_str)
            .map_err(|e| AppError::Storage(format!("Failed to store in secret service: {}", e)))?;
        
        Ok(())
    }

    #[cfg(target_os = "linux")]
    async fn retrieve_platform_specific(&self, key: &str) -> Result<Vec<u8>> {
        use keyring::Entry;
        
        let entry = Entry::new("tari-wallet", key)
            .map_err(|e| AppError::Storage(format!("Failed to create secret service entry: {}", e)))?;
        
        let value_str = entry.get_password()
            .map_err(|e| AppError::Storage(format!("Failed to retrieve from secret service: {}", e)))?;
        
        base64::decode(&value_str)
            .map_err(|e| AppError::Storage(format!("Failed to decode stored value: {}", e)))
    }

    #[cfg(target_os = "linux")]
    async fn remove_platform_specific(&self, key: &str) -> Result<()> {
        use keyring::Entry;
        
        let entry = Entry::new("tari-wallet", key)
            .map_err(|e| AppError::Storage(format!("Failed to create secret service entry: {}", e)))?;
        
        entry.delete_password()
            .map_err(|e| AppError::Storage(format!("Failed to remove from secret service: {}", e)))?;
        
        Ok(())
    }

    #[cfg(target_os = "linux")]
    async fn exists_platform_specific(&self, key: &str) -> Result<bool> {
        use keyring::Entry;
        
        let entry = Entry::new("tari-wallet", key)
            .map_err(|e| AppError::Storage(format!("Failed to create secret service entry: {}", e)))?;
        
        match entry.get_password() {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    #[cfg(target_os = "linux")]
    async fn list_platform_specific(&self) -> Result<Vec<String>> {
        // Linux Secret Service doesn't provide an easy way to list all keys
        // Return cached keys for now
        let cache = self.cache.read().await;
        Ok(cache.keys().cloned().collect())
    }

    #[cfg(target_os = "linux")]
    async fn clear_platform_specific(&self) -> Result<()> {
        // Get all keys from cache and remove them individually
        let keys: Vec<String> = {
            let cache = self.cache.read().await;
            cache.keys().cloned().collect()
        };

        for key in keys {
            if let Err(e) = self.remove_platform_specific(&key).await {
                warn!("Failed to remove key {}: {}", key, e);
            }
        }

        Ok(())
    }

    /// Fallback in-memory storage for unsupported platforms
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    async fn store_platform_specific(&self, _key: &str, _value: &[u8]) -> Result<()> {
        // Data is already stored in cache, which serves as the storage for this platform
        Ok(())
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    async fn retrieve_platform_specific(&self, key: &str) -> Result<Vec<u8>> {
        let cache = self.cache.read().await;
        cache.get(key)
            .map(|(value, _metadata)| value.clone())
            .ok_or_else(|| AppError::Storage("Key not found".to_string()))
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    async fn remove_platform_specific(&self, _key: &str) -> Result<()> {
        // Removal is handled by the main remove method
        Ok(())
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    async fn exists_platform_specific(&self, key: &str) -> Result<bool> {
        let cache = self.cache.read().await;
        Ok(cache.contains_key(key))
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    async fn list_platform_specific(&self) -> Result<Vec<String>> {
        let cache = self.cache.read().await;
        Ok(cache.keys().cloned().collect())
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    async fn clear_platform_specific(&self) -> Result<()> {
        // Clearing is handled by the main clear method
        Ok(())
    }

    /// Validate storage key format
    fn validate_key(&self, key: &str) -> Result<()> {
        if key.is_empty() {
            return Err(AppError::Validation("Storage key cannot be empty".to_string()));
        }

        if key.len() > 255 {
            return Err(AppError::Validation("Storage key too long (max 255 characters)".to_string()));
        }

        // Check for invalid characters
        if key.contains('\0') {
            return Err(AppError::Validation("Storage key cannot contain null characters".to_string()));
        }

        Ok(())
    }
}

// Add base64 encoding functionality
mod base64 {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    pub fn encode(input: &[u8]) -> String {
        let mut result = String::new();
        let mut buffer = 0u32;
        let mut buffer_bits = 0;

        for &byte in input {
            buffer = (buffer << 8) | byte as u32;
            buffer_bits += 8;

            while buffer_bits >= 6 {
                buffer_bits -= 6;
                let index = ((buffer >> buffer_bits) & 0x3F) as usize;
                result.push(CHARS[index] as char);
            }
        }

        if buffer_bits > 0 {
            buffer <<= 6 - buffer_bits;
            let index = (buffer & 0x3F) as usize;
            result.push(CHARS[index] as char);
        }

        while result.len() % 4 != 0 {
            result.push('=');
        }

        result
    }

    pub fn decode(input: &str) -> std::result::Result<Vec<u8>, &'static str> {
        let input = input.trim_end_matches('=');
        let mut result = Vec::new();
        let mut buffer = 0u32;
        let mut buffer_bits = 0;

        for ch in input.chars() {
            let value = match ch {
                'A'..='Z' => ch as u32 - 'A' as u32,
                'a'..='z' => ch as u32 - 'a' as u32 + 26,
                '0'..='9' => ch as u32 - '0' as u32 + 52,
                '+' => 62,
                '/' => 63,
                _ => return Err("Invalid character in base64 string"),
            };

            buffer = (buffer << 6) | value;
            buffer_bits += 6;

            if buffer_bits >= 8 {
                buffer_bits -= 8;
                result.push(((buffer >> buffer_bits) & 0xFF) as u8);
            }
        }

        Ok(result)
    }
}
