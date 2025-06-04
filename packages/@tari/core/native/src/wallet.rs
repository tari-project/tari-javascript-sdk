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
