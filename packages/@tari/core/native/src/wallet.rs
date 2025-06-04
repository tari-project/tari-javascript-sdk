use neon::prelude::*;
use crate::types::js_string_to_cstring;
use std::collections::HashMap;
use std::sync::Arc;

// Mock FFI functions for now
// In real implementation, these would come from tari_wallet_ffi

// For testing, provide mock implementations
fn mock_wallet_create(
    _config: *const u8,
    _log_path: *const i8,
    _seed_words: *const i8,
    _network: u32,
    _db_name: *const i8,
    _db_path: *const i8,
    _passphrase: *const i8,
    error_out: *mut i32,
) -> *mut std::ffi::c_void {
    unsafe {
        *error_out = 0;
    }
    Box::into_raw(Box::new(42u64)) as *mut std::ffi::c_void
}

fn mock_wallet_destroy(_wallet: *mut std::ffi::c_void) {
    // Mock implementation - in real code would call actual FFI
}

// Additional mock FFI functions
fn mock_wallet_get_seed_words(_wallet: *mut std::ffi::c_void, error_out: *mut i32) -> *const i8 {
    unsafe {
        *error_out = 0;
    }
    let seed_words = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    let cstring = std::ffi::CString::new(seed_words).unwrap();
    cstring.into_raw()
}

fn mock_wallet_get_balance(_wallet: *mut std::ffi::c_void, error_out: *mut i32) -> *mut std::ffi::c_void {
    unsafe {
        *error_out = 0;
    }
    // Return a mock balance struct (available: 1000, pending: 500)
    let balance = Box::new((1000u64, 500u64, 0u64));
    Box::into_raw(balance) as *mut std::ffi::c_void
}

fn mock_wallet_get_tari_address(_wallet: *mut std::ffi::c_void, error_out: *mut i32) -> *mut std::ffi::c_void {
    unsafe {
        *error_out = 0;
    }
    // Return a mock address handle
    Box::into_raw(Box::new(1337u64)) as *mut std::ffi::c_void
}

fn mock_tari_address_to_emoji_id(_address: *mut std::ffi::c_void, error_out: *mut i32) -> *const i8 {
    unsafe {
        *error_out = 0;
    }
    let emoji_id = "🚀🎯💎🌟⚡🔥🎨🌈";
    let cstring = std::ffi::CString::new(emoji_id).unwrap();
    cstring.into_raw()
}

fn mock_balance_get_available(balance: *mut std::ffi::c_void) -> u64 {
    if balance.is_null() {
        return 0;
    }
    unsafe {
        let balance_tuple = balance as *mut (u64, u64, u64);
        (*balance_tuple).0
    }
}

fn mock_balance_get_pending(balance: *mut std::ffi::c_void) -> u64 {
    if balance.is_null() {
        return 0;
    }
    unsafe {
        let balance_tuple = balance as *mut (u64, u64, u64);
        (*balance_tuple).1
    }
}

fn mock_balance_destroy(balance: *mut std::ffi::c_void) {
    if !balance.is_null() {
        unsafe {
            let _ = Box::from_raw(balance as *mut (u64, u64, u64));
        }
    }
}

fn mock_string_destroy(ptr: *const i8) {
    if !ptr.is_null() {
        unsafe {
            let _ = std::ffi::CString::from_raw(ptr as *mut i8);
        }
    }
}

fn mock_tari_address_destroy(address: *mut std::ffi::c_void) {
    if !address.is_null() {
        unsafe {
            let _ = Box::from_raw(address as *mut u64);
        }
    }
}

// Additional mock FFI functions for extended functionality

// Mock external function declarations
extern "C" {
    // These would be real FFI functions in production
}

// Key management mocks
fn mock_private_key_create(bytes: *const u8, error_out: *mut i32) -> *mut std::ffi::c_void {
    unsafe { *error_out = 0; }
    Box::into_raw(Box::new(rand::random::<u64>())) as *mut std::ffi::c_void
}

