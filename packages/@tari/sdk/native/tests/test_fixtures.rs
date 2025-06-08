use std::collections::HashMap;

/// Test fixtures for different wallet configurations and scenarios
pub struct TestFixtures;

impl TestFixtures {
    /// Generate mainnet wallet configuration
    pub fn mainnet_wallet_config() -> WalletConfigFixture {
        WalletConfigFixture {
            network: "mainnet".to_string(),
            db_path: "/tmp/tari_mainnet_test".to_string(),
            passphrase: "mainnet_test_passphrase".to_string(),
            peer_seeds: vec![
                "/dns4/seeds.tari.com/tcp/18141/p2p/12D3KooWRyMTdKGNdALpHBZy1S4FphnE4GnHoTvLqVR1LtRE1hnT".to_string(),
                "/dns4/seeds2.tari.com/tcp/18141/p2p/12D3KooWSomeOtherPeerId12345".to_string(),
            ],
            max_peers: 50,
            connection_timeout_ms: 30000,
            heartbeat_interval_ms: 60000,
        }
    }

    /// Generate testnet wallet configuration
    pub fn testnet_wallet_config() -> WalletConfigFixture {
        WalletConfigFixture {
            network: "testnet".to_string(),
            db_path: "/tmp/tari_testnet_test".to_string(),
            passphrase: "testnet_test_passphrase".to_string(),
            peer_seeds: vec![
                "/ip4/127.0.0.1/tcp/18189/p2p/12D3KooWTestnetPeerId".to_string(),
            ],
            max_peers: 20,
            connection_timeout_ms: 15000,
            heartbeat_interval_ms: 30000,
        }
    }

    /// Generate localnet wallet configuration for development
    pub fn localnet_wallet_config() -> WalletConfigFixture {
        WalletConfigFixture {
            network: "localnet".to_string(),
            db_path: "/tmp/tari_localnet_test".to_string(),
            passphrase: "localnet_test_passphrase".to_string(),
            peer_seeds: vec![],
            max_peers: 5,
            connection_timeout_ms: 5000,
            heartbeat_interval_ms: 10000,
        }
    }

    /// Generate a set of valid private keys for testing
    pub fn test_private_keys() -> Vec<String> {
        vec![
            "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b".to_string(),
            "2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c".to_string(),
            "3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d".to_string(),
            "4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e".to_string(),
            "5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f".to_string(),
        ]
    }

    /// Generate invalid private keys for error testing
    pub fn invalid_private_keys() -> Vec<String> {
        vec![
            "invalid_hex".to_string(),
            "".to_string(),
            "too_short".to_string(),
            "1234567890abcdef".to_string(), // Too short
            "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz".to_string(), // Invalid hex chars
        ]
    }

    /// Generate test transaction fixtures
    pub fn test_transactions() -> Vec<TransactionFixture> {
        vec![
            TransactionFixture {
                destination: "f2ca31b57b8a5af8e56d68a3cf9c18815f43f9b1d1b2a8c8f7e9a5f7c3e4d1a2".to_string(),
                amount: 1000000, // 1 XTR
                fee_per_gram: 25,
                message: "Payment for services".to_string(),
            },
            TransactionFixture {
                destination: "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890".to_string(),
                amount: 5000000, // 5 XTR
                fee_per_gram: 50,
                message: "Monthly salary".to_string(),
            },
            TransactionFixture {
                destination: "9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba".to_string(),
                amount: 100000, // 0.1 XTR
                fee_per_gram: 20,
                message: "Coffee money".to_string(),
            },
        ]
    }

    /// Generate test UTXO fixtures
    pub fn test_utxos() -> Vec<UtxoFixture> {
        vec![
            UtxoFixture {
                commitment: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2".to_string(),
                value: 1000000,
                script: "PushInt(42) CheckHeight".to_string(),
                input_data: "".to_string(),
                script_private_key: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b".to_string(),
                spending_key: "2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c".to_string(),
                maturity: 0,
                status: "unspent".to_string(),
            },
            UtxoFixture {
                commitment: "b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3".to_string(),
                value: 5000000,
                script: "PushPubKey(test_key) CheckSig".to_string(),
                input_data: "signature_data".to_string(),
                script_private_key: "3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d".to_string(),
                spending_key: "4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e".to_string(),
                maturity: 100,
                status: "unspent".to_string(),
            },
        ]
    }

    /// Generate test peer fixtures
    pub fn test_peers() -> Vec<PeerFixture> {
        vec![
            PeerFixture {
                public_key: "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890".to_string(),
                address: "/ip4/192.168.1.100/tcp/18141".to_string(),
                net_address: "192.168.1.100:18141".to_string(),
                node_id: "peer_node_1".to_string(),
                last_seen: 1640995200, // Unix timestamp
                connection_attempts: 3,
                rejected_message_count: 0,
                avg_latency: 50,
                status: "online".to_string(),
            },
            PeerFixture {
                public_key: "b2c3d4e5f6789012345678901234567890123456789012345678901234567890a1".to_string(),
                address: "/ip4/10.0.0.50/tcp/18141".to_string(),
                net_address: "10.0.0.50:18141".to_string(),
                node_id: "peer_node_2".to_string(),
                last_seen: 1640991600,
                connection_attempts: 1,
                rejected_message_count: 2,
                avg_latency: 120,
                status: "offline".to_string(),
            },
        ]
    }

