// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::State;
use tracing::{info, error};

mod commands;
mod wallet;
mod storage;
mod error;

use commands::*;
use wallet::WalletManager;
use storage::SecureStorage;
use error::Result;

/// Global application state
pub struct AppState {
    wallet_manager: Mutex<WalletManager>,
    secure_storage: Mutex<SecureStorage>,
}

impl AppState {
    fn new() -> Self {
        Self {
            wallet_manager: Mutex::new(WalletManager::new()),
            secure_storage: Mutex::new(SecureStorage::new()),
        }
    }
}

fn main() {
    // Initialize tracing for logging
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    info!("Starting Tari Wallet Application");

    // Create application state
    let app_state = AppState::new();

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            // Wallet commands
            wallet_initialize,
            wallet_get_balance,
            wallet_get_address,
            wallet_send_transaction,
            wallet_get_transactions,
            wallet_get_status,
            wallet_destroy,
            validate_address,
            // Storage commands
            secure_storage_store,
            secure_storage_retrieve,
            secure_storage_remove,
            secure_storage_exists,
            secure_storage_list,
            secure_storage_get_metadata,
            secure_storage_clear,
            secure_storage_get_info,
            secure_storage_test,
            // Platform commands
            get_platform_info
        ])
        .setup(|app| {
            info!("Tauri application setup complete");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