fn mock_private_key_generate(error_out: *mut i32) -> *mut std::ffi::c_void {
    unsafe { *error_out = 0; }
    Box::into_raw(Box::new(rand::random::<u64>())) as *mut std::ffi::c_void
}

fn mock_private_key_from_hex(hex: *const i8, error_out: *mut i32) -> *mut std::ffi::c_void {
    unsafe { *error_out = 0; }
    Box::into_raw(Box::new(rand::random::<u64>())) as *mut std::ffi::c_void
}

fn mock_private_key_get_bytes(key: *mut std::ffi::c_void, error_out: *mut i32) -> *mut std::ffi::c_void {
    unsafe { *error_out = 0; }
    let bytes = vec![1u8; 32]; // Mock 32-byte key
    Box::into_raw(Box::new(bytes)) as *mut std::ffi::c_void
}

fn mock_private_key_destroy(key: *mut std::ffi::c_void) {
    if !key.is_null() {
        unsafe { let _ = Box::from_raw(key as *mut u64); }
    }
}

// UTXO management mocks
fn mock_wallet_get_utxos(wallet: *mut std::ffi::c_void, page: u32, page_size: u32, error_out: *mut i32) -> *mut std::ffi::c_void {
    unsafe { *error_out = 0; }
    // Mock UTXO array - in real implementation would return actual UTXOs
    Box::into_raw(Box::new(42u64)) as *mut std::ffi::c_void
}

fn mock_wallet_import_utxo(wallet: *mut std::ffi::c_void, amount: u64, spending_key: *mut std::ffi::c_void, source_key: *mut std::ffi::c_void, message: *const i8, error_out: *mut i32) -> u64 {
    unsafe { *error_out = 0; }
    rand::random::<u64>() // Mock transaction ID
}

// Mining mocks
fn mock_wallet_coin_split(wallet: *mut std::ffi::c_void, amount: u64, count: u32, fee: u64, message: *const i8, lock_height: u64, error_out: *mut i32) -> u64 {
    unsafe { *error_out = 0; }
    rand::random::<u64>() // Mock transaction ID
}

fn mock_wallet_coin_join(wallet: *mut std::ffi::c_void, commitments: *const u8, commitment_count: u32, fee: u64, message: *const i8, error_out: *mut i32) -> u64 {
    unsafe { *error_out = 0; }
    rand::random::<u64>() // Mock transaction ID
}

// Recovery mocks
fn mock_wallet_start_recovery(wallet: *mut std::ffi::c_void, base_node_key: *mut std::ffi::c_void, callback: extern "C" fn(u64, u64), error_out: *mut i32) -> bool {
    unsafe { *error_out = 0; }
    true // Mock success
}

fn mock_wallet_is_recovery_in_progress(wallet: *mut std::ffi::c_void, error_out: *mut i32) -> bool {
    unsafe { *error_out = 0; }
    false // Mock not in progress
}

// P2P mocks
fn mock_wallet_get_peers(wallet: *mut std::ffi::c_void, error_out: *mut i32) -> *mut std::ffi::c_void {
    unsafe { *error_out = 0; }
    Box::into_raw(Box::new(42u64)) as *mut std::ffi::c_void
}

fn mock_wallet_add_peer(wallet: *mut std::ffi::c_void, public_key: *const i8, address: *const i8, error_out: *mut i32) -> bool {
    unsafe { *error_out = 0; }
    true
}

fn mock_wallet_ban_peer(wallet: *mut std::ffi::c_void, public_key: *const i8, duration: u64, error_out: *mut i32) -> bool {
    unsafe { *error_out = 0; }
    true
}

