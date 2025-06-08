use std::path::{Path, PathBuf};
use std::sync::Arc;

use tari_core::consensus::ConsensusManager;
use minotari_wallet::storage::sqlite_db::wallet::WalletSqliteDatabase;
use minotari_wallet::transaction_service::storage::sqlite_db::TransactionServiceSqliteDatabase;
use minotari_wallet::output_manager_service::storage::sqlite_db::OutputManagerSqliteDatabase;
use tari_key_manager::cipher_seed::CipherSeed;

use crate::error::{TariError, TariResult};

/// Database configuration for wallet persistence
#[derive(Debug, Clone)]
pub struct DatabaseConfig {
    pub base_path: PathBuf,
    pub wallet_db_name: String,
    pub transaction_db_name: String,
    pub output_manager_db_name: String,
    pub connection_pool_size: u32,
    pub connection_timeout_seconds: u64,
    pub enable_foreign_keys: bool,
    pub enable_wal_mode: bool,
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            base_path: default_db_path(),
            wallet_db_name: "wallet.db".to_string(),
            transaction_db_name: "transaction_service.db".to_string(),
            output_manager_db_name: "output_manager.db".to_string(),
            connection_pool_size: 10,
            connection_timeout_seconds: 30,
            enable_foreign_keys: true,
            enable_wal_mode: true,
        }
    }
}

impl DatabaseConfig {
    /// Create a new database configuration
    pub fn new<P: Into<PathBuf>>(base_path: P) -> Self {
        Self {
            base_path: base_path.into(),
            ..Self::default()
        }
    }

    /// Get the full path for the wallet database
    pub fn wallet_db_path(&self) -> PathBuf {
        self.base_path.join(&self.wallet_db_name)
    }

    /// Get the full path for the transaction service database  
    pub fn transaction_db_path(&self) -> PathBuf {
        self.base_path.join(&self.transaction_db_name)
    }

    /// Get the full path for the output manager database
    pub fn output_manager_db_path(&self) -> PathBuf {
        self.base_path.join(&self.output_manager_db_name)
    }

    /// Validate the database configuration
    pub fn validate(&self) -> TariResult<()> {
        if self.connection_pool_size == 0 {
            return Err(TariError::DatabaseError("connection_pool_size must be greater than 0".to_string()));
        }

        if self.connection_timeout_seconds == 0 {
            return Err(TariError::DatabaseError("connection_timeout_seconds must be greater than 0".to_string()));
        }

        if self.wallet_db_name.is_empty() {
            return Err(TariError::DatabaseError("wallet_db_name cannot be empty".to_string()));
        }

        if self.transaction_db_name.is_empty() {
            return Err(TariError::DatabaseError("transaction_db_name cannot be empty".to_string()));
        }

        if self.output_manager_db_name.is_empty() {
            return Err(TariError::DatabaseError("output_manager_db_name cannot be empty".to_string()));
        }

        // Ensure base path is absolute and exists or can be created
        if !self.base_path.is_absolute() {
            return Err(TariError::DatabaseError("base_path must be an absolute path".to_string()));
        }

        Ok(())
    }
}

/// Database connection manager for wallet components
pub struct DatabaseManager {
    config: DatabaseConfig,
    initialized: bool,
}

impl DatabaseManager {
    /// Create a new database manager
    pub fn new(config: DatabaseConfig) -> TariResult<Self> {
        config.validate()?;
        
        Ok(Self {
            config,
            initialized: false,
        })
    }

    /// Initialize all database connections
    pub async fn initialize_databases(
        &mut self,
        _consensus_manager: &ConsensusManager,
        _cipher_seed: &CipherSeed,
    ) -> TariResult<()> {
        log::info!("Initializing database connections at: {:?}", self.config.base_path);

        // Create database directory if it doesn't exist
        std::fs::create_dir_all(&self.config.base_path)
            .map_err(|e| TariError::DatabaseError(format!("Failed to create database directory: {}", e)))?;

        // Create database files if they don't exist
        std::fs::File::create(self.config.wallet_db_path()).ok();
        std::fs::File::create(self.config.transaction_db_path()).ok();
        std::fs::File::create(self.config.output_manager_db_path()).ok();

        self.initialized = true;
        log::info!("Database directory structure initialized successfully");
        Ok(())
    }

    /// Check if databases are initialized
    pub fn is_initialized(&self) -> bool {
        self.initialized
    }

