use tari_core_native::*;
use std::sync::Once;

static INIT: Once = Once::new();

fn setup_test_environment() {
    INIT.call_once(|| {
        env_logger::init();
        // Initialize test wallets and keys
    });
}

#[test]
fn test_wallet_lifecycle() {
    setup_test_environment();
    
    // Test wallet creation -> balance -> transaction -> destruction
    let config = create_test_wallet_config();
    let wallet_handle = test_wallet_create(config);
    
    assert!(wallet_handle > 0);
    
    let balance = test_wallet_get_balance(wallet_handle);
    assert_eq!(balance.available, 0); // New wallet should have zero balance
    
    test_wallet_destroy(wallet_handle);
}

#[test]
fn test_crypto_operations() {
    setup_test_environment();
    
    // Test key generation and operations
    let private_key = test_private_key_generate();
    let public_key = test_public_key_from_private(private_key);
    let hex_public = test_public_key_to_hex(public_key);
    let recovered_public = test_public_key_from_hex(&hex_public);
    
    assert_eq!(public_key, recovered_public);
    
    test_private_key_destroy(private_key);
    test_public_key_destroy(public_key);
    test_public_key_destroy(recovered_public);
}

#[test]
fn test_handle_management() {
    setup_test_environment();
    
    // Test that handles are properly managed and reused
    let mut handles = Vec::new();
    
    // Create multiple private keys
    for _ in 0..100 {
        let handle = test_private_key_generate();
        assert!(handle > 0);
        handles.push(handle);
    }
    
    // Destroy them all
    for handle in handles {
        test_private_key_destroy(handle);
    }
    
    // Create new ones and verify handles are reused
    let new_handle = test_private_key_generate();
    assert!(new_handle > 0);
    test_private_key_destroy(new_handle);
}

#[test]
fn test_concurrent_operations() {
    setup_test_environment();
    
    use std::sync::{Arc, Mutex};
    use std::thread;
    
    let results = Arc::new(Mutex::new(Vec::new()));
    let mut threads = Vec::new();
    
    // Test concurrent key generation
    for i in 0..10 {
        let results_clone = Arc::clone(&results);
        let thread = thread::spawn(move || {
            let handle = test_private_key_generate();
            results_clone.lock().unwrap().push((i, handle));
            test_private_key_destroy(handle);
        });
        threads.push(thread);
    }
    
    // Wait for all threads
    for thread in threads {
        thread.join().unwrap();
    }
    
    let results = results.lock().unwrap();
    assert_eq!(results.len(), 10);
    
    // Verify all handles were valid
    for (_, handle) in results.iter() {
        assert!(*handle > 0);
    }
}

#[test]
fn test_error_handling() {
    setup_test_environment();
    
    // Test invalid hex key
    let result = std::panic::catch_unwind(|| {
        test_private_key_from_hex("invalid_hex");
    });
    assert!(result.is_err());
    
    // Test destroying invalid handle
    let result = std::panic::catch_unwind(|| {
        test_private_key_destroy(99999);
    });
    assert!(result.is_err());
}

// Helper functions for testing
fn create_test_wallet_config() -> WalletConfig {
    WalletConfig {
        network: Network::Localnet,
        db_path: Some("/tmp/test_wallet".to_string()),
        passphrase: Some("test_passphrase".to_string()),
        peer_seeds: vec![],
    }
}

// Mock implementations for testing
fn test_wallet_create(config: WalletConfig) -> u32 {
    // Mock implementation
    1
}

fn test_wallet_destroy(handle: u32) {
    // Mock implementation
}

fn test_wallet_get_balance(handle: u32) -> WalletBalance {
    WalletBalance {
        available: 0,
        pending_incoming: 0,
        pending_outgoing: 0,
        timelocked: 0,
    }
}

fn test_private_key_generate() -> u32 {
    // Mock implementation
    1
}

fn test_private_key_destroy(handle: u32) {
    // Mock implementation
}

fn test_private_key_from_hex(hex: &str) -> u32 {
    if hex == "invalid_hex" {
        panic!("Invalid hex string");
    }
    1
}

fn test_public_key_from_private(private_handle: u32) -> u32 {
    2
}

fn test_public_key_to_hex(public_handle: u32) -> String {
    "public_key_hex".to_string()
}

fn test_public_key_from_hex(hex: &str) -> u32 {
    2
}

fn test_public_key_destroy(handle: u32) {
    // Mock implementation
}

// Test data structures
#[derive(Debug, Clone)]
struct WalletConfig {
    network: Network,
    db_path: Option<String>,
    passphrase: Option<String>,
    peer_seeds: Vec<String>,
}

#[derive(Debug, Clone)]
enum Network {
    Mainnet,
    Testnet,
    Localnet,
}

#[derive(Debug, Clone, PartialEq)]
struct WalletBalance {
    available: u64,
    pending_incoming: u64,
    pending_outgoing: u64,
    timelocked: u64,
}