/// Create a new wallet
fn create_wallet(mut cx: FunctionContext) -> JsResult<JsNumber> {
    let config = cx.argument::<JsObject>(0)?;
    
    // Extract configuration
    let seed_words = match config.get_value(&mut cx, "seedWords") {
        Ok(val) => {
            if val.is_a::<JsString, _>(&mut cx) {
                val.downcast::<JsString, _>(&mut cx).or_throw(&mut cx)?
            } else {
                return cx.throw_error("seedWords must be a string");
            }
        }
        Err(_) => return cx.throw_error("seedWords required"),
    };
    
    let network = match config.get_value(&mut cx, "network") {
        Ok(val) => {
            if val.is_a::<JsNumber, _>(&mut cx) {
                val.downcast::<JsNumber, _>(&mut cx).or_throw(&mut cx)?.value(&mut cx) as u32
            } else {
                0 // default to mainnet
            }
        }
        Err(_) => 0, // default to mainnet
    };
    
    let db_path = match config.get_value(&mut cx, "dbPath") {
        Ok(val) => {
            if val.is_a::<JsString, _>(&mut cx) {
                val.downcast::<JsString, _>(&mut cx).or_throw(&mut cx)?
            } else {
                cx.string("./tari-wallet-db")
            }
        }
        Err(_) => cx.string("./tari-wallet-db"),
    };
    
    let passphrase = match config.get_value(&mut cx, "passphrase") {
        Ok(val) => {
            if val.is_a::<JsString, _>(&mut cx) {
                val.downcast::<JsString, _>(&mut cx).or_throw(&mut cx)?
            } else {
                cx.string("")
            }
        }
        Err(_) => cx.string(""),
    };
    
    // Convert to C strings
    let seed_words_ptr = match js_string_to_cstring(&mut cx, seed_words) {
        Ok(ptr) => ptr,
        Err(e) => return cx.throw_error(&format!("Invalid seed words: {}", e)),
    };
    let db_path_ptr = match js_string_to_cstring(&mut cx, db_path) {
        Ok(ptr) => ptr,
        Err(e) => return cx.throw_error(&format!("Invalid db path: {}", e)),
    };
    let passphrase_ptr = match js_string_to_cstring(&mut cx, passphrase) {
        Ok(ptr) => ptr,
        Err(e) => return cx.throw_error(&format!("Invalid passphrase: {}", e)),
    };
    
    // Call FFI
    let mut error_out = 0;
    let wallet_ptr = mock_wallet_create(
        std::ptr::null(), // config
        std::ptr::null(), // log_path
        seed_words_ptr,
        network,
        std::ptr::null(), // db_name
        db_path_ptr,
        passphrase_ptr,
        &mut error_out,
    );
    
    // Clean up C strings
    unsafe {
        let _ = std::ffi::CString::from_raw(seed_words_ptr as *mut i8);
        let _ = std::ffi::CString::from_raw(db_path_ptr as *mut i8);
        let _ = std::ffi::CString::from_raw(passphrase_ptr as *mut i8);
    }
    
    // Check for errors
    if error_out != 0 {
        return cx.throw_error(&format!("Wallet error: {}", error_out));
    }
    
    if wallet_ptr.is_null() {
        return cx.throw_error("Failed to create wallet");
    }
    
    // Return handle
    Ok(cx.number(wallet_ptr as usize as f64))
}

/// Destroy a wallet
fn destroy_wallet(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx);
    let wallet_ptr = handle as usize as *mut std::ffi::c_void;
    
    if !wallet_ptr.is_null() {
        mock_wallet_destroy(wallet_ptr);
    }
    
    Ok(cx.undefined())
}

/// Get seed words from wallet
fn get_seed_words(mut cx: FunctionContext) -> JsResult<JsString> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx);
    let wallet_ptr = handle as usize as *mut std::ffi::c_void;
    
    let mut error_out = 0;
    let seed_words_ptr = mock_wallet_get_seed_words(wallet_ptr, &mut error_out);
    
    if error_out != 0 {
        return cx.throw_error(&format!("Wallet error: {}", error_out));
    }
    
    if seed_words_ptr.is_null() {
        return cx.throw_error("Failed to get seed words");
    }
    
    // Convert C string to JS string
    let seed_words = unsafe {
        std::ffi::CStr::from_ptr(seed_words_ptr).to_string_lossy().into_owned()
    };
    
    // Clean up
    mock_string_destroy(seed_words_ptr);
    
    Ok(cx.string(seed_words))
}

