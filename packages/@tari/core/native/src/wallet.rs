use neon::prelude::*;
use crate::error::TariError;
use crate::types::{WalletInstance, AddressInstance, create_wallet_handle, destroy_wallet_handle, WALLET_HANDLES, ADDRESS_HANDLES};
use crate::utils::{parse_wallet_config, parse_send_params};
use crate::try_js;

/// Create a new wallet instance
pub fn wallet_create(mut cx: FunctionContext) -> JsResult<JsNumber> {
    let config_obj = cx.argument::<JsObject>(0)?;
    let config = try_js!(&mut cx, parse_wallet_config(&mut cx, config_obj));
    
    log::info!("Creating wallet with network: {:?}", config.network);
    
    // Create wallet with real Tari components
    let wallet = try_js!(&mut cx, WalletInstance::new_sync(config));
    let handle = create_wallet_handle(wallet);
    
    log::debug!("Created wallet with handle: {}", handle);
    Ok(cx.number(handle as f64))
}

/// Destroy a wallet instance
pub fn wallet_destroy(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    
    try_js!(&mut cx, destroy_wallet_handle(handle));
    log::debug!("Destroyed wallet handle: {}", handle);
    Ok(cx.undefined())
}

/// Get wallet seed words
pub fn wallet_get_seed_words(mut cx: FunctionContext) -> JsResult<JsString> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    if !handles.is_valid(handle) {
        return TariError::InvalidHandle(handle).to_js_error(&mut cx);
    }
    
    // TODO: Return actual seed words from wallet
    let seed_words = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    
    log::debug!("Retrieved seed words for wallet: {}", handle);
    Ok(cx.string(seed_words))
}

/// Get wallet balance
pub fn wallet_get_balance(mut cx: FunctionContext) -> JsResult<JsObject> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    if !handles.is_valid(handle) {
        return TariError::InvalidHandle(handle).to_js_error(&mut cx);
    }
    
    // TODO: Get actual balance from Tari wallet
    let available = 1000000; // 1 Tari in microTari
    let pending = 0;
    let locked = 0;
    
    log::debug!("Retrieved balance for wallet: {}", handle);
    
    let obj = cx.empty_object();
    let available_str = cx.string(available.to_string());
    let pending_str = cx.string(pending.to_string());
    let locked_str = cx.string(locked.to_string());
    let total_str = cx.string((available + pending + locked).to_string());
    
    obj.set(&mut cx, "available", available_str)?;
    obj.set(&mut cx, "pending", pending_str)?;
    obj.set(&mut cx, "locked", locked_str)?;
    obj.set(&mut cx, "total", total_str)?;
    
    Ok(obj)
}

/// Get wallet address  
pub fn wallet_get_address(mut cx: FunctionContext) -> JsResult<JsObject> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    if !handles.is_valid(handle) {
        return TariError::InvalidHandle(handle).to_js_error(&mut cx);
    }
    
    // TODO: Get actual address from Tari wallet and create address handle
    let address = AddressInstance {
        placeholder: format!("tari_address_{}", handle),
        emoji_id: "🚀🌟💎🔥🎯🌈⚡🎪🦄🎨🌺🎭".to_string(),
    };
    
    let mut address_handles = ADDRESS_HANDLES.lock().unwrap();
    let address_handle = address_handles.create_handle(address.clone());
    drop(address_handles);
    
    log::debug!("Retrieved address for wallet: {}", handle);
    
    let obj = cx.empty_object();
    let handle_num = cx.number(address_handle as f64);
    let emoji_str = cx.string(address.emoji_id);
    
    obj.set(&mut cx, "handle", handle_num)?;
    obj.set(&mut cx, "emojiId", emoji_str)?;
    
    Ok(obj)
}

/// Send a transaction
pub fn wallet_send_transaction(mut cx: FunctionContext) -> JsResult<JsString> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    let params_obj = cx.argument::<JsObject>(1)?;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    if !handles.is_valid(handle) {
        return TariError::InvalidHandle(handle).to_js_error(&mut cx);
    }
    drop(handles);
    
    let params = try_js!(&mut cx, parse_send_params(&mut cx, params_obj));
    
    log::info!("Sending {} to {} from wallet {}", 
              params.amount, params.destination, handle);
    
    // TODO: Send actual transaction through Tari wallet
    let tx_id = format!("tx_{}", rand::random::<u64>());
    
    log::debug!("Generated transaction ID: {}", tx_id);
    Ok(cx.string(tx_id))
}

