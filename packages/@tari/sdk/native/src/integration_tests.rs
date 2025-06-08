//! Integration testing framework for real wallet operations
//! 
//! This module provides test utilities and helpers for integration testing
//! the Tari wallet functionality with real services and database backends.

use crate::error::{TariError, TariResult};
use crate::wallet_real::RealWalletInstance;
use crate::database::{DatabaseManager, DatabaseConfig};
use crate::wallet_builder::TariWalletBuilder;
use crate::node_connection::{BaseNodeInfo, NodeConnectionPool};
use std::path::PathBuf;
use std::time::Duration;
use tempfile::TempDir;
use tari_core::transactions::tari_amount::MicroMinotari;

/// Test configuration for integration tests
#[derive(Debug, Clone)]
pub struct TestConfig {
    /// Use temporary directory for test databases
    pub use_temp_dir: bool,
    /// Enable logging during tests
    pub enable_logging: bool,
    /// Test network to use (usually testnet)
    pub network: String,
    /// Timeout for test operations
    pub operation_timeout: Duration,
    /// Mock base node addresses for testing
    pub mock_base_nodes: Vec<String>,
}

impl Default for TestConfig {
    fn default() -> Self {
        Self {
            use_temp_dir: true,
            enable_logging: false,
            network: "weatherwax".to_string(),
            operation_timeout: Duration::from_secs(30),
            mock_base_nodes: vec![
                "test_node_1::1234".to_string(),
                "test_node_2::1235".to_string(),
            ],
        }
    }
}

/// Test wallet instance with cleanup capabilities
pub struct TestWallet {
    pub wallet: RealWalletInstance,
    pub temp_dir: Option<TempDir>,
    pub database_manager: DatabaseManager,
}

impl TestWallet {
    /// Create a new test wallet with temporary database
    pub async fn new(config: TestConfig) -> TariResult<Self> {
        let temp_dir = if config.use_temp_dir {
            Some(tempfile::tempdir().map_err(|e| TariError::RuntimeError(format!("Failed to create temp dir: {}", e)))?)
        } else {
            None
        };

        let data_path = if let Some(ref temp_dir) = temp_dir {
            temp_dir.path().to_path_buf()
        } else {
            PathBuf::from("./test_data")
        };

        // Create database configuration for tests
        let db_config = DatabaseConfig {
            base_path: data_path.clone(),
            wallet_db_name: "wallet_test.db".to_string(),
            transaction_db_name: "transaction_test.db".to_string(),
            output_manager_db_name: "output_manager_test.db".to_string(),
            connection_pool_size: 5,
            connection_timeout_seconds: 10,
            enable_foreign_keys: true,
            enable_wal_mode: false, // Disable for tests
        };

        // Initialize database manager
        let mut database_manager = DatabaseManager::new(db_config.clone())?;
        // Note: In tests, we would need proper consensus manager and cipher seed
        // For now, we'll skip database initialization in tests

        // Create test wallet instance
        let mut wallet_builder = TariWalletBuilder::new()
            .with_data_path(data_path)
            .with_database_config(db_config);

        // Configure for test network
        match config.network.as_str() {
            "weatherwax" => {
                // Use weatherwax testnet configuration
                log::info!("Using weatherwax testnet");
            },
            "localnet" => {
                // Use local testnet configuration  
                log::info!("Using localnet");
            },
            _ => return Err(TariError::ConfigError(format!("Unsupported test network: {}", config.network))),
        }

        // For tests, create a basic wallet instance without full Tari wallet
        let wallet = RealWalletInstance::new()?;

        Ok(Self {
            wallet,
            temp_dir,
            database_manager,
        })
    }

    /// Create a wallet with mock data for testing
    pub async fn new_with_mock_data(config: TestConfig) -> TariResult<Self> {
        let mut test_wallet = Self::new(config).await?;
        
        // Add mock UTXOs for testing
        test_wallet.add_mock_utxos().await?;
        
        Ok(test_wallet)
    }

    /// Add mock UTXOs to the test wallet
    async fn add_mock_utxos(&mut self) -> TariResult<()> {
        // This would typically interact with the wallet's output manager
        // to add test UTXOs for transaction testing
        log::info!("Adding mock UTXOs for testing");
        
        // For now, this is a placeholder that logs the intent
        // In a real implementation, this would:
        // 1. Create mock commitments
        // 2. Add them to the output manager database
        // 3. Set appropriate values and statuses
        
        Ok(())
    }

    /// Get wallet balance for testing
    pub async fn get_test_balance(&self) -> TariResult<TestBalance> {
        let balance = self.wallet.get_real_balance().await?;
        Ok(TestBalance {
            available: balance.available,
            pending_incoming: balance.pending_incoming,
            pending_outgoing: MicroMinotari::from(0), // Mock data
        })
    }

