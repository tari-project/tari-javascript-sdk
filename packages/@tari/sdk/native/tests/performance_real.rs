use std::time::{Duration, Instant};
use tari_core_native::wallet_real::RealWalletInstance;
use tari_core_native::utils::{WalletConfig, Network};
use tempfile::TempDir;

/// Performance tests for real Tari wallet operations
#[cfg(test)]
mod tests {
    use super::*;

    /// Performance benchmark for wallet creation
    #[tokio::test]
    async fn benchmark_wallet_creation() {
        let start = Instant::now();
        
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let config = WalletConfig {
            seed_words: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about".to_string(),
            network: Network::Localnet,
            db_path: Some(temp_dir.path().to_string_lossy().to_string()),
            db_name: Some("benchmark_creation.db".to_string()),
            passphrase: Some("test_passphrase".to_string()),
        };

        let wallet = RealWalletInstance::create_real_wallet(config).await
            .expect("Failed to create wallet");

        let creation_time = start.elapsed();
        println!("Wallet creation took: {:?}", creation_time);
        
        // Wallet creation should complete within reasonable time
        assert!(creation_time < Duration::from_secs(30), 
                "Wallet creation took too long: {:?}", creation_time);
    }

    /// Performance benchmark for balance operations
    #[tokio::test]
    async fn benchmark_balance_operations() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let config = WalletConfig {
            seed_words: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about".to_string(),
            network: Network::Localnet,
            db_path: Some(temp_dir.path().to_string_lossy().to_string()),
            db_name: Some("benchmark_balance.db".to_string()),
            passphrase: Some("test_passphrase".to_string()),
        };

        let wallet = RealWalletInstance::create_real_wallet(config).await
            .expect("Failed to create wallet");

        // Benchmark multiple balance calls
        let start = Instant::now();
        let iterations = 100;
        
        for _ in 0..iterations {
            let _ = wallet.get_real_balance().await
                .expect("Failed to get balance");
        }
        
        let total_time = start.elapsed();
        let avg_time = total_time / iterations;
        
        println!("Average balance operation time: {:?}", avg_time);
        println!("Total time for {} operations: {:?}", iterations, total_time);
        
