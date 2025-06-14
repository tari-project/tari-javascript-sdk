/**
 * Callback bridge implementation for wallet events
 * 
 * This module provides the NAPI-RS ThreadsafeFunction integration
 * for sending wallet events from Rust to JavaScript.
 */

use napi::bindgen_prelude::*;
use napi_derive::napi;
use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;
use tokio::sync::mpsc;
use std::collections::HashMap;

use crate::types::WalletHandle;

/// Event payload structure sent to JavaScript
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventPayload {
    /// Event type identifier
    pub event_type: String,
    /// Wallet handle that emitted the event
    pub wallet_handle: WalletHandle,
    /// Event data as JSON string
    pub data: serde_json::Value,
    /// Timestamp when event occurred
    pub timestamp: i64,
}

/// ThreadsafeFunction type alias for wallet events
pub type WalletEventCallback = ThreadsafeFunction<EventPayload, ErrorStrategy::CalleeHandled>;

/// Global storage for wallet event callbacks
/// Maps wallet handle to its registered callback
static WALLET_CALLBACKS: Lazy<Arc<Mutex<HashMap<WalletHandle, WalletEventCallback>>>> = 
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

/// Event emitter channel for async event processing
static EVENT_EMITTER: Lazy<Arc<Mutex<Option<mpsc::UnboundedSender<EventPayload>>>>> = 
    Lazy::new(|| Arc::new(Mutex::new(None)));

/// Register an event callback for a specific wallet
#[napi]
pub fn wallet_set_event_callback(
    wallet_handle: WalletHandle,
    callback: JsFunction,
) -> Result<()> {
    // Create ThreadsafeFunction from the JavaScript callback
    let tsfn: WalletEventCallback = callback.create_threadsafe_function(0, |ctx| {
        let payload = &ctx.value;
        
        // Serialize the event payload to JSON string for JavaScript
        let json_str = serde_json::to_string(payload)
            .map_err(|e| napi::Error::new(
                Status::InvalidArg, 
                format!("Failed to serialize event payload: {}", e)
            ))?;
        
        // Create JavaScript string from JSON
        let js_str = ctx.env.create_string(&json_str)?;
        
        // Return as single argument to callback
        Ok(vec![js_str])
    })?;

    // Store the callback for this wallet
    {
        let mut callbacks = WALLET_CALLBACKS.lock().map_err(|_| {
            napi::Error::new(Status::GenericFailure, "Failed to acquire callback lock")
        })?;
        
        callbacks.insert(wallet_handle, tsfn);
    }

    // Initialize event processing system if not already done
    ensure_event_processor_started()?;

    Ok(())
}

/// Remove event callback for a wallet
#[napi]
pub fn wallet_remove_event_callback(wallet_handle: WalletHandle) -> Result<()> {
    let mut callbacks = WALLET_CALLBACKS.lock().map_err(|_| {
        napi::Error::new(Status::GenericFailure, "Failed to acquire callback lock")
    })?;
    
    if let Some(callback) = callbacks.remove(&wallet_handle) {
        // Abort the ThreadsafeFunction to clean up resources
        callback.abort()?;
    }
    
    Ok(())
}

/// Check if a wallet has a registered event callback
pub fn has_event_callback(wallet_handle: WalletHandle) -> bool {
    if let Ok(callbacks) = WALLET_CALLBACKS.lock() {
        callbacks.contains_key(&wallet_handle)
    } else {
        false
    }
}

/// Emit an event to JavaScript (internal use)
pub fn emit_wallet_event(
    wallet_handle: WalletHandle,
    event_type: &str,
    data: serde_json::Value,
) -> napi::Result<()> {
    let payload = EventPayload {
        event_type: event_type.to_string(),
        wallet_handle,
        data,
        timestamp: chrono::Utc::now().timestamp_millis(),
    };

    // Send to event processor
    if let Ok(emitter_lock) = EVENT_EMITTER.lock() {
        if let Some(sender) = emitter_lock.as_ref() {
            sender.send(payload).map_err(|e| {
                napi::Error::new(Status::GenericFailure, format!("Failed to send event: {}", e))
            })?;
        }
    }

    Ok(())
}

