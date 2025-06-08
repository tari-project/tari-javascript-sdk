use neon::prelude::*;
use crate::error::TariError;
use crate::types::{
    PrivateKeyInstance, PublicKeyInstance,
    PRIVATE_KEY_HANDLES, PUBLIC_KEY_HANDLES, ADDRESS_HANDLES,
};
use tari_crypto::keys::{SecretKey, PublicKey};
use tari_crypto::ristretto::{RistrettoSecretKey, RistrettoPublicKey};
use rand::rngs::OsRng;
use tari_crypto::tari_utilities::hex::from_hex;
use tari_crypto::tari_utilities::ByteArray;
use crate::try_js;

/// Generate a new private key
pub fn private_key_generate(mut cx: FunctionContext) -> JsResult<JsNumber> {
    // Generate real Tari private key
    let mut rng = OsRng;
    let private_key = PrivateKeyInstance {
        key: RistrettoSecretKey::random(&mut rng),
    };
    
    let mut handles = PRIVATE_KEY_HANDLES.lock().unwrap();
    let handle = handles.create_handle(private_key);
    
    log::debug!("Generated private key with handle: {}", handle);
    Ok(cx.number(handle as f64))
}

/// Create private key from hex string
pub fn private_key_from_hex(mut cx: FunctionContext) -> JsResult<JsNumber> {
    let hex_str = cx.argument::<JsString>(0)?.value(&mut cx);
    
    // Parse hex string into actual Tari private key
    let key_bytes = try_js!(&mut cx, from_hex(&hex_str)
        .map_err(|e| TariError::InvalidArgument(format!("Invalid hex string: {}", e))));
    
    if key_bytes.len() != 32 {
        return TariError::InvalidArgument(
            "Private key must be 32 bytes (64 hex characters)".to_string()
        ).to_js_error(&mut cx);
    }
    
    let key = try_js!(&mut cx, RistrettoSecretKey::from_canonical_bytes(&key_bytes)
        .map_err(|e| TariError::CryptoError(format!("Invalid private key: {}", e))));
    
    let private_key = PrivateKeyInstance { key };
    
    let mut handles = PRIVATE_KEY_HANDLES.lock().unwrap();
    let handle = handles.create_handle(private_key);
    
    log::debug!("Created private key from hex with handle: {}", handle);
    Ok(cx.number(handle as f64))
}

/// Destroy a private key handle
pub fn private_key_destroy(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    
    let mut handles = PRIVATE_KEY_HANDLES.lock().unwrap();
    match handles.destroy_handle(handle) {
        Some(_) => {
            log::debug!("Destroyed private key handle: {}", handle);
            Ok(cx.undefined())
        }
        None => TariError::InvalidHandle(handle).to_js_error(&mut cx),
    }
}

/// Generate public key from private key
pub fn public_key_from_private_key(mut cx: FunctionContext) -> JsResult<JsNumber> {
    let private_key_handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    
    // Get the private key and generate public key
    let private_handles = PRIVATE_KEY_HANDLES.lock().unwrap();
    let private_key = try_js!(&mut cx, private_handles.get_handle(private_key_handle)
        .ok_or(TariError::InvalidHandle(private_key_handle)));
    
    let public_key = PublicKeyInstance {
        key: PublicKey::from_secret_key(&private_key.key),
    };
    drop(private_handles);
    
    let mut public_handles = PUBLIC_KEY_HANDLES.lock().unwrap();
    let handle = public_handles.create_handle(public_key);
    
    log::debug!("Generated public key from private key {} with handle: {}", 
               private_key_handle, handle);
    Ok(cx.number(handle as f64))
}

/// Create public key from hex string
pub fn public_key_from_hex(mut cx: FunctionContext) -> JsResult<JsNumber> {
    let hex_str = cx.argument::<JsString>(0)?.value(&mut cx);
    
    // Parse hex string into actual Tari public key
    let key_bytes = try_js!(&mut cx, from_hex(&hex_str)
        .map_err(|e| TariError::InvalidArgument(format!("Invalid hex string: {}", e))));
    
    if key_bytes.len() != 32 {
        return TariError::InvalidArgument(
            "Public key must be 32 bytes (64 hex characters)".to_string()
        ).to_js_error(&mut cx);
    }
    
    let key = try_js!(&mut cx, RistrettoPublicKey::from_canonical_bytes(&key_bytes)
        .map_err(|e| TariError::CryptoError(format!("Invalid public key: {}", e))));
    
    let public_key = PublicKeyInstance { key };
    
    let mut handles = PUBLIC_KEY_HANDLES.lock().unwrap();
    let handle = handles.create_handle(public_key);
    
    log::debug!("Created public key from hex with handle: {}", handle);
    Ok(cx.number(handle as f64))
}

/// Destroy a public key handle
pub fn public_key_destroy(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    
    let mut handles = PUBLIC_KEY_HANDLES.lock().unwrap();
    match handles.destroy_handle(handle) {
        Some(_) => {
            log::debug!("Destroyed public key handle: {}", handle);
            Ok(cx.undefined())
        }
        None => TariError::InvalidHandle(handle).to_js_error(&mut cx),
    }
}

/// Destroy an address handle
pub fn address_destroy(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    
    let mut handles = ADDRESS_HANDLES.lock().unwrap();
    match handles.destroy_handle(handle) {
        Some(_) => {
            log::debug!("Destroyed address handle: {}", handle);
            Ok(cx.undefined())
        }
        None => TariError::InvalidHandle(handle).to_js_error(&mut cx),
    }
}