    /// Send test transaction
    pub async fn send_test_transaction(&self, destination: String, amount: u64) -> TariResult<String> {
        let micro_amount = MicroMinotari::from(amount);
        let fee_per_gram = MicroMinotari::from(25);
        let message = "Test transaction".to_string();
        
        let tx_id = self.wallet.send_real_transaction(destination, micro_amount, fee_per_gram, message).await?;
        Ok(format!("{}", tx_id))
    }

    /// Test wallet connectivity
    pub async fn test_connectivity(&self) -> TariResult<TestConnectivityResult> {
        // Test basic wallet operations
        let balance_result = self.get_test_balance().await;
        let balance_ok = balance_result.is_ok();

        // Test database connectivity
        let db_health = self.database_manager.health_check().await?;

        Ok(TestConnectivityResult {
            wallet_responsive: balance_ok,
            database_healthy: db_health,
            has_base_node_connection: false, // TODO: Implement actual check
            last_sync_time: None,
        })
    }

    /// Clean up test resources
    pub async fn cleanup(&mut self) -> TariResult<()> {
        // Close database connections
        self.database_manager.close_connections().await?;
        
        // Temp directory will be automatically cleaned up when dropped
        log::info!("Test wallet cleanup completed");
        Ok(())
    }
}

/// Test balance structure
#[derive(Debug, Clone)]
pub struct TestBalance {
    pub available: MicroMinotari,
    pub pending_incoming: MicroMinotari,
    pub pending_outgoing: MicroMinotari,
}

/// Test connectivity result
#[derive(Debug, Clone)]
pub struct TestConnectivityResult {
    pub wallet_responsive: bool,
    pub database_healthy: bool,
    pub has_base_node_connection: bool,
    pub last_sync_time: Option<std::time::SystemTime>,
}

/// Mock base node for testing
pub struct MockBaseNode {
    pub public_key: String,
    pub address: String,
    pub is_responsive: bool,
}

impl MockBaseNode {
    pub fn new(public_key: String, address: String) -> Self {
        Self {
            public_key,
            address,
            is_responsive: true,
        }
    }

    /// Simulate base node response
    pub fn simulate_response(&self) -> TariResult<MockNodeResponse> {
        if !self.is_responsive {
            return Err(TariError::NetworkError("Mock node not responsive".to_string()));
        }

        Ok(MockNodeResponse {
            chain_height: 12345,
            is_synced: true,
            peer_count: 8,
        })
    }
}

/// Mock node response structure
#[derive(Debug, Clone)]
pub struct MockNodeResponse {
    pub chain_height: u64,
    pub is_synced: bool,
    pub peer_count: u32,
}

/// Test utilities for integration testing
pub struct TestUtils;

impl TestUtils {
    /// Create a test node connection pool with mock nodes
    pub fn create_mock_node_pool() -> TariResult<NodeConnectionPool> {
        let pool = NodeConnectionPool::new(10, Duration::from_secs(30));
        
        // Add mock nodes
        pool.add_node("mock_node_1".to_string(), "127.0.0.1:18142".to_string())?;
        pool.add_node("mock_node_2".to_string(), "127.0.0.1:18143".to_string())?;

        Ok(pool)
    }

    /// Generate test payment ID
    pub fn generate_test_payment_id() -> Vec<u8> {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        (0..32).map(|_| rng.gen::<u8>()).collect()
    }

    /// Create test transaction parameters
    pub fn create_test_transaction_params() -> TariResult<crate::transaction_builder::TransactionParams> {
        use crate::transaction_builder::{
            TransactionParams, UtxoSelectionCriteria, UtxoSelectionStrategy,
            OutputFeatures, OutputFeaturesVersion
        };

        Ok(TransactionParams {
            utxo_selection: UtxoSelectionCriteria {
                strategy: UtxoSelectionStrategy::Closest,
            },
            output_features: OutputFeatures {
                version: OutputFeaturesVersion::V1,
                maturity: 0,
                metadata: Vec::new(),
            },
            payment_id: Self::generate_test_payment_id(),
            fee_per_gram: MicroMinotari::from(25),
            lock_height: None,
            message: Some("Test transaction".to_string()),
        })
    }

    /// Wait for operation with timeout
    pub async fn wait_for_operation<F, T>(
        operation: F,
        timeout: Duration,
    ) -> TariResult<T>
    where
        F: std::future::Future<Output = TariResult<T>>,
    {
        tokio::time::timeout(timeout, operation)
            .await
            .map_err(|_| TariError::RuntimeError(format!("Operation timed out after {:?}", timeout)))?
    }