    /// Generate test seed phrases for wallet recovery
    pub fn test_seed_phrases() -> Vec<String> {
        vec![
            "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about".to_string(),
            "legal winner thank year wave sausage worth useful legal winner thank yellow".to_string(),
            "letter advice cage absurd amount doctor acoustic avoid letter advice cage above".to_string(),
        ]
    }

    /// Generate test error scenarios
    pub fn error_scenarios() -> HashMap<String, ErrorScenario> {
        let mut scenarios = HashMap::new();

        scenarios.insert("invalid_private_key".to_string(), ErrorScenario {
            description: "Invalid private key hex string".to_string(),
            input: "invalid_hex_key".to_string(),
            expected_error: "InvalidHexString".to_string(),
        });

        scenarios.insert("invalid_handle".to_string(), ErrorScenario {
            description: "Using destroyed or invalid handle".to_string(),
            input: "99999".to_string(),
            expected_error: "InvalidHandle".to_string(),
        });

        scenarios.insert("insufficient_funds".to_string(), ErrorScenario {
            description: "Attempting to send more than wallet balance".to_string(),
            input: "999999999999".to_string(), // Very large amount
            expected_error: "InsufficientFunds".to_string(),
        });

        scenarios.insert("invalid_address".to_string(), ErrorScenario {
            description: "Invalid destination address format".to_string(),
            input: "not_a_valid_address".to_string(),
            expected_error: "InvalidAddress".to_string(),
        });

        scenarios
    }

    /// Generate performance test scenarios
    pub fn performance_scenarios() -> Vec<PerformanceScenario> {
        vec![
            PerformanceScenario {
                name: "key_generation_bulk".to_string(),
                description: "Generate 1000 private keys in sequence".to_string(),
                iterations: 1000,
                expected_max_time_ms: 5000,
                operation_type: "key_generation".to_string(),
            },
            PerformanceScenario {
                name: "wallet_creation_bulk".to_string(),
                description: "Create and destroy 100 wallets".to_string(),
                iterations: 100,
                expected_max_time_ms: 30000,
                operation_type: "wallet_lifecycle".to_string(),
            },
            PerformanceScenario {
                name: "concurrent_operations".to_string(),
                description: "Perform 50 concurrent key operations".to_string(),
                iterations: 50,
                expected_max_time_ms: 10000,
                operation_type: "concurrent".to_string(),
            },
        ]
    }
}

// Fixture data structures
#[derive(Debug, Clone)]
pub struct WalletConfigFixture {
    pub network: String,
    pub db_path: String,
    pub passphrase: String,
    pub peer_seeds: Vec<String>,
    pub max_peers: u32,
    pub connection_timeout_ms: u64,
    pub heartbeat_interval_ms: u64,
}

#[derive(Debug, Clone)]
pub struct TransactionFixture {
    pub destination: String,
    pub amount: u64,
    pub fee_per_gram: u64,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct UtxoFixture {
    pub commitment: String,
    pub value: u64,
    pub script: String,
    pub input_data: String,
    pub script_private_key: String,
    pub spending_key: String,
    pub maturity: u64,
    pub status: String,
}

#[derive(Debug, Clone)]
pub struct PeerFixture {
    pub public_key: String,
    pub address: String,
    pub net_address: String,
    pub node_id: String,
    pub last_seen: u64,
    pub connection_attempts: u32,
    pub rejected_message_count: u32,
    pub avg_latency: u32,
    pub status: String,
}

#[derive(Debug, Clone)]
pub struct ErrorScenario {
    pub description: String,
    pub input: String,
    pub expected_error: String,
}

#[derive(Debug, Clone)]
pub struct PerformanceScenario {
    pub name: String,
    pub description: String,
    pub iterations: u32,
    pub expected_max_time_ms: u64,
    pub operation_type: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fixtures_mainnet_config() {
        let config = TestFixtures::mainnet_wallet_config();
        assert_eq!(config.network, "mainnet");
        assert!(config.peer_seeds.len() > 0);
        assert_eq!(config.max_peers, 50);
    }

    #[test]
    fn test_fixtures_private_keys() {
        let keys = TestFixtures::test_private_keys();
        assert_eq!(keys.len(), 5);
        for key in keys {
            assert_eq!(key.len(), 64); // 256 bits = 64 hex chars
        }
    }

    #[test]
    fn test_fixtures_transactions() {
        let transactions = TestFixtures::test_transactions();
        assert!(transactions.len() > 0);
        for tx in transactions {
            assert!(tx.amount > 0);
            assert!(tx.fee_per_gram > 0);
            assert!(!tx.destination.is_empty());
        }
    }

    #[test]
    fn test_fixtures_error_scenarios() {
        let scenarios = TestFixtures::error_scenarios();
        assert!(scenarios.contains_key("invalid_private_key"));
        assert!(scenarios.contains_key("invalid_handle"));
        assert!(scenarios.contains_key("insufficient_funds"));
    }

    #[test]
    fn test_fixtures_performance_scenarios() {
        let scenarios = TestFixtures::performance_scenarios();
        assert!(scenarios.len() > 0);
        for scenario in scenarios {
            assert!(scenario.iterations > 0);
            assert!(scenario.expected_max_time_ms > 0);
        }
    }
}
