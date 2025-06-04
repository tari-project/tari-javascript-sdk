use neon::prelude::*;
use once_cell::sync::Lazy;
use std::sync::Mutex;
use std::collections::HashMap;

type CallbackId = u64;

struct CallbackRegistry {
    next_id: CallbackId,
    callbacks: HashMap<CallbackId, Root<JsFunction>>,
}

static CALLBACK_REGISTRY: Lazy<Mutex<CallbackRegistry>> = Lazy::new(|| {
    Mutex::new(CallbackRegistry {
        next_id: 1,
        callbacks: HashMap::new(),
    })
});

/// Register a callback function and return its ID
pub fn register_callback(func: Root<JsFunction>) -> CallbackId {
    let mut registry = CALLBACK_REGISTRY.lock().unwrap();
    let id = registry.next_id;
    registry.next_id += 1;
    registry.callbacks.insert(id, func);
    id
}

/// Unregister a callback by ID
pub fn unregister_callback(id: CallbackId) -> bool {
    let mut registry = CALLBACK_REGISTRY.lock().unwrap();
    registry.callbacks.remove(&id).is_some()
}

/// Call a registered callback with the provided arguments
pub fn call_callback(channel: &Channel, id: CallbackId, args: Vec<Handle<JsValue>>) -> Result<(), neon::result::Throw> {
    let registry = CALLBACK_REGISTRY.lock().unwrap();
    if let Some(callback) = registry.callbacks.get(&id) {
        let callback = callback.clone();
        drop(registry); // Release lock before calling
        
        channel.send(move |mut cx| {
            let this = cx.undefined();
            let args: Vec<Handle<JsValue>> = args.into_iter()
                .map(|arg| arg.upcast())
                .collect();
            
            match callback.into_inner(&mut cx).call(&mut cx, this, args) {
                Ok(_) => Ok(()),
                Err(e) => {
                    // Log error but don't propagate to avoid crashing
                    eprintln!("Callback error: {:?}", e);
                    Ok(())
                }
            }
        });
    }
    Ok(())
}

/// Clear all registered callbacks (useful for cleanup)
pub fn clear_all_callbacks() {
    let mut registry = CALLBACK_REGISTRY.lock().unwrap();
    registry.callbacks.clear();
}

/// Get the count of registered callbacks
pub fn callback_count() -> usize {
    let registry = CALLBACK_REGISTRY.lock().unwrap();
    registry.callbacks.len()
}

// Specific callback types for Tari wallet events

/// Transaction callback data structure
pub struct TransactionCallbackData {
    pub transaction_id: u64,
    pub amount: u64,
    pub fee: u64,
    pub message: String,
    pub is_outbound: bool,
    pub status: u32,
}

/// Balance callback data structure
pub struct BalanceCallbackData {
    pub available: u64,
    pub pending: u64,
    pub locked: u64,
    pub total: u64,
}

/// Connectivity callback data structure
pub struct ConnectivityCallbackData {
    pub status: u32,
    pub connection_count: u32,
}

/// Convert transaction data to JS values
pub fn transaction_to_js_values(mut cx: FunctionContext, data: &TransactionCallbackData) -> NeonResult<Vec<Handle<JsValue>>> {
    let obj = cx.empty_object();
    obj.set(&mut cx, "id", cx.string(&data.transaction_id.to_string()))?;
    obj.set(&mut cx, "amount", cx.string(&data.amount.to_string()))?;
    obj.set(&mut cx, "fee", cx.string(&data.fee.to_string()))?;
    obj.set(&mut cx, "message", cx.string(&data.message))?;
    obj.set(&mut cx, "isOutbound", cx.boolean(data.is_outbound))?;
    obj.set(&mut cx, "status", cx.number(data.status as f64))?;
    
    Ok(vec![obj.upcast()])
}

/// Convert balance data to JS values
pub fn balance_to_js_values(mut cx: FunctionContext, data: &BalanceCallbackData) -> NeonResult<Vec<Handle<JsValue>>> {
    let obj = cx.empty_object();
    obj.set(&mut cx, "available", cx.string(&data.available.to_string()))?;
    obj.set(&mut cx, "pending", cx.string(&data.pending.to_string()))?;
    obj.set(&mut cx, "locked", cx.string(&data.locked.to_string()))?;
    obj.set(&mut cx, "total", cx.string(&data.total.to_string()))?;
    
    Ok(vec![obj.upcast()])
}

/// Convert connectivity data to JS values
pub fn connectivity_to_js_values(mut cx: FunctionContext, data: &ConnectivityCallbackData) -> NeonResult<Vec<Handle<JsValue>>> {
    let obj = cx.empty_object();
    obj.set(&mut cx, "status", cx.number(data.status as f64))?;
    obj.set(&mut cx, "connectionCount", cx.number(data.connection_count as f64))?;
    
    Ok(vec![obj.upcast()])
}