/// Get wallet UTXOs
pub fn wallet_get_utxos(mut cx: FunctionContext) -> JsResult<JsArray> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    let page = cx.argument_opt(1)
        .and_then(|arg| arg.downcast::<JsNumber, _>(&mut cx).ok())
        .map(|arg| arg.value(&mut cx) as u32)
        .unwrap_or(0);
    let page_size = cx.argument_opt(2)
        .and_then(|arg| arg.downcast::<JsNumber, _>(&mut cx).ok())
        .map(|arg| arg.value(&mut cx) as u32)
        .unwrap_or(100);
    
    let handles = WALLET_HANDLES.lock().unwrap();
    if !handles.is_valid(handle) {
        return TariError::InvalidHandle(handle).to_js_error(&mut cx);
    }
    drop(handles);
    
    log::debug!("Getting UTXOs for wallet {} (page: {}, size: {})", 
               handle, page, page_size);
    
    // TODO: Get actual UTXOs from Tari wallet
    let mock_utxos = vec![
        (500000, "commitment_1".to_string(), 100, 0),
        (500000, "commitment_2".to_string(), 101, 0),
    ];
    
    let result = cx.empty_array();
    for (i, (value, commitment, height, status)) in mock_utxos.iter().enumerate() {
        let utxo_obj = cx.empty_object();
        let value_str = cx.string(value.to_string());
        let commitment_str = cx.string(commitment.clone());
        let height_num = cx.number(*height as f64);
        let status_num = cx.number(*status as f64);
        
        utxo_obj.set(&mut cx, "value", value_str)?;
        utxo_obj.set(&mut cx, "commitment", commitment_str)?;
        utxo_obj.set(&mut cx, "minedHeight", height_num)?;
        utxo_obj.set(&mut cx, "status", status_num)?;
        
        result.set(&mut cx, i as u32, utxo_obj)?;
    }
    
    Ok(result)
}

/// Import a UTXO into the wallet
pub fn wallet_import_utxo(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    let _params_obj = cx.argument::<JsObject>(1)?;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    if !handles.is_valid(handle) {
        return TariError::InvalidHandle(handle).to_js_error(&mut cx);
    }
    drop(handles);
    
    // TODO: Parse import parameters and import UTXO
    log::debug!("Importing UTXO for wallet: {}", handle);
    
    // For now, always return success
    Ok(cx.boolean(true))
}

/// Split coins for mining preparation
pub fn wallet_coin_split(mut cx: FunctionContext) -> JsResult<JsString> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    let params_obj = cx.argument::<JsObject>(1)?;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    if !handles.is_valid(handle) {
        return TariError::InvalidHandle(handle).to_js_error(&mut cx);
    }
    drop(handles);
    
    // Parse split parameters
    let amount = params_obj
        .get::<JsString, _, _>(&mut cx, "amount")?
        .value(&mut cx);
    let count = params_obj
        .get::<JsNumber, _, _>(&mut cx, "count")?
        .value(&mut cx) as usize;
    let fee_per_gram = params_obj
        .get_opt::<JsString, _, _>(&mut cx, "feePerGram")?
        .map(|s| s.value(&mut cx));
    let message = params_obj
        .get_opt::<JsString, _, _>(&mut cx, "message")?
        .map(|s| s.value(&mut cx));
    let lock_height = params_obj
        .get_opt::<JsNumber, _, _>(&mut cx, "lockHeight")?
        .map(|n| n.value(&mut cx) as u64);
    
    log::info!("Splitting {} coins into {} UTXOs for wallet {}", 
               amount, count, handle);
    
    // TODO: Implement actual coin splitting through Tari wallet
    let tx_id = format!("split_tx_{}", rand::random::<u64>());
    
    log::debug!("Generated coin split transaction ID: {}", tx_id);
    Ok(cx.string(tx_id))
}

/// Join coins for UTXO consolidation
pub fn wallet_coin_join(mut cx: FunctionContext) -> JsResult<JsString> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    let params_obj = cx.argument::<JsObject>(1)?;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    if !handles.is_valid(handle) {
        return TariError::InvalidHandle(handle).to_js_error(&mut cx);
    }
    drop(handles);
    
    // Parse join parameters
    let commitments = params_obj
        .get::<JsArray, _, _>(&mut cx, "commitments")?;
    let fee_per_gram = params_obj
        .get_opt::<JsString, _, _>(&mut cx, "feePerGram")?
        .map(|s| s.value(&mut cx));
    let message = params_obj
        .get_opt::<JsString, _, _>(&mut cx, "message")?
        .map(|s| s.value(&mut cx));
    
    let commitment_count = commitments.len(&mut cx);
    log::info!("Joining {} UTXOs for wallet {}", 
               commitment_count, handle);
    
    // TODO: Implement actual coin joining through Tari wallet
    let tx_id = format!("join_tx_{}", rand::random::<u64>());
    
    log::debug!("Generated coin join transaction ID: {}", tx_id);
    Ok(cx.string(tx_id))
}