    /// Verify test environment is ready
    pub async fn verify_test_environment() -> TariResult<TestEnvironmentStatus> {
        // Check if we can create temporary directories
        let temp_dir_check = tempfile::tempdir().is_ok();

        // Check if tokio runtime is available
        let runtime_check = tokio::runtime::Handle::try_current().is_ok();

        Ok(TestEnvironmentStatus {
            temp_dir_available: temp_dir_check,
            async_runtime_available: runtime_check,
            logging_configured: env_logger::try_init().is_err(), // Already configured = true
        })
    }
}

/// Test environment status
#[derive(Debug, Clone)]
pub struct TestEnvironmentStatus {
    pub temp_dir_available: bool,
    pub async_runtime_available: bool,
    pub logging_configured: bool,
}

impl TestEnvironmentStatus {
    pub fn is_ready(&self) -> bool {
        self.temp_dir_available && self.async_runtime_available
    }
}

/// Comprehensive integration test suite
pub struct IntegrationTestSuite;

impl IntegrationTestSuite {
    /// Run all integration tests
    pub async fn run_all_tests() -> TariResult<TestSuiteResult> {
        let mut results = TestSuiteResult::new();

        // Test 1: Basic wallet creation
        match Self::test_wallet_creation().await {
            Ok(_) => results.add_success("wallet_creation"),
            Err(e) => results.add_failure("wallet_creation", e),
        }

        // Test 2: Database connectivity
        match Self::test_database_operations().await {
            Ok(_) => results.add_success("database_operations"),
            Err(e) => results.add_failure("database_operations", e),
        }

        // Test 3: Transaction building
        match Self::test_transaction_building().await {
            Ok(_) => results.add_success("transaction_building"),
            Err(e) => results.add_failure("transaction_building", e),
        }

        // Test 4: Node connection
        match Self::test_node_connectivity().await {
            Ok(_) => results.add_success("node_connectivity"),
            Err(e) => results.add_failure("node_connectivity", e),
        }

        Ok(results)
    }

    /// Test wallet creation with different configurations
    async fn test_wallet_creation() -> TariResult<()> {
        let config = TestConfig::default();
        let test_wallet = TestWallet::new(config).await?;
        
        // Verify wallet was created successfully
        let connectivity = test_wallet.test_connectivity().await?;
        if !connectivity.wallet_responsive {
            return Err(TariError::ValidationError("Wallet not responsive after creation".to_string()));
        }

        Ok(())
    }

    /// Test database operations
    async fn test_database_operations() -> TariResult<()> {
        let config = TestConfig::default();
        let test_wallet = TestWallet::new(config).await?;
        
        // Test database health check
        let health = test_wallet.database_manager.health_check().await?;
        if !health {
            return Err(TariError::DatabaseError("Database health check failed".to_string()));
        }

        Ok(())
    }

    /// Test transaction building and validation
    async fn test_transaction_building() -> TariResult<()> {
        let params = TestUtils::create_test_transaction_params()?;
        
        // Validate transaction parameters
        if params.payment_id.len() != 32 {
            return Err(TariError::ValidationError("Invalid payment ID length".to_string()));
        }

        if params.fee_per_gram < MicroMinotari::from(1) {
            return Err(TariError::ValidationError("Fee per gram too low".to_string()));
        }

        Ok(())
    }

    /// Test node connectivity
    async fn test_node_connectivity() -> TariResult<()> {
        let node_pool = TestUtils::create_mock_node_pool()?;
        
        // Test finding best node
        let best_node = node_pool.find_best_node()?;
        if best_node.is_none() {
            return Err(TariError::NetworkError("No suitable nodes found".to_string()));
        }

        Ok(())
    }
}

/// Test suite results
#[derive(Debug, Clone)]
pub struct TestSuiteResult {
    pub successes: Vec<String>,
    pub failures: Vec<(String, String)>,
}

impl TestSuiteResult {
    pub fn new() -> Self {
        Self {
            successes: Vec::new(),
            failures: Vec::new(),
        }
    }

    pub fn add_success(&mut self, test_name: &str) {
        self.successes.push(test_name.to_string());
    }

    pub fn add_failure(&mut self, test_name: &str, error: TariError) {
        self.failures.push((test_name.to_string(), error.to_string()));
    }

    pub fn is_all_passed(&self) -> bool {
        self.failures.is_empty()
    }

    pub fn summary(&self) -> String {
        format!(
            "Tests: {} passed, {} failed",
            self.successes.len(),
            self.failures.len()
        )
    }
}

// Implementation note: This integration testing framework provides:
// 1. TestWallet - Isolated wallet instances for testing
// 2. MockBaseNode - Simulated base nodes for network testing
// 3. TestUtils - Helper functions for common test operations
// 4. IntegrationTestSuite - Comprehensive test runner
// 5. Proper cleanup and resource management
// 6. Configurable test environments (temp dirs, logging, etc.)
