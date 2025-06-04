use neon::prelude::*;
use crate::types::js_string_to_cstring;

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
    obj.set(&mut cx, "available", cx.string(&available.to_string()))?;
    obj.set(&mut cx, "pending", cx.string(&pending.to_string()))?;
    obj.set(&mut cx, "locked", cx.string(&locked.to_string()))?;
    obj.set(&mut cx, "total", cx.string(&total.to_string()))?;
    
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
    obj.set(&mut cx, "handle", cx.number(address_ptr as usize as f64))?;
    obj.set(&mut cx, "emojiId", cx.string(emoji_id))?;
    
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
            amount_str.parse::<u64>()
                .map_err(|_| cx.throw_error("Invalid amount"))?
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
    
    Ok(cx.string(tx_id))
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

/// Register wallet functions
pub fn register(cx: &mut ModuleContext) -> NeonResult<()> {
    // Original functions
    cx.export_function("walletCreate", create_wallet)?;
    cx.export_function("walletDestroy", destroy_wallet)?;
    
    // New essential functions
    cx.export_function("walletGetSeedWords", get_seed_words)?;
    cx.export_function("walletGetBalance", get_balance)?;
    cx.export_function("walletGetAddress", get_address)?;
    cx.export_function("walletSendTransaction", send_transaction)?;
    cx.export_function("addressDestroy", destroy_address)?;
    
    Ok(())
}