// Wallet callback registry to associate callbacks with wallet handles
static WALLET_CALLBACKS: Lazy<Mutex<HashMap<u64, WalletCallbacks>>> = Lazy::new(|| {
    Mutex::new(HashMap::new())
});

#[derive(Clone)]
pub struct WalletCallbacks {
    pub transaction_received: Option<CallbackId>,
    pub transaction_broadcast: Option<CallbackId>,
    pub transaction_mined: Option<CallbackId>,
    pub balance_updated: Option<CallbackId>,
    pub connectivity_changed: Option<CallbackId>,
}

impl Default for WalletCallbacks {
    fn default() -> Self {
        Self {
            transaction_received: None,
            transaction_broadcast: None,
            transaction_mined: None,
            balance_updated: None,
            connectivity_changed: None,
        }
    }
}

/// Register callbacks for a specific wallet
pub fn register_wallet_callbacks(wallet_handle: u64, callbacks: WalletCallbacks) {
    let mut registry = WALLET_CALLBACKS.lock().unwrap();
    registry.insert(wallet_handle, callbacks);
}

/// Unregister all callbacks for a wallet
pub fn unregister_wallet_callbacks(wallet_handle: u64) {
    let mut registry = WALLET_CALLBACKS.lock().unwrap();
    if let Some(callbacks) = registry.remove(&wallet_handle) {
        // Unregister all individual callbacks
        if let Some(id) = callbacks.transaction_received {
            unregister_callback(id);
        }
        if let Some(id) = callbacks.transaction_broadcast {
            unregister_callback(id);
        }
        if let Some(id) = callbacks.transaction_mined {
            unregister_callback(id);
        }
        if let Some(id) = callbacks.balance_updated {
            unregister_callback(id);
        }
        if let Some(id) = callbacks.connectivity_changed {
            unregister_callback(id);
        }
    }
}

/// Get callbacks for a specific wallet
pub fn get_wallet_callbacks(wallet_handle: u64) -> Option<WalletCallbacks> {
    let registry = WALLET_CALLBACKS.lock().unwrap();
    registry.get(&wallet_handle).cloned()
}

// Mock functions to trigger callbacks (in real implementation, these would be called by FFI)

/// Simulate a received transaction event
pub fn mock_transaction_received(channel: &Channel, wallet_handle: u64, tx_data: TransactionCallbackData) {
    if let Some(callbacks) = get_wallet_callbacks(wallet_handle) {
        if let Some(callback_id) = callbacks.transaction_received {
            let _ = channel.send(move |mut cx| {
                let args = transaction_to_js_values(cx, &tx_data)?;
                call_callback(&cx.channel(), callback_id, args)?;
                Ok(())
            });
        }
    }
}

/// Simulate a balance update event
pub fn mock_balance_updated(channel: &Channel, wallet_handle: u64, balance_data: BalanceCallbackData) {
    if let Some(callbacks) = get_wallet_callbacks(wallet_handle) {
        if let Some(callback_id) = callbacks.balance_updated {
            let _ = channel.send(move |mut cx| {
                let args = balance_to_js_values(cx, &balance_data)?;
                call_callback(&cx.channel(), callback_id, args)?;
                Ok(())
            });
        }
    }
}

/// Simulate a connectivity change event
pub fn mock_connectivity_changed(channel: &Channel, wallet_handle: u64, conn_data: ConnectivityCallbackData) {
    if let Some(callbacks) = get_wallet_callbacks(wallet_handle) {
        if let Some(callback_id) = callbacks.connectivity_changed {
            let _ = channel.send(move |mut cx| {
                let args = connectivity_to_js_values(cx, &conn_data)?;
                call_callback(&cx.channel(), callback_id, args)?;
                Ok(())
            });
        }
    }
}

/// Export callback registration functions
pub fn register_callback_functions(cx: &mut ModuleContext) -> NeonResult<()> {
    // Register callback function
    fn register_js_callback(mut cx: FunctionContext) -> JsResult<JsNumber> {
        let callback = cx.argument::<JsFunction>(0)?.root(&mut cx);
        let id = register_callback(callback);
        Ok(cx.number(id as f64))
    }
    
    // Unregister callback function
    fn unregister_js_callback(mut cx: FunctionContext) -> JsResult<JsBoolean> {
        let id = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
        let success = unregister_callback(id);
        Ok(cx.boolean(success))
    }
    
    // Clear all callbacks function
    fn clear_all_js_callbacks(mut cx: FunctionContext) -> JsResult<JsUndefined> {
        clear_all_callbacks();
        Ok(cx.undefined())
    }
    
    // Get callback count
    fn get_callback_count(mut cx: FunctionContext) -> JsResult<JsNumber> {
        let count = callback_count();
        Ok(cx.number(count as f64))
    }
    
    cx.export_function("registerCallback", register_js_callback)?;
    cx.export_function("unregisterCallback", unregister_js_callback)?;
    cx.export_function("clearAllCallbacks", clear_all_js_callbacks)?;
    cx.export_function("getCallbackCount", get_callback_count)?;
    
    Ok(())
}