/// Get wallet balance
fn get_balance(mut cx: FunctionContext) -> JsResult<JsObject> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx);
    let wallet_ptr = handle as usize as *mut std::ffi::c_void;
    
    let mut error_out = 0;
    let balance_ptr = mock_wallet_get_balance(wallet_ptr, &mut error_out);
    
    if error_out != 0 {
        return cx.throw_error(&format!("Wallet error: {}", error_out));
    }
    
    if balance_ptr.is_null() {
        return cx.throw_error("Failed to get balance");
    }
    
    // Extract balance values
    let available = mock_balance_get_available(balance_ptr);
    let pending = mock_balance_get_pending(balance_ptr);
    let locked = 0u64; // Mock
    let total = available + pending;
    
    // Create JS object
    let obj = cx.empty_object();
    let available_str = cx.string(&available.to_string());
    let pending_str = cx.string(&pending.to_string());
    let locked_str = cx.string(&locked.to_string());
    let total_str = cx.string(&total.to_string());
    
    obj.set(&mut cx, "available", available_str)?;
    obj.set(&mut cx, "pending", pending_str)?;
    obj.set(&mut cx, "locked", locked_str)?;
    obj.set(&mut cx, "total", total_str)?;
    
    // Clean up
    mock_balance_destroy(balance_ptr);
    
    Ok(obj)
}

/// Get wallet address
fn get_address(mut cx: FunctionContext) -> JsResult<JsObject> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx);
    let wallet_ptr = handle as usize as *mut std::ffi::c_void;
    
    let mut error_out = 0;
    let address_ptr = mock_wallet_get_tari_address(wallet_ptr, &mut error_out);
    
    if error_out != 0 {
        return cx.throw_error(&format!("Wallet error: {}", error_out));
    }
    
    if address_ptr.is_null() {
        return cx.throw_error("Failed to get address");
    }
    
    // Get emoji ID
    let mut emoji_error = 0;
    let emoji_ptr = mock_tari_address_to_emoji_id(address_ptr, &mut emoji_error);
    
    let emoji_id = if emoji_ptr.is_null() {
        "🚀🎯💎🌟⚡🔥🎨🌈".to_string() // Fallback
    } else {
        unsafe {
            std::ffi::CStr::from_ptr(emoji_ptr).to_string_lossy().into_owned()
        }
    };
    
    // Create result object
    let obj = cx.empty_object();
    let handle_num = cx.number(address_ptr as usize as f64);
    let emoji_str = cx.string(emoji_id);
    
    obj.set(&mut cx, "handle", handle_num)?;
    obj.set(&mut cx, "emojiId", emoji_str)?;
    
    // Clean up emoji string but keep address handle for later use
    if !emoji_ptr.is_null() {
        mock_string_destroy(emoji_ptr);
    }
    
    Ok(obj)
}