/// Emit event directly to callback (synchronous, for urgent events)
pub fn emit_wallet_event_direct(
    wallet_handle: WalletHandle,
    event_type: &str,
    data: serde_json::Value,
) -> napi::Result<()> {
    let payload = EventPayload {
        event_type: event_type.to_string(),
        wallet_handle,
        data,
        timestamp: chrono::Utc::now().timestamp_millis(),
    };

    let callbacks = WALLET_CALLBACKS.lock().map_err(|_| {
        napi::Error::new(Status::GenericFailure, "Failed to acquire callback lock")
    })?;

    if let Some(callback) = callbacks.get(&wallet_handle) {
        // Call the JavaScript callback directly (non-blocking)
        callback.call(Ok(payload), ThreadsafeFunctionCallMode::NonBlocking);
    }

    Ok(())
}

/// Initialize the async event processing system
fn ensure_event_processor_started() -> Result<()> {
    let mut emitter_lock = EVENT_EMITTER.lock().map_err(|_| {
        napi::Error::new(Status::GenericFailure, "Failed to acquire emitter lock")
    })?;

    // Only start if not already running
    if emitter_lock.is_none() {
        let (sender, mut receiver) = mpsc::unbounded_channel::<EventPayload>();
        *emitter_lock = Some(sender);

        // Spawn async task to process events
        tokio::spawn(async move {
            while let Some(payload) = receiver.recv().await {
                process_event_payload(payload).await;
            }
        });
    }

    Ok(())
}

/// Process an event payload by calling the appropriate callback
async fn process_event_payload(payload: EventPayload) {
    let callbacks = match WALLET_CALLBACKS.lock() {
        Ok(guard) => guard,
        Err(_) => {
            eprintln!("Failed to acquire callback lock for event processing");
            return;
        }
    };

    if let Some(callback) = callbacks.get(&payload.wallet_handle) {
        // Call the JavaScript callback with the event payload
        callback.call(Ok(payload), ThreadsafeFunctionCallMode::NonBlocking);
    }
}

/// Get statistics about registered callbacks
#[napi]
pub fn get_callback_stats() -> Result<JsCallbackStats> {
    let callbacks = WALLET_CALLBACKS.lock().map_err(|_| {
        napi::Error::new(Status::GenericFailure, "Failed to acquire callback lock")
    })?;

    Ok(JsCallbackStats {
        registered_wallets: callbacks.len() as u32,
        active_callbacks: callbacks.values().count() as u32,
    })
}

/// JavaScript-visible callback statistics
#[napi(object)]
pub struct JsCallbackStats {
    pub registered_wallets: u32,
    pub active_callbacks: u32,
}

/// Cleanup all callbacks (for testing and shutdown)
#[napi]
pub fn cleanup_all_callbacks() -> Result<()> {
    let mut callbacks = WALLET_CALLBACKS.lock().map_err(|_| {
        napi::Error::new(Status::GenericFailure, "Failed to acquire callback lock")
    })?;

    // Abort all ThreadsafeFunctions
    for (_, callback) in callbacks.drain() {
        let _ = callback.abort(); // Ignore errors during cleanup
    }

    // Clear event emitter
    let mut emitter_lock = EVENT_EMITTER.lock().map_err(|_| {
        napi::Error::new(Status::GenericFailure, "Failed to acquire emitter lock")
    })?;
    *emitter_lock = None;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_payload_serialization() {
        let payload = EventPayload {
            event_type: "tx:received".to_string(),
            wallet_handle: 123,
            data: serde_json::json!({"amount": 1000, "from": "test_address"}),
            timestamp: 1234567890,
        };

        let json = serde_json::to_string(&payload).unwrap();
        let deserialized: EventPayload = serde_json::from_str(&json).unwrap();

        assert_eq!(payload.event_type, deserialized.event_type);
        assert_eq!(payload.wallet_handle, deserialized.wallet_handle);
        assert_eq!(payload.timestamp, deserialized.timestamp);
    }

    #[test]
    fn test_has_event_callback() {
        // Should return false for non-existent wallet
        assert!(!has_event_callback(999));
    }
}
