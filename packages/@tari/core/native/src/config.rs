use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;

/// Production configuration for the Tari SDK
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductionConfig {
    pub max_wallet_instances: usize,
    pub max_concurrent_operations: usize,
    pub connection_timeout_ms: u64,
    pub retry_attempts: usize,
    pub enable_metrics: bool,
    pub log_level: String,
    pub network_config: NetworkConfig,
    pub security_config: SecurityConfig,
    pub performance_config: PerformanceConfig,
    
    /// Environment-specific settings
    pub environment: EnvironmentType,
    
    /// Database configuration
    pub database_config: DatabaseProductionConfig,
    
    /// Transaction configuration
    pub transaction_config: TransactionProductionConfig,
    
    /// Recovery and backup configuration
    pub recovery_config: RecoveryConfig,
    
    /// Feature flags for gradual rollout
    pub feature_flags: FeatureFlags,
}

impl Default for ProductionConfig {
    fn default() -> Self {
        Self {
            max_wallet_instances: 100,
            max_concurrent_operations: 50,
            connection_timeout_ms: 30000,
            retry_attempts: 3,
            enable_metrics: true,
            log_level: "info".to_string(),
            network_config: NetworkConfig::default(),
            security_config: SecurityConfig::default(),
            performance_config: PerformanceConfig::default(),
            environment: EnvironmentType::Production,
            database_config: DatabaseProductionConfig::default(),
            transaction_config: TransactionProductionConfig::default(),
            recovery_config: RecoveryConfig::default(),
            feature_flags: FeatureFlags::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkConfig {
    pub mainnet_peers: Vec<String>,
    pub testnet_peers: Vec<String>,
    pub localnet_peers: Vec<String>,
    pub max_peers: usize,
    pub connection_timeout_ms: u64,
    pub heartbeat_interval_ms: u64,
    pub peer_discovery_enabled: bool,
    pub dns_seeds_enabled: bool,
}

impl Default for NetworkConfig {
    fn default() -> Self {
        Self {
            mainnet_peers: vec![
                "/dns4/seeds.tari.com/tcp/18141".to_string(),
                "/dns4/seeds2.tari.com/tcp/18141".to_string(),
            ],
            testnet_peers: vec![
                "/ip4/127.0.0.1/tcp/18189".to_string(),
            ],
            localnet_peers: vec![],
            max_peers: 50,
            connection_timeout_ms: 30000,
            heartbeat_interval_ms: 60000,
            peer_discovery_enabled: true,
            dns_seeds_enabled: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    pub enable_ssl: bool,
    pub cert_path: Option<String>,
    pub key_path: Option<String>,
    pub allowed_origins: Vec<String>,
    pub rate_limit_per_minute: u32,
    pub max_request_size_bytes: usize,
    pub enable_cors: bool,
    pub cookie_secure: bool,
    pub session_timeout_minutes: u32,
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            enable_ssl: false,
            cert_path: None,
            key_path: None,
            allowed_origins: vec!["*".to_string()],
            rate_limit_per_minute: 1000,
            max_request_size_bytes: 1024 * 1024, // 1MB
            enable_cors: true,
            cookie_secure: false,
            session_timeout_minutes: 60,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceConfig {
    pub memory_limit_mb: usize,
    pub cpu_limit_percent: u32,
    pub gc_interval_seconds: u64,
    pub cache_size_mb: usize,
    pub worker_threads: WorkerThreadConfig,
    pub operation_timeouts: OperationTimeouts,
    pub batch_sizes: BatchSizes,
}

impl Default for PerformanceConfig {
    fn default() -> Self {
        Self {
            memory_limit_mb: 1024, // 1GB
            cpu_limit_percent: 80,
            gc_interval_seconds: 300, // 5 minutes
            cache_size_mb: 256, // 256MB
            worker_threads: WorkerThreadConfig::default(),
            operation_timeouts: OperationTimeouts::default(),
            batch_sizes: BatchSizes::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerThreadConfig {
    pub wallet_threads: usize,
    pub crypto_threads: usize,
    pub network_threads: usize,
    pub general_threads: usize,
}

impl Default for WorkerThreadConfig {
    fn default() -> Self {
        Self {
            wallet_threads: 2,
            crypto_threads: 1,
            network_threads: 4,
            general_threads: 2,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationTimeouts {
    pub wallet_create_seconds: u64,
    pub balance_query_seconds: u64,
    pub transaction_send_seconds: u64,
    pub peer_discovery_seconds: u64,
    pub sync_seconds: u64,
}

impl Default for OperationTimeouts {
    fn default() -> Self {
        Self {
            wallet_create_seconds: 30,
            balance_query_seconds: 10,
            transaction_send_seconds: 60,
            peer_discovery_seconds: 30,
            sync_seconds: 300, // 5 minutes
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchSizes {
    pub utxo_batch_size: usize,
    pub transaction_batch_size: usize,
    pub peer_batch_size: usize,
}

impl Default for BatchSizes {
    fn default() -> Self {
        Self {
            utxo_batch_size: 100,
            transaction_batch_size: 50,
            peer_batch_size: 20,
        }
    }
}

/// Configuration manager for loading and validating settings
pub struct ConfigManager {
    config: ProductionConfig,
    config_path: Option<PathBuf>,
}

impl ConfigManager {
    /// Create a new config manager with default settings
    pub fn new() -> Self {
        Self {
            config: ProductionConfig::default(),
            config_path: None,
        }
    }
    
    /// Load configuration from file
    pub fn load_from_file<P: Into<PathBuf>>(path: P) -> Result<Self, ConfigError> {
        let path = path.into();
        let content = std::fs::read_to_string(&path)
            .map_err(|e| ConfigError::FileError(format!("Failed to read config file: {}", e)))?;
        
        let config: ProductionConfig = if path.extension().and_then(|s| s.to_str()) == Some("json") {
            serde_json::from_str(&content)
                .map_err(|e| ConfigError::ParseError(format!("Invalid JSON: {}", e)))?
        } else {
            toml::from_str(&content)
                .map_err(|e| ConfigError::ParseError(format!("Invalid TOML: {}", e)))?
        };
        
        let manager = Self {
            config,
            config_path: Some(path),
        };
        
        manager.validate()?;
        Ok(manager)
    }
    
    /// Load configuration from environment variables
    pub fn load_from_env() -> Result<Self, ConfigError> {
        let mut config = ProductionConfig::default();
        
        // Override with environment variables
        if let Ok(val) = std::env::var("TARI_MAX_WALLET_INSTANCES") {
            config.max_wallet_instances = val.parse()
                .map_err(|_| ConfigError::ParseError("Invalid TARI_MAX_WALLET_INSTANCES".to_string()))?;
        }
        
        if let Ok(val) = std::env::var("TARI_LOG_LEVEL") {
            config.log_level = val;
        }
        
        if let Ok(val) = std::env::var("TARI_CONNECTION_TIMEOUT_MS") {
            config.connection_timeout_ms = val.parse()
                .map_err(|_| ConfigError::ParseError("Invalid TARI_CONNECTION_TIMEOUT_MS".to_string()))?;
        }
        
        if let Ok(val) = std::env::var("TARI_ENABLE_METRICS") {
            config.enable_metrics = val.parse()
                .map_err(|_| ConfigError::ParseError("Invalid TARI_ENABLE_METRICS".to_string()))?;
        }
        
        let manager = Self {
            config,
            config_path: None,
        };
        
        manager.validate()?;
        Ok(manager)
    }
    
    /// Validate configuration settings
    pub fn validate(&self) -> Result<(), ConfigError> {
        let config = &self.config;
        
        if config.max_wallet_instances == 0 {
            return Err(ConfigError::ValidationError("max_wallet_instances must be greater than 0".to_string()));
        }
        
        if config.max_concurrent_operations == 0 {
            return Err(ConfigError::ValidationError("max_concurrent_operations must be greater than 0".to_string()));
        }
        
        if config.connection_timeout_ms == 0 {
            return Err(ConfigError::ValidationError("connection_timeout_ms must be greater than 0".to_string()));
        }
        
        if config.network_config.max_peers == 0 {
            return Err(ConfigError::ValidationError("max_peers must be greater than 0".to_string()));
        }
        
        if config.performance_config.memory_limit_mb == 0 {
            return Err(ConfigError::ValidationError("memory_limit_mb must be greater than 0".to_string()));
        }
        
        if config.performance_config.cpu_limit_percent > 100 {
            return Err(ConfigError::ValidationError("cpu_limit_percent must be <= 100".to_string()));
        }
        
        // Validate log level
        match config.log_level.to_lowercase().as_str() {
            "trace" | "debug" | "info" | "warn" | "error" => {},
            _ => return Err(ConfigError::ValidationError(format!("Invalid log level: {}", config.log_level))),
        }
        
        Ok(())
    }
    
    /// Get the current configuration
    pub fn get_config(&self) -> &ProductionConfig {
        &self.config
    }
    
    /// Update configuration
    pub fn update_config(&mut self, config: ProductionConfig) -> Result<(), ConfigError> {
        let temp = Self {
            config,
            config_path: self.config_path.clone(),
        };
        temp.validate()?;
        self.config = temp.config;
        Ok(())
    }
    
    /// Save configuration to file
    pub fn save_to_file<P: Into<PathBuf>>(&self, path: P) -> Result<(), ConfigError> {
        let path = path.into();
        let content = if path.extension().and_then(|s| s.to_str()) == Some("json") {
            serde_json::to_string_pretty(&self.config)
                .map_err(|e| ConfigError::SerializeError(format!("Failed to serialize JSON: {}", e)))?
        } else {
            toml::to_string_pretty(&self.config)
                .map_err(|e| ConfigError::SerializeError(format!("Failed to serialize TOML: {}", e)))?
        };
        
        std::fs::write(&path, content)
            .map_err(|e| ConfigError::FileError(format!("Failed to write config file: {}", e)))?;
        
        Ok(())
    }
    
    /// Get a duration from milliseconds config
    pub fn get_connection_timeout(&self) -> Duration {
        Duration::from_millis(self.config.connection_timeout_ms)
    }
    
    /// Get heartbeat interval duration
    pub fn get_heartbeat_interval(&self) -> Duration {
        Duration::from_millis(self.config.network_config.heartbeat_interval_ms)
    }
    
    /// Get appropriate peers for network
    pub fn get_peers_for_network(&self, network: &str) -> &[String] {
        match network.to_lowercase().as_str() {
            "mainnet" => &self.config.network_config.mainnet_peers,
            "testnet" | "nextnet" => &self.config.network_config.testnet_peers,
            "localnet" => &self.config.network_config.localnet_peers,
            _ => &[],
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("File error: {0}")]
    FileError(String),
    #[error("Parse error: {0}")]
    ParseError(String),
    #[error("Validation error: {0}")]
    ValidationError(String),
    #[error("Serialize error: {0}")]
    SerializeError(String),
}

/// Global configuration instance
lazy_static::lazy_static! {
    pub static ref CONFIG: std::sync::RwLock<ConfigManager> = {
        // Try to load from environment first, then fall back to defaults
        let manager = ConfigManager::load_from_env()
            .unwrap_or_else(|_| ConfigManager::new());
        std::sync::RwLock::new(manager)
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_default_config() {
        let config = ProductionConfig::default();
        assert_eq!(config.max_wallet_instances, 100);
        assert_eq!(config.log_level, "info");
        assert!(config.enable_metrics);
    }

    #[test]
    fn test_config_validation() {
        let manager = ConfigManager::new();
        assert!(manager.validate().is_ok());
        
        let mut bad_config = ProductionConfig::default();
        bad_config.max_wallet_instances = 0;
        let manager = ConfigManager { config: bad_config, config_path: None };
        assert!(manager.validate().is_err());
    }

    #[test]
    fn test_config_serialization() {
        let config = ProductionConfig::default();
        
        // Test JSON serialization
        let json = serde_json::to_string_pretty(&config).unwrap();
        let deserialized: ProductionConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(config.max_wallet_instances, deserialized.max_wallet_instances);
        
        // Test TOML serialization
        let toml = toml::to_string_pretty(&config).unwrap();
        let deserialized: ProductionConfig = toml::from_str(&toml).unwrap();
        assert_eq!(config.max_wallet_instances, deserialized.max_wallet_instances);
    }

    #[test]
    fn test_config_file_operations() {
        let temp_dir = tempdir().unwrap();
        let config_path = temp_dir.path().join("test_config.toml");
        
        let manager = ConfigManager::new();
        
        // Save config
        manager.save_to_file(&config_path).unwrap();
        assert!(config_path.exists());
        
        // Load config
        let loaded_manager = ConfigManager::load_from_file(&config_path).unwrap();
        assert_eq!(
            manager.get_config().max_wallet_instances,
            loaded_manager.get_config().max_wallet_instances
        );
    }

    #[test]
    fn test_network_peer_selection() {
        let manager = ConfigManager::new();
        
        let mainnet_peers = manager.get_peers_for_network("mainnet");
        assert!(!mainnet_peers.is_empty());
        
        let testnet_peers = manager.get_peers_for_network("testnet");
        assert!(!testnet_peers.is_empty());
        
        let unknown_peers = manager.get_peers_for_network("unknown");
        assert!(unknown_peers.is_empty());
    }
}

/// Environment type for different deployment scenarios
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EnvironmentType {
    Development,
    Testing,
    Staging,
    Production,
}

impl Default for EnvironmentType {
    fn default() -> Self {
        EnvironmentType::Production
    }
}

/// Database configuration for production environments
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseProductionConfig {
    /// Maximum number of database connections in the pool
    pub max_connections: usize,
    
    /// Connection timeout in seconds
    pub connection_timeout_seconds: u64,
    
    /// Query timeout in seconds
    pub query_timeout_seconds: u64,
    
    /// Enable Write-Ahead Logging for better performance
    pub enable_wal_mode: bool,
    
    /// SQLite pragma settings for optimization
    pub sqlite_pragmas: SqlitePragmas,
    
    /// Backup configuration
    pub backup_settings: BackupSettings,
    
    /// Database file encryption
    pub encryption_enabled: bool,
}

impl Default for DatabaseProductionConfig {
    fn default() -> Self {
        Self {
            max_connections: 25,
            connection_timeout_seconds: 30,
            query_timeout_seconds: 60,
            enable_wal_mode: true,
            sqlite_pragmas: SqlitePragmas::default(),
            backup_settings: BackupSettings::default(),
            encryption_enabled: true,
        }
    }
}

/// SQLite pragma settings for optimization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SqlitePragmas {
    pub journal_mode: String,
    pub synchronous: String,
    pub cache_size: i32,
    pub temp_store: String,
    pub mmap_size: i64,
}

impl Default for SqlitePragmas {
    fn default() -> Self {
        Self {
            journal_mode: "WAL".to_string(),
            synchronous: "NORMAL".to_string(),
            cache_size: -64000, // 64MB
            temp_store: "MEMORY".to_string(),
            mmap_size: 256 * 1024 * 1024, // 256MB
        }
    }
}

/// Backup settings for database files
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupSettings {
    pub auto_backup_enabled: bool,
    pub backup_interval_hours: u64,
    pub max_backup_files: usize,
    pub backup_directory: Option<PathBuf>,
    pub compress_backups: bool,
}

impl Default for BackupSettings {
    fn default() -> Self {
        Self {
            auto_backup_enabled: true,
            backup_interval_hours: 24,
            max_backup_files: 7,
            backup_directory: None, // Use default location
            compress_backups: true,
        }
    }
}

/// Transaction configuration for production environments
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionProductionConfig {
    /// Default fee per gram in microTari
    pub default_fee_per_gram: u64,
    
    /// Maximum transaction size in bytes
    pub max_transaction_size: usize,
    
    /// Transaction timeout in seconds
    pub transaction_timeout_seconds: u64,
    
    /// Number of confirmations required
    pub required_confirmations: u64,
    
    /// Enable transaction broadcasting retries
    pub enable_broadcast_retries: bool,
    
    /// Maximum number of broadcast retry attempts
    pub max_broadcast_retries: usize,
    
    /// Retry delay in seconds
    pub broadcast_retry_delay_seconds: u64,
    
    /// UTXO selection strategy
    pub utxo_selection_strategy: String,
    
    /// Enable privacy features
    pub privacy_settings: PrivacySettings,
}

impl Default for TransactionProductionConfig {
    fn default() -> Self {
        Self {
            default_fee_per_gram: 25,
            max_transaction_size: 1024 * 1024, // 1MB
            transaction_timeout_seconds: 300, // 5 minutes
            required_confirmations: 3,
            enable_broadcast_retries: true,
            max_broadcast_retries: 5,
            broadcast_retry_delay_seconds: 30,
            utxo_selection_strategy: "closest".to_string(),
            privacy_settings: PrivacySettings::default(),
        }
    }
}

/// Privacy settings for transactions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivacySettings {
    pub enable_coin_mixing: bool,
    pub mix_depth: usize,
    pub enable_address_reuse_prevention: bool,
    pub stealth_mode: bool,
}

impl Default for PrivacySettings {
    fn default() -> Self {
        Self {
            enable_coin_mixing: false, // Disabled by default for compatibility
            mix_depth: 3,
            enable_address_reuse_prevention: true,
            stealth_mode: false,
        }
    }
}

/// Recovery and backup configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryConfig {
    /// Enable automatic wallet recovery
    pub auto_recovery_enabled: bool,
    
    /// Recovery scan depth (number of blocks to scan)
    pub recovery_scan_depth: u64,
    
    /// Recovery timeout in seconds
    pub recovery_timeout_seconds: u64,
    
    /// Enable seed phrase backup verification
    pub verify_seed_phrase_backup: bool,
    
    /// Wallet state backup settings
    pub state_backup_settings: StateBackupSettings,
    
    /// Recovery from different sources
    pub recovery_sources: RecoverySources,
}

impl Default for RecoveryConfig {
    fn default() -> Self {
        Self {
            auto_recovery_enabled: true,
            recovery_scan_depth: 1000,
            recovery_timeout_seconds: 3600, // 1 hour
            verify_seed_phrase_backup: true,
            state_backup_settings: StateBackupSettings::default(),
            recovery_sources: RecoverySources::default(),
        }
    }
}

/// State backup settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateBackupSettings {
    pub backup_frequency_minutes: u64,
    pub max_backup_age_days: u64,
    pub backup_location: Option<PathBuf>,
    pub encrypt_backups: bool,
}

impl Default for StateBackupSettings {
    fn default() -> Self {
        Self {
            backup_frequency_minutes: 60,
            max_backup_age_days: 30,
            backup_location: None,
            encrypt_backups: true,
        }
    }
}

/// Recovery sources configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoverySources {
    pub enable_base_node_recovery: bool,
    pub enable_peer_recovery: bool,
    pub enable_local_recovery: bool,
    pub preferred_recovery_method: String,
}

impl Default for RecoverySources {
    fn default() -> Self {
        Self {
            enable_base_node_recovery: true,
            enable_peer_recovery: true,
            enable_local_recovery: true,
            preferred_recovery_method: "base_node".to_string(),
        }
    }
}

/// Feature flags for gradual rollout and A/B testing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureFlags {
    pub enable_advanced_transactions: bool,
    pub enable_one_sided_payments: bool,
    pub enable_confidential_transactions: bool,
    pub enable_atomic_swaps: bool,
    pub enable_multi_sig: bool,
    pub enable_contract_execution: bool,
    pub enable_dan_layer: bool,
    pub enable_mempool_optimization: bool,
    pub enable_advanced_privacy: bool,
    pub enable_experimental_features: bool,
}

impl Default for FeatureFlags {
    fn default() -> Self {
        Self {
            enable_advanced_transactions: true,
            enable_one_sided_payments: true,
            enable_confidential_transactions: true,
            enable_atomic_swaps: false, // Experimental
            enable_multi_sig: false, // Experimental
            enable_contract_execution: false, // Future feature
            enable_dan_layer: false, // Future feature
            enable_mempool_optimization: true,
            enable_advanced_privacy: false, // Opt-in
            enable_experimental_features: false, // Disabled by default
        }
    }
}

/// Environment-specific configuration presets
impl ProductionConfig {
    /// Create a configuration optimized for development
    pub fn for_development() -> Self {
        let mut config = Self::default();
        config.environment = EnvironmentType::Development;
        config.log_level = "debug".to_string();
        config.enable_metrics = false;
        config.max_wallet_instances = 10;
        config.database_config.encryption_enabled = false;
        config.feature_flags.enable_experimental_features = true;
        config
    }
    
    /// Create a configuration optimized for testing
    pub fn for_testing() -> Self {
        let mut config = Self::default();
        config.environment = EnvironmentType::Testing;
        config.log_level = "debug".to_string();
        config.max_wallet_instances = 5;
        config.connection_timeout_ms = 5000;
        config.database_config.backup_settings.auto_backup_enabled = false;
        config.feature_flags.enable_experimental_features = true;
        config
    }
    
    /// Create a configuration optimized for staging
    pub fn for_staging() -> Self {
        let mut config = Self::default();
        config.environment = EnvironmentType::Staging;
        config.log_level = "info".to_string();
        config.max_wallet_instances = 50;
        config
    }
    
    /// Create a configuration optimized for production
    pub fn for_production() -> Self {
        let mut config = Self::default();
        config.environment = EnvironmentType::Production;
        config.log_level = "warn".to_string();
        config.enable_metrics = true;
        config.database_config.encryption_enabled = true;
        config.recovery_config.verify_seed_phrase_backup = true;
        config.feature_flags.enable_experimental_features = false;
        config
    }
    
    /// Validate configuration for the current environment
    pub fn validate(&self) -> Result<(), ConfigValidationError> {
        // Validate basic constraints
        if self.max_wallet_instances == 0 {
            return Err(ConfigValidationError::InvalidValue("max_wallet_instances must be greater than 0".to_string()));
        }
        
        if self.max_concurrent_operations == 0 {
            return Err(ConfigValidationError::InvalidValue("max_concurrent_operations must be greater than 0".to_string()));
        }
        
        if self.connection_timeout_ms < 1000 {
            return Err(ConfigValidationError::InvalidValue("connection_timeout_ms should be at least 1000ms".to_string()));
        }
        
        // Environment-specific validations
        match self.environment {
            EnvironmentType::Production => {
                if !self.database_config.encryption_enabled {
                    return Err(ConfigValidationError::SecurityViolation("Database encryption must be enabled in production".to_string()));
                }
                
                if self.feature_flags.enable_experimental_features {
                    return Err(ConfigValidationError::SecurityViolation("Experimental features should not be enabled in production".to_string()));
                }
                
                if self.log_level == "debug" || self.log_level == "trace" {
                    return Err(ConfigValidationError::SecurityViolation("Debug logging should not be enabled in production".to_string()));
                }
            },
            EnvironmentType::Development => {
                // More lenient validations for development
            },
            _ => {
                // Default validations for testing/staging
            }
        }
        
        Ok(())
    }
    
    /// Apply runtime optimizations based on system resources
    pub fn optimize_for_system(&mut self) {
        let cpu_count = num_cpus::get();
        
        // Adjust connection pool size based on CPU cores
        self.database_config.max_connections = std::cmp::max(cpu_count * 2, 10);
        
        // Adjust concurrent operations based on system capacity
        self.max_concurrent_operations = std::cmp::max(cpu_count * 5, 25);
        
        // Optimize SQLite settings for the system
        self.database_config.sqlite_pragmas.cache_size = -(cpu_count as i32 * 16000); // 16MB per core
    }
}

/// Configuration validation errors
#[derive(Debug, thiserror::Error)]
pub enum ConfigValidationError {
    #[error("Invalid configuration value: {0}")]
    InvalidValue(String),
    
    #[error("Security policy violation: {0}")]
    SecurityViolation(String),
    
    #[error("Environment constraint violation: {0}")]
    EnvironmentViolation(String),
    
    #[error("Resource constraint violation: {0}")]
    ResourceViolation(String),
}