/// Send transaction
fn send_transaction(mut cx: FunctionContext) -> JsResult<JsString> {
    let wallet_handle = cx.argument::<JsNumber>(0)?.value(&mut cx);
    let params = cx.argument::<JsObject>(1)?;
    
    // Extract parameters
    let destination = match params.get_value(&mut cx, "destination") {
        Ok(val) if val.is_a::<JsString, _>(&mut cx) => {
            val.downcast::<JsString, _>(&mut cx).or_throw(&mut cx)?.value(&mut cx)
        }
        _ => return cx.throw_error("destination required"),
    };
        
    let amount = match params.get_value(&mut cx, "amount") {
        Ok(val) if val.is_a::<JsString, _>(&mut cx) => {
            let amount_str = val.downcast::<JsString, _>(&mut cx).or_throw(&mut cx)?.value(&mut cx);
            match amount_str.parse::<u64>() {
                Ok(amount) => amount,
                Err(_) => return cx.throw_error("Invalid amount"),
            }
        }
        _ => return cx.throw_error("amount required"),
    };
        
    let fee_per_gram = match params.get_value(&mut cx, "feePerGram") {
        Ok(val) if val.is_a::<JsString, _>(&mut cx) => {
            let fee_str = val.downcast::<JsString, _>(&mut cx).or_throw(&mut cx)?.value(&mut cx);
            fee_str.parse::<u64>().unwrap_or(5)
        }
        _ => 5u64, // Default fee
    };
        
    let message = match params.get_value(&mut cx, "message") {
        Ok(val) if val.is_a::<JsString, _>(&mut cx) => {
            val.downcast::<JsString, _>(&mut cx).or_throw(&mut cx)?.value(&mut cx)
        }
        _ => String::new(),
    };
    
    // Mock transaction ID generation
    let tx_id = format!("{:016x}", 
        (wallet_handle as u64).wrapping_mul(amount).wrapping_add(fee_per_gram)
    );
    
    Ok(cx.string(&tx_id))
}

/// Destroy address handle
fn destroy_address(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx);
    let address_ptr = handle as usize as *mut std::ffi::c_void;
    
    if !address_ptr.is_null() {
        mock_tari_address_destroy(address_ptr);
    }
    
    Ok(cx.undefined())
}

// Extended FFI wrapper functions

/// Generate private key
fn private_key_generate_fn(mut cx: FunctionContext) -> JsResult<JsNumber> {
    let mut error_out = 0;
    let key_ptr = mock_private_key_generate(&mut error_out);
    
    if error_out != 0 {
        return cx.throw_error(&format!("Private key error: {}", error_out));
    }
    
    Ok(cx.number(key_ptr as usize as f64))
}

/// Create private key from hex
fn private_key_from_hex_fn(mut cx: FunctionContext) -> JsResult<JsNumber> {
    let hex = cx.argument::<JsString>(0)?.value(&mut cx);
    let hex_cstr = js_string_to_cstring(&mut cx, cx.argument::<JsString>(0)?)?;
    
    let mut error_out = 0;
    let key_ptr = mock_private_key_from_hex(hex_cstr, &mut error_out);
    
    unsafe {
        let _ = std::ffi::CString::from_raw(hex_cstr as *mut i8);
    }
    
    if error_out != 0 {
        return cx.throw_error(&format!("Private key error: {}", error_out));
    }
    
    Ok(cx.number(key_ptr as usize as f64))
}

/// Destroy private key
fn private_key_destroy_fn(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx);
    let key_ptr = handle as usize as *mut std::ffi::c_void;
    
    if !key_ptr.is_null() {
        mock_private_key_destroy(key_ptr);
    }
    
    Ok(cx.undefined())
}

/// Get UTXOs with pagination
fn get_utxos(mut cx: FunctionContext) -> JsResult<JsArray> {
    let wallet_handle = cx.argument::<JsNumber>(0)?.value(&mut cx);
    let page = cx.argument_opt(1)
        .map(|v: Handle<JsNumber>| v.value(&mut cx) as u32)
        .unwrap_or(0);
    let page_size = cx.argument_opt(2)
        .map(|v: Handle<JsNumber>| v.value(&mut cx) as u32)
        .unwrap_or(100);
    
    let wallet_ptr = wallet_handle as usize as *mut std::ffi::c_void;
    
    let mut error_out = 0;
    let utxos_ptr = mock_wallet_get_utxos(wallet_ptr, page, page_size, &mut error_out);
    
    if error_out != 0 {
        return cx.throw_error(&format!("UTXO error: {}", error_out));
    }
    
    // Mock UTXO data
    let array = cx.empty_array();
    
    for i in 0..5 {
        let utxo = cx.empty_object();
        utxo.set(&mut cx, "value", cx.string(&format!("{}", 1000000 * (i + 1))))?;
        utxo.set(&mut cx, "commitment", cx.string(&format!("commitment_{}", i)))?;
        utxo.set(&mut cx, "minedHeight", cx.number(100 + i as f64))?;
        utxo.set(&mut cx, "status", cx.number(0))?;
        
        array.set(&mut cx, i, utxo)?;
    }
    
    Ok(array)
}

