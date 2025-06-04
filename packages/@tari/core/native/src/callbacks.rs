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
pub fn call_callback<'a>(cx: &mut FunctionContext<'a>, id: CallbackId, args: Vec<Handle<'a, JsValue>>) -> Result<(), neon::result::Throw> {
    let registry = CALLBACK_REGISTRY.lock().unwrap();
    if let Some(callback) = registry.callbacks.get(&id) {
        let callback = callback.clone(cx);
        drop(registry); // Release lock before calling
        
        let this = cx.undefined();
        match callback.into_inner(cx).call(cx, this, args) {
            Ok(_) => Ok(()),
            Err(e) => {
                // Log error but don't propagate to avoid crashing
                eprintln!("Callback error: {:?}", e);
                Ok(())
            }
        }
    } else {
        Ok(())
    }
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
pub fn transaction_to_js_values<'a>(mut cx: FunctionContext<'a>, data: &TransactionCallbackData) -> NeonResult<Vec<Handle<'a, JsValue>>> {
    let obj = cx.empty_object();
    let id_str = cx.string(&data.transaction_id.to_string());
    let amount_str = cx.string(&data.amount.to_string());
    let fee_str = cx.string(&data.fee.to_string());
    let msg_str = cx.string(&data.message);
    let is_outbound = cx.boolean(data.is_outbound);
    let status_num = cx.number(data.status as f64);
    
    obj.set(&mut cx, "id", id_str)?;
    obj.set(&mut cx, "amount", amount_str)?;
    obj.set(&mut cx, "fee", fee_str)?;
    obj.set(&mut cx, "message", msg_str)?;
    obj.set(&mut cx, "isOutbound", is_outbound)?;
    obj.set(&mut cx, "status", status_num)?;
    
    Ok(vec![obj.upcast()])
}

/// Convert balance data to JS values
pub fn balance_to_js_values<'a>(mut cx: FunctionContext<'a>, data: &BalanceCallbackData) -> NeonResult<Vec<Handle<'a, JsValue>>> {
    let obj = cx.empty_object();
    let available_str = cx.string(&data.available.to_string());
    let pending_str = cx.string(&data.pending.to_string());
    let locked_str = cx.string(&data.locked.to_string());
    let total_str = cx.string(&data.total.to_string());
    
    obj.set(&mut cx, "available", available_str)?;
    obj.set(&mut cx, "pending", pending_str)?;
    obj.set(&mut cx, "locked", locked_str)?;
    obj.set(&mut cx, "total", total_str)?;
    
    Ok(vec![obj.upcast()])
}

/// Convert connectivity data to JS values
pub fn connectivity_to_js_values<'a>(mut cx: FunctionContext<'a>, data: &ConnectivityCallbackData) -> NeonResult<Vec<Handle<'a, JsValue>>> {
    let obj = cx.empty_object();
    let status_num = cx.number(data.status as f64);
    let count_num = cx.number(data.connection_count as f64);
    
    obj.set(&mut cx, "status", status_num)?;
    obj.set(&mut cx, "connectionCount", count_num)?;
    
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
// Note: These are simplified for the mock implementation

/// Simulate a transaction event (simplified for mock)
pub fn mock_trigger_callback(callback_id: CallbackId) {
    // In a real implementation, this would be triggered by FFI events
    // For now, just mark that the callback system is set up
    let registry = CALLBACK_REGISTRY.lock().unwrap();
    if registry.callbacks.contains_key(&callback_id) {
        // Callback exists and would be triggered in real implementation
        eprintln!("Mock: Would trigger callback {}", callback_id);
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