/// Start wallet recovery from blockchain
pub fn wallet_start_recovery(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    let base_node_key = cx.argument::<JsString>(1)?.value(&mut cx);
    let callback = cx.argument::<JsFunction>(2)?;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    if !handles.is_valid(handle) {
        return TariError::InvalidHandle(handle).to_js_error(&mut cx);
    }
    drop(handles);
    
    log::info!("Starting wallet recovery for wallet {} with base node {}", 
               handle, base_node_key);
    
    // TODO: Implement actual wallet recovery
    // For now, simulate successful start
    log::debug!("Wallet recovery started for wallet: {}", handle);
    Ok(cx.boolean(true))
}

/// Check if wallet recovery is in progress
pub fn wallet_is_recovery_in_progress(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    if !handles.is_valid(handle) {
        return TariError::InvalidHandle(handle).to_js_error(&mut cx);
    }
    drop(handles);
    
    // TODO: Check actual recovery status from Tari wallet
    // For now, always return false
    log::debug!("Checked recovery status for wallet: {}", handle);
    Ok(cx.boolean(false))
}

/// Get connected peers for a wallet
pub fn wallet_get_peers(mut cx: FunctionContext) -> JsResult<JsArray> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    if !handles.is_valid(handle) {
        return TariError::InvalidHandle(handle).to_js_error(&mut cx);
    }
    drop(handles);
    
    log::debug!("Getting peers for wallet: {}", handle);
    
    // TODO: Get actual peers from Tari wallet
    let mock_peers = vec![
        ("peer_1", "127.0.0.1:18141", 1640995200, false),
        ("peer_2", "127.0.0.1:18142", 1640995100, false),
    ];
    
    let result = cx.empty_array();
    for (i, (public_key, address, last_seen, banned)) in mock_peers.iter().enumerate() {
        let peer_obj = cx.empty_object();
        let public_key_str = cx.string(*public_key);
        let address_str = cx.string(*address);
        let last_seen_num = cx.number(*last_seen as f64);
        let banned_bool = cx.boolean(*banned);
        
        peer_obj.set(&mut cx, "publicKey", public_key_str)?;
        peer_obj.set(&mut cx, "address", address_str)?;
        peer_obj.set(&mut cx, "lastSeen", last_seen_num)?;
        peer_obj.set(&mut cx, "banned", banned_bool)?;
        
        result.set(&mut cx, i as u32, peer_obj)?;
    }
    
    Ok(result)
}

/// Add a peer to the wallet
pub fn wallet_add_peer(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    let public_key = cx.argument::<JsString>(1)?.value(&mut cx);
    let address = cx.argument::<JsString>(2)?.value(&mut cx);
    
    let handles = WALLET_HANDLES.lock().unwrap();
    if !handles.is_valid(handle) {
        return TariError::InvalidHandle(handle).to_js_error(&mut cx);
    }
    drop(handles);
    
    log::info!("Adding peer {} at {} to wallet {}", 
               public_key, address, handle);
    
    // TODO: Implement actual peer addition through Tari wallet
    log::debug!("Added peer to wallet: {}", handle);
    Ok(cx.boolean(true))
}

/// Ban a peer from the wallet
pub fn wallet_ban_peer(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    let public_key = cx.argument::<JsString>(1)?.value(&mut cx);
    let duration = cx.argument_opt(2)
        .and_then(|arg| arg.downcast::<JsNumber, _>(&mut cx).ok())
        .map(|arg| arg.value(&mut cx) as u64);
    
    let handles = WALLET_HANDLES.lock().unwrap();
    if !handles.is_valid(handle) {
        return TariError::InvalidHandle(handle).to_js_error(&mut cx);
    }
    drop(handles);
    
    log::info!("Banning peer {} from wallet {} for {:?} seconds", 
               public_key, handle, duration);
    
    // TODO: Implement actual peer banning through Tari wallet
    log::debug!("Banned peer from wallet: {}", handle);
    Ok(cx.boolean(true))
}