        // Each balance operation should be fast
        assert!(avg_time < Duration::from_millis(100), 
                "Balance operation too slow: {:?}", avg_time);
    }

    /// Performance benchmark for address operations
    #[tokio::test]
    async fn benchmark_address_operations() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let config = WalletConfig {
            seed_words: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about".to_string(),
            network: Network::Localnet,
            db_path: Some(temp_dir.path().to_string_lossy().to_string()),
            db_name: Some("benchmark_address.db".to_string()),
            passphrase: Some("test_passphrase".to_string()),
        };

        let wallet = RealWalletInstance::create_real_wallet(config).await
            .expect("Failed to create wallet");

        // Benchmark address retrieval
        let start = Instant::now();
        let iterations = 50;
        
        for _ in 0..iterations {
            let _ = wallet.get_wallet_address().await
                .expect("Failed to get address");
            let _ = wallet.get_wallet_emoji_id().await
                .expect("Failed to get emoji ID");
        }
        
        let total_time = start.elapsed();
        let avg_time = total_time / (iterations * 2); // 2 operations per iteration
        
        println!("Average address operation time: {:?}", avg_time);
        
        // Address operations should be fast since they're mostly computational
        assert!(avg_time < Duration::from_millis(50), 
                "Address operation too slow: {:?}", avg_time);
    }

    /// Performance benchmark for UTXO operations
    #[tokio::test]
    async fn benchmark_utxo_operations() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let config = WalletConfig {
            seed_words: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about".to_string(),
            network: Network::Localnet,
            db_path: Some(temp_dir.path().to_string_lossy().to_string()),
            db_name: Some("benchmark_utxo.db".to_string()),
            passphrase: Some("test_passphrase".to_string()),
        };

        let wallet = RealWalletInstance::create_real_wallet(config).await
            .expect("Failed to create wallet");

        // Benchmark UTXO retrieval with different page sizes
        let page_sizes = vec![10, 50, 100];
        
        for page_size in page_sizes {
            let start = Instant::now();
            let iterations = 20;
            
            for _ in 0..iterations {
                let _ = wallet.get_real_utxos(0, page_size).await
                    .expect("Failed to get UTXOs");
            }
            
            let total_time = start.elapsed();
            let avg_time = total_time / iterations;
            
            println!("Average UTXO operation time (page size {}): {:?}", page_size, avg_time);
            
            // UTXO operations should scale reasonably with page size
            let max_time = Duration::from_millis(200 + (page_size as u64 * 2));
            assert!(avg_time < max_time, 
                    "UTXO operation too slow for page size {}: {:?}", page_size, avg_time);
        }
    }

    /// Memory usage benchmark
    #[tokio::test]
    async fn benchmark_memory_usage() {
        let start_memory = get_memory_usage();
        
        // Create multiple wallets to test memory usage
        let mut wallets = Vec::new();
        
        for i in 0..10 {
            let temp_dir = TempDir::new().expect("Failed to create temp directory");
            let config = WalletConfig {
                seed_words: format!("test seed for wallet {}", i),
                network: Network::Localnet,
                db_path: Some(temp_dir.path().to_string_lossy().to_string()),
                db_name: Some(format!("benchmark_memory_{}.db", i)),
                passphrase: Some("test_passphrase".to_string()),
            };

            let wallet = RealWalletInstance::create_real_wallet(config).await
                .expect("Failed to create wallet");
                
            wallets.push(wallet);
            
            // Perform some operations to ensure full initialization
            if let Some(wallet) = wallets.last() {
                let _ = wallet.get_real_balance().await;
                let _ = wallet.get_wallet_address().await;
            }
        }
        
        let peak_memory = get_memory_usage();
        
        // Clear all wallets
        wallets.clear();
        
        // Give time for cleanup
        tokio::time::sleep(Duration::from_millis(500)).await;
        
        let end_memory = get_memory_usage();
        
        println!("Memory usage - Start: {}KB, Peak: {}KB, End: {}KB", 
                start_memory, peak_memory, end_memory);
        
        // Memory should not grow excessively
        let memory_growth = peak_memory.saturating_sub(start_memory);
        assert!(memory_growth < 100_000, // 100MB limit
                "Memory usage grew too much: {}KB", memory_growth);
        
        // Memory should be mostly cleaned up
        let memory_leak = end_memory.saturating_sub(start_memory);
        assert!(memory_leak < 10_000, // 10MB leak tolerance
                "Potential memory leak detected: {}KB", memory_leak);
    }

    /// Concurrent operations performance
    #[tokio::test]
    async fn benchmark_concurrent_operations() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let config = WalletConfig {
            seed_words: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about".to_string(),
            network: Network::Localnet,
            db_path: Some(temp_dir.path().to_string_lossy().to_string()),
            db_name: Some("benchmark_concurrent.db".to_string()),
            passphrase: Some("test_passphrase".to_string()),
        };

        let wallet = std::sync::Arc::new(
            RealWalletInstance::create_real_wallet(config).await
                .expect("Failed to create wallet")
        );

        // Benchmark concurrent operations
        let start = Instant::now();
        let concurrent_tasks = 20;
        
        let mut handles = Vec::new();
        
        for _ in 0..concurrent_tasks {
            let wallet_clone = wallet.clone();
            let handle = tokio::spawn(async move {
                let _ = wallet_clone.get_real_balance().await;
                let _ = wallet_clone.get_wallet_address().await;
                let _ = wallet_clone.get_real_utxos(0, 10).await;
            });
            handles.push(handle);
        }
        
        // Wait for all tasks to complete
        for handle in handles {
            handle.await.expect("Task failed");
        }
        
        let total_time = start.elapsed();
        let avg_time = total_time / concurrent_tasks;
        
        println!("Concurrent operations - Total: {:?}, Average: {:?}", total_time, avg_time);
        
        // Concurrent operations should not be much slower than sequential
        assert!(total_time < Duration::from_secs(10), 
                "Concurrent operations took too long: {:?}", total_time);
    }

    /// Get approximate memory usage in KB
    fn get_memory_usage() -> u64 {
        // This is a simplified memory usage estimation
        // In a real implementation, you might use more sophisticated memory tracking
        use std::process;
        
        #[cfg(target_os = "linux")]
        {
            if let Ok(status) = std::fs::read_to_string("/proc/self/status") {
                for line in status.lines() {
                    if line.starts_with("VmRSS:") {
                        if let Some(kb_str) = line.split_whitespace().nth(1) {
                            return kb_str.parse().unwrap_or(0);
                        }
                    }
                }
            }
        }
        
        #[cfg(target_os = "macos")]
        {
            // On macOS, we'd need to use mach APIs or ps command
            // For simplicity, return a dummy value
            return 0;
        }
        
        #[cfg(target_os = "windows")]
        {
            // On Windows, we'd need to use Windows APIs
            // For simplicity, return a dummy value
            return 0;
        }
        
        0 // Fallback
    }
}