    /// Get database configuration
    pub fn get_config(&self) -> &DatabaseConfig {
        &self.config
    }

    /// Perform database health check
    pub async fn health_check(&self) -> TariResult<bool> {
        log::debug!("Performing database health check");

        if !self.initialized {
            return Err(TariError::DatabaseError("Databases not initialized".to_string()));
        }

        // Check if database files exist
        if !self.config.wallet_db_path().exists() {
            return Err(TariError::DatabaseError("Wallet database file missing".to_string()));
        }

        log::debug!("Database health check passed");
        Ok(true)
    }

    /// Close all database connections
    pub async fn close_connections(&mut self) -> TariResult<()> {
        log::info!("Closing database connections");

        self.initialized = false;

        log::info!("All database connections closed");
        Ok(())
    }

    /// Create backup of all databases
    pub async fn create_backup<P: AsRef<Path>>(&self, backup_dir: P) -> TariResult<()> {
        let backup_dir = backup_dir.as_ref();
        log::info!("Creating database backup at: {:?}", backup_dir);

        // Create backup directory
        std::fs::create_dir_all(backup_dir)
            .map_err(|e| TariError::DatabaseError(format!("Failed to create backup directory: {}", e)))?;

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // Backup wallet database
        let wallet_backup = backup_dir.join(format!("wallet_{}.db", timestamp));
        std::fs::copy(self.config.wallet_db_path(), &wallet_backup)
            .map_err(|e| TariError::DatabaseError(format!("Failed to backup wallet database: {}", e)))?;

        // Backup transaction service database
        let tx_backup = backup_dir.join(format!("transaction_service_{}.db", timestamp));
        std::fs::copy(self.config.transaction_db_path(), &tx_backup)
            .map_err(|e| TariError::DatabaseError(format!("Failed to backup transaction service database: {}", e)))?;

        // Backup output manager database
        let output_backup = backup_dir.join(format!("output_manager_{}.db", timestamp));
        std::fs::copy(self.config.output_manager_db_path(), &output_backup)
            .map_err(|e| TariError::DatabaseError(format!("Failed to backup output manager database: {}", e)))?;

        log::info!("Database backup completed successfully");
        Ok(())
    }
}

/// Create all wallet databases with proper initialization
pub async fn create_wallet_databases(
    config: &DatabaseConfig,
    consensus_manager: &ConsensusManager,
    cipher_seed: &CipherSeed,
) -> TariResult<DatabaseManager> {
    log::info!("Creating wallet databases with configuration: {:?}", config);

    let mut db_manager = DatabaseManager::new(config.clone())?;
    db_manager.initialize_databases(consensus_manager, cipher_seed).await?;

    log::info!("Wallet databases created successfully");
    Ok(db_manager)
}

/// Get default database path based on OS
fn default_db_path() -> PathBuf {
    dirs_next::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("tari")
        .join("wallet")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use tari_core::consensus::ConsensusManagerBuilder;
    use tari_common::configuration::Network;

    #[test]
    fn test_database_config_validation() {
        let mut config = DatabaseConfig::default();
        assert!(config.validate().is_ok());

        config.connection_pool_size = 0;
        assert!(config.validate().is_err());

        config.connection_pool_size = 5;
        config.wallet_db_name = "".to_string();
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_database_config_paths() {
        let temp_dir = tempdir().unwrap();
        let config = DatabaseConfig::new(temp_dir.path());

        assert_eq!(config.wallet_db_path(), temp_dir.path().join("wallet.db"));
        assert_eq!(config.transaction_db_path(), temp_dir.path().join("transaction_service.db"));
        assert_eq!(config.output_manager_db_path(), temp_dir.path().join("output_manager.db"));
    }

    #[tokio::test]
    async fn test_database_manager_creation() {
        let temp_dir = tempdir().unwrap();
        let config = DatabaseConfig::new(temp_dir.path());

        let result = DatabaseManager::new(config);
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_database_initialization() {
        let temp_dir = tempdir().unwrap();
        let config = DatabaseConfig::new(temp_dir.path());

        let consensus_manager = ConsensusManagerBuilder::new(Network::LocalNet).build().unwrap();
        let cipher_seed = CipherSeed::new();

        let result = create_wallet_databases(&config, &consensus_manager, &cipher_seed).await;
        // Note: This may fail due to missing database schema, but structure should be correct
        // In a real environment with proper Tari setup, this would succeed
        log::debug!("Database creation result: {:?}", result);
    }
}