/// Import external UTXO
fn import_utxo(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let wallet_handle = cx.argument::<JsNumber>(0)?.value(&mut cx);
    let params = cx.argument::<JsObject>(1)?;
    
    let amount = match params.get_value(&mut cx, "amount") {
        Ok(val) if val.is_a::<JsString, _>(&mut cx) => {
            val.downcast::<JsString, _>(&mut cx).or_throw(&mut cx)?.value(&mut cx)
                .parse::<u64>()
                .map_err(|_| cx.throw_error("Invalid amount"))?
        }
        _ => return cx.throw_error("amount required"),
    };
    
    // Mock success
    Ok(cx.boolean(true))
}

/// Start wallet recovery
fn start_recovery(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let wallet_handle = cx.argument::<JsNumber>(0)?.value(&mut cx);
    let base_node_key = cx.argument::<JsString>(1)?.value(&mut cx);
    let callback = cx.argument::<JsFunction>(2)?;
    
    // Mock recovery start
    Ok(cx.boolean(true))
}

/// Check if recovery is in progress
fn is_recovery_in_progress(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let wallet_handle = cx.argument::<JsNumber>(0)?.value(&mut cx);
    let wallet_ptr = wallet_handle as usize as *mut std::ffi::c_void;
    
    let mut error_out = 0;
    let in_progress = mock_wallet_is_recovery_in_progress(wallet_ptr, &mut error_out);
    
    if error_out != 0 {
        return cx.throw_error(&format!("Recovery error: {}", error_out));
    }
    
    Ok(cx.boolean(in_progress))
}

/// Coin split for mining
fn coin_split(mut cx: FunctionContext) -> JsResult<JsString> {
    let wallet_handle = cx.argument::<JsNumber>(0)?.value(&mut cx);
    let params = cx.argument::<JsObject>(1)?;
    
    let amount = match params.get_value(&mut cx, "amount") {
        Ok(val) if val.is_a::<JsString, _>(&mut cx) => {
            val.downcast::<JsString, _>(&mut cx).or_throw(&mut cx)?.value(&mut cx)
                .parse::<u64>()
                .map_err(|_| cx.throw_error("Invalid amount"))?
        }
        _ => return cx.throw_error("amount required"),
    };
        
    let count = match params.get_value(&mut cx, "count") {
        Ok(val) if val.is_a::<JsNumber, _>(&mut cx) => {
            val.downcast::<JsNumber, _>(&mut cx).or_throw(&mut cx)?.value(&mut cx) as u32
        }
        _ => return cx.throw_error("count required"),
    };
    
    // Mock transaction ID
    let tx_id = format!("split_{:x}", rand::random::<u64>());
    
    Ok(cx.string(&tx_id))
}

/// Get peers
fn get_peers(mut cx: FunctionContext) -> JsResult<JsArray> {
    let wallet_handle = cx.argument::<JsNumber>(0)?.value(&mut cx);
    let wallet_ptr = wallet_handle as usize as *mut std::ffi::c_void;
    
    let mut error_out = 0;
    let peers_ptr = mock_wallet_get_peers(wallet_ptr, &mut error_out);
    
    if error_out != 0 {
        return cx.throw_error(&format!("P2P error: {}", error_out));
    }
    
    // Mock peer data
    let array = cx.empty_array();
    
    for i in 0..3 {
        let peer = cx.empty_object();
        peer.set(&mut cx, "publicKey", cx.string(&format!("peer_key_{}", i)))?;
        peer.set(&mut cx, "address", cx.string(&format!("tcp://192.168.1.{}:18189", 100 + i)))?;
        peer.set(&mut cx, "lastSeen", cx.number(1640995200000.0 + (i as f64 * 3600000.0)))?;
        peer.set(&mut cx, "banned", cx.boolean(false))?;
        
        array.set(&mut cx, i, peer)?;
    }
    
    Ok(array)
}

