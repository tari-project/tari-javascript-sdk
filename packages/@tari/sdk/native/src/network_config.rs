use serde::{Deserialize, Serialize};
use tari_common::configuration::Network;
use tari_core::consensus::{ConsensusManager, ConsensusManagerBuilder};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkConfig {
    pub network: Network,
    pub base_node_addresses: Vec<String>,
    pub default_port: u16,
    pub wallet_db_path: String,
    pub blockchain_db_path: String,
    pub p2p_config: P2PConfig,
    pub dns_seeds: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct P2PConfig {
    pub max_connections: usize,
    pub connection_timeout_secs: u64,
    pub ping_interval_secs: u64,
    pub max_message_size: usize,
}

impl Default for P2PConfig {
    fn default() -> Self {
        Self {
            max_connections: 100,
            connection_timeout_secs: 30,
            ping_interval_secs: 60,
            max_message_size: 1024 * 1024, // 1MB
        }
    }
}

impl NetworkConfig {
    pub fn mainnet() -> Self {
        Self {
            network: Network::MainNet,
            base_node_addresses: vec![
                "5cffa1a0d4c9d0b6e5f4a2c8f1e9d8b7a6c5e4f3::18142".to_string(),
                "mainnet.tari.com:18142".to_string(),
                "public.tari.com:18142".to_string(),
            ],
            default_port: 18142,
            wallet_db_path: "mainnet/wallet.db".to_string(),
            blockchain_db_path: "mainnet/blockchain.db".to_string(),
            p2p_config: P2PConfig::default(),
            dns_seeds: vec![
                "seeds.tari.com".to_string(),
                "mainnet-seeds.tari.com".to_string(),
            ],
        }
    }

    pub fn stagenet() -> Self {
        Self {
            network: Network::StageNet,
            base_node_addresses: vec![
                "stagenet.tari.com:18142".to_string(),
                "staging.tari.com:18142".to_string(),
            ],
            default_port: 18142,
            wallet_db_path: "stagenet/wallet.db".to_string(),
            blockchain_db_path: "stagenet/blockchain.db".to_string(),
            p2p_config: P2PConfig::default(),
            dns_seeds: vec![
                "stagenet-seeds.tari.com".to_string(),
            ],
        }
    }

    pub fn nextnet() -> Self {
        Self {
            network: Network::NextNet,
            base_node_addresses: vec![
                "nextnet.tari.com:18142".to_string(),
                "next.tari.com:18142".to_string(),
            ],
            default_port: 18142,
            wallet_db_path: "nextnet/wallet.db".to_string(),
            blockchain_db_path: "nextnet/blockchain.db".to_string(),
            p2p_config: P2PConfig::default(),
            dns_seeds: vec![
                "nextnet-seeds.tari.com".to_string(),
            ],
        }
    }

    pub fn testnet() -> Self {
        Self {
            network: Network::LocalNet,
            base_node_addresses: vec![
                "127.0.0.1:18142".to_string(),
                "localhost:18142".to_string(),
            ],
            default_port: 18142,
            wallet_db_path: "testnet/wallet.db".to_string(),
            blockchain_db_path: "testnet/blockchain.db".to_string(),
            p2p_config: P2PConfig::default(),
            dns_seeds: vec![],
        }
    }

    pub fn get_consensus_manager(&self) -> Result<ConsensusManager, String> {
        ConsensusManagerBuilder::new(self.network).build()
            .map_err(|e| format!("Failed to build consensus manager: {}", e))
    }

    pub async fn resolve_dns_seeds(&self) -> Result<Vec<String>, anyhow::Error> {
        let mut resolved_addresses = Vec::new();
        
        for seed in &self.dns_seeds {
            // In a real implementation, this would perform DNS resolution
            // For now, we'll add placeholder logic
            match tokio::net::lookup_host(format!("{}:18142", seed)).await {
                Ok(addresses) => {
                    for addr in addresses {
                        resolved_addresses.push(addr.to_string());
                    }
                }
                Err(e) => {
                    log::warn!("Failed to resolve DNS seed {}: {}", seed, e);
                }
            }
        }
        
        Ok(resolved_addresses)
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.base_node_addresses.is_empty() {
            return Err("No base node addresses configured".to_string());
        }
        
        if self.wallet_db_path.is_empty() {
            return Err("Wallet database path not configured".to_string());
        }
        
        if self.blockchain_db_path.is_empty() {
            return Err("Blockchain database path not configured".to_string());
        }
        
        Ok(())
    }
}

pub fn get_network_config(network: Network) -> NetworkConfig {
    match network {
        Network::MainNet => NetworkConfig::mainnet(),
        Network::StageNet => NetworkConfig::stagenet(), 
        Network::NextNet => NetworkConfig::nextnet(),
        Network::LocalNet => NetworkConfig::testnet(),
        Network::Igor => NetworkConfig::testnet(), // Use testnet config for Igor
        Network::Esmeralda => NetworkConfig::testnet(), // Use testnet config for Esmeralda
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mainnet_config() {
        let config = NetworkConfig::mainnet();
        assert_eq!(config.network, Network::MainNet);
        assert!(!config.base_node_addresses.is_empty());
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_stagenet_config() {
        let config = NetworkConfig::stagenet();
        assert_eq!(config.network, Network::StageNet);
        assert!(!config.base_node_addresses.is_empty());
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_config_validation() {
        let mut config = NetworkConfig::mainnet();
        
        // Test empty addresses
        config.base_node_addresses.clear();
        assert!(config.validate().is_err());
        
        // Test empty wallet path
        config = NetworkConfig::mainnet();
        config.wallet_db_path.clear();
        assert!(config.validate().is_err());
    }
}
