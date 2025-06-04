mod error;
mod types;
mod utils;
mod wallet;
mod crypto;

use neon::prelude::*;
use crate::error::safe_execute;

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
    
    // TODO: Implement remaining functions
    // - Mining operations (walletCoinSplit, walletCoinJoin)
    // - Recovery operations (walletStartRecovery, walletIsRecoveryInProgress)
    // - P2P operations (walletGetPeers, walletAddPeer, walletBanPeer)
    // - Advanced features (createCovenant, compileScript)
    // - Callback management
    
    Ok(())
}

fn initialize(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    safe_execute(&mut cx, || {
        log::info!("Tari Core Native module initialized successfully");
        Ok(cx.undefined())
    })
}
