use neon::prelude::*;
use crate::error::{TariError, TariResult};
use crate::types::{WalletInstance, AddressInstance, create_wallet_handle, destroy_wallet_handle, WALLET_HANDLES, ADDRESS_HANDLES};
use crate::utils::{parse_wallet_config, create_balance_object, create_address_object, create_utxo_object, parse_send_params};
use crate::try_js;

/// Create a new wallet instance
pub fn wallet_create(mut cx: FunctionContext) -> JsResult<JsNumber> {
    let config_obj = cx.argument::<JsObject>(0)?;
    let config = try_js!(&mut cx, parse_wallet_config(&mut cx, config_obj));
    
    log::info!("Creating wallet with network: {:?}", config.network);
    
    // TODO: Replace with actual Tari wallet creation
    let wallet = try_js!(&mut cx, WalletInstance::new());
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
    create_balance_object(&mut cx, available, pending, locked)
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
    create_address_object(&mut cx, address_handle, address.emoji_id)
}

/// Send a transaction
pub fn wallet_send_transaction(mut cx: FunctionContext) -> JsResult<JsString> {
    safe_execute(&mut cx, || {
        let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
        let params_obj = cx.argument::<JsObject>(1)?;
        
        let handles = WALLET_HANDLES.lock().unwrap();
        if !handles.is_valid(handle) {
            return Err(TariError::InvalidHandle(handle));
        }
        drop(handles);
        
        let params = parse_send_params(&mut cx, params_obj)?;
        
        log::info!("Sending {} to {} from wallet {}", 
                  params.amount, params.destination, handle);
        
        // TODO: Send actual transaction through Tari wallet
        let tx_id = format!("tx_{}", rand::random::<u64>());
        
        log::debug!("Generated transaction ID: {}", tx_id);
        Ok(cx.string(tx_id))
    })
}

/// Get wallet UTXOs
pub fn wallet_get_utxos(mut cx: FunctionContext) -> JsResult<JsArray> {
    safe_execute(&mut cx, || {
        let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
        let page = cx.argument_opt(1)
            .map(|arg: Handle<JsNumber>| arg.value(&mut cx) as u32)
            .unwrap_or(0);
        let page_size = cx.argument_opt(2)
            .map(|arg: Handle<JsNumber>| arg.value(&mut cx) as u32)
            .unwrap_or(100);
        
        let handles = WALLET_HANDLES.lock().unwrap();
        if !handles.is_valid(handle) {
            return Err(TariError::InvalidHandle(handle));
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
            let utxo_obj = create_utxo_object(&mut cx, *value, commitment.clone(), *height, *status)?;
            result.set(&mut cx, i as u32, utxo_obj)?;
        }
        
        Ok(result)
    })
}

/// Import a UTXO into the wallet
pub fn wallet_import_utxo(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    safe_execute(&mut cx, || {
        let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
        let _params_obj = cx.argument::<JsObject>(1)?;
        
        let handles = WALLET_HANDLES.lock().unwrap();
        if !handles.is_valid(handle) {
            return Err(TariError::InvalidHandle(handle));
        }
        drop(handles);
        
        // TODO: Parse import parameters and import UTXO
        log::debug!("Importing UTXO for wallet: {}", handle);
        
        // For now, always return success
        Ok(cx.boolean(true))
    })
}