/// Add peer
fn add_peer(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let wallet_handle = cx.argument::<JsNumber>(0)?.value(&mut cx);
    let public_key = cx.argument::<JsString>(1)?.value(&mut cx);
    let address = cx.argument::<JsString>(2)?.value(&mut cx);
    
    let wallet_ptr = wallet_handle as usize as *mut std::ffi::c_void;
    let pk_cstr = js_string_to_cstring(&mut cx, cx.argument::<JsString>(1)?)?;
    let addr_cstr = js_string_to_cstring(&mut cx, cx.argument::<JsString>(2)?)?;
    
    let mut error_out = 0;
    let success = mock_wallet_add_peer(wallet_ptr, pk_cstr, addr_cstr, &mut error_out);
    
    unsafe {
        let _ = std::ffi::CString::from_raw(pk_cstr as *mut i8);
        let _ = std::ffi::CString::from_raw(addr_cstr as *mut i8);
    }
    
    if error_out != 0 {
        return cx.throw_error(&format!("Add peer error: {}", error_out));
    }
    
    Ok(cx.boolean(success))
}

/// Ban peer
fn ban_peer(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let wallet_handle = cx.argument::<JsNumber>(0)?.value(&mut cx);
    let public_key = cx.argument::<JsString>(1)?.value(&mut cx);
    let duration = cx.argument_opt(2)
        .map(|v: Handle<JsNumber>| v.value(&mut cx) as u64)
        .unwrap_or(24 * 60 * 60); // Default 24 hours
    
    let wallet_ptr = wallet_handle as usize as *mut std::ffi::c_void;
    let pk_cstr = js_string_to_cstring(&mut cx, cx.argument::<JsString>(1)?)?;
    
    let mut error_out = 0;
    let success = mock_wallet_ban_peer(wallet_ptr, pk_cstr, duration, &mut error_out);
    
    unsafe {
        let _ = std::ffi::CString::from_raw(pk_cstr as *mut i8);
    }
    
    if error_out != 0 {
        return cx.throw_error(&format!("Ban peer error: {}", error_out));
    }
    
    Ok(cx.boolean(success))
}

/// Register wallet functions
pub fn register(cx: &mut ModuleContext) -> NeonResult<()> {
    // Original functions
    cx.export_function("walletCreate", create_wallet)?;
    cx.export_function("walletDestroy", destroy_wallet)?;
    
    // Essential functions
    cx.export_function("walletGetSeedWords", get_seed_words)?;
    cx.export_function("walletGetBalance", get_balance)?;
    cx.export_function("walletGetAddress", get_address)?;
    cx.export_function("walletSendTransaction", send_transaction)?;
    cx.export_function("addressDestroy", destroy_address)?;
    
    // Key management
    cx.export_function("privateKeyGenerate", private_key_generate_fn)?;
    cx.export_function("privateKeyFromHex", private_key_from_hex_fn)?;
    cx.export_function("privateKeyDestroy", private_key_destroy_fn)?;
    
    // UTXO management
    cx.export_function("walletGetUtxos", get_utxos)?;
    cx.export_function("walletImportUtxo", import_utxo)?;
    
    // Mining
    cx.export_function("walletCoinSplit", coin_split)?;
    
    // Recovery
    cx.export_function("walletStartRecovery", start_recovery)?;
    cx.export_function("walletIsRecoveryInProgress", is_recovery_in_progress)?;
    
    // P2P
    cx.export_function("walletGetPeers", get_peers)?;
    cx.export_function("walletAddPeer", add_peer)?;
    cx.export_function("walletBanPeer", ban_peer)?;
    
    Ok(())
}
