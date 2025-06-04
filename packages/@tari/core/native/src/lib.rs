mod error;
mod types;
mod utils;
mod wallet;
mod wallet_real;
mod crypto;
mod advanced;
mod callbacks;
mod performance;
mod runtime_pool;
mod config;
mod health;

use neon::prelude::*;

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    // Initialize logging
    env_logger::init();
    
    // Core functions
    cx.export_function("initialize", initialize)?;
    
    // Wallet lifecycle functions
    cx.export_function("walletCreate", wallet::wallet_create)?;
    cx.export_function("walletDestroy", wallet::wallet_destroy)?;
    cx.export_function("walletGetSeedWords", wallet::wallet_get_seed_words)?;
    cx.export_function("walletGetBalance", wallet::wallet_get_balance)?;
    cx.export_function("walletGetAddress", wallet::wallet_get_address)?;
    cx.export_function("walletSendTransaction", wallet::wallet_send_transaction)?;
    cx.export_function("walletGetUtxos", wallet::wallet_get_utxos)?;
    cx.export_function("walletImportUtxo", wallet::wallet_import_utxo)?;
    
    // Cryptographic functions
    cx.export_function("privateKeyGenerate", crypto::private_key_generate)?;
    cx.export_function("privateKeyFromHex", crypto::private_key_from_hex)?;
    cx.export_function("privateKeyDestroy", crypto::private_key_destroy)?;
    cx.export_function("publicKeyFromPrivateKey", crypto::public_key_from_private_key)?;
    cx.export_function("publicKeyFromHex", crypto::public_key_from_hex)?;
    cx.export_function("publicKeyDestroy", crypto::public_key_destroy)?;
    
    // Address management
    cx.export_function("addressDestroy", crypto::address_destroy)?;
    
    // Mining operations  
    cx.export_function("walletCoinSplit", wallet::wallet_coin_split)?;
    cx.export_function("walletCoinJoin", wallet::wallet_coin_join)?;
    
    // Recovery operations
    cx.export_function("walletStartRecovery", wallet::wallet_start_recovery)?;
    cx.export_function("walletIsRecoveryInProgress", wallet::wallet_is_recovery_in_progress)?;
    
    // P2P operations
    cx.export_function("walletGetPeers", wallet::wallet_get_peers)?;
    cx.export_function("walletAddPeer", wallet::wallet_add_peer)?;
    cx.export_function("walletBanPeer", wallet::wallet_ban_peer)?;
    
    // Advanced features
    cx.export_function("createCovenant", advanced::create_covenant)?;
    cx.export_function("covenantDestroy", advanced::covenant_destroy)?;
    cx.export_function("compileScript", advanced::compile_script)?;
    cx.export_function("scriptDestroy", advanced::script_destroy)?;
    cx.export_function("executeScript", advanced::execute_script)?;
    cx.export_function("getScriptInfo", advanced::get_script_info)?;
    
    // Callback management
    cx.export_function("registerCallback", callbacks::register_callback)?;
    cx.export_function("unregisterCallback", callbacks::unregister_callback)?;
    cx.export_function("clearAllCallbacks", callbacks::clear_all_callbacks)?;
    cx.export_function("getCallbackCount", callbacks::get_callback_count)?;
    cx.export_function("testCallback", callbacks::test_callback)?;
    
    // Health monitoring
    cx.export_function("getHealthStatus", health::get_health_status)?;
    cx.export_function("getHealthCheck", health::get_health_check)?;
    
    Ok(())
}

fn initialize(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    log::info!("Tari Core Native module initialized successfully");
    Ok(cx.undefined())
}
