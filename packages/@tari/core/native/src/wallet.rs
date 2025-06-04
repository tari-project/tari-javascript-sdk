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

/// Register wallet functions
pub fn register(cx: &mut ModuleContext) -> NeonResult<()> {
    cx.export_function("walletCreate", create_wallet)?;
    cx.export_function("walletDestroy", destroy_wallet)?;
    Ok(())
}
