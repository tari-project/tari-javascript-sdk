use neon::prelude::*;
use crate::error::TariError;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;

/// Callback information storage
pub struct CallbackInfo {
    pub id: u64,
    pub callback: Root<JsFunction>,
    pub created_at: std::time::SystemTime,
}

/// Global callback manager
pub struct CallbackManager {
    callbacks: HashMap<u64, CallbackInfo>,
    counter: u64,
}

impl CallbackManager {
    pub fn new() -> Self {
        Self {
            callbacks: HashMap::new(),
            counter: 0,
        }
    }
    
    pub fn register<'a, C: Context<'a>>(&mut self, callback: Handle<JsFunction>, cx: &mut C) -> u64 {
        self.counter += 1;
        let id = self.counter;
        let info = CallbackInfo {
            id,
            callback: callback.root(cx),
            created_at: std::time::SystemTime::now(),
        };
        self.callbacks.insert(id, info);
        id
    }
    
    pub fn unregister(&mut self, id: u64) -> bool {
        self.callbacks.remove(&id).is_some()
    }
    
    pub fn clear_all(&mut self) {
        self.callbacks.clear();
    }
    
    pub fn count(&self) -> usize {
        self.callbacks.len()
    }
    
    pub fn get(&self, id: u64) -> Option<&CallbackInfo> {
        self.callbacks.get(&id)
    }
}

static CALLBACK_MANAGER: Lazy<Arc<Mutex<CallbackManager>>> = 
    Lazy::new(|| Arc::new(Mutex::new(CallbackManager::new())));

/// Register a callback function
pub fn register_callback(mut cx: FunctionContext) -> JsResult<JsNumber> {
    let callback = cx.argument::<JsFunction>(0)?;
    
    let mut manager = CALLBACK_MANAGER.lock().unwrap();
    let id = manager.register(callback, &mut cx);
    
    log::debug!("Registered callback with ID: {}", id);
    Ok(cx.number(id as f64))
}

/// Unregister a callback by ID
pub fn unregister_callback(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let id = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    
    let mut manager = CALLBACK_MANAGER.lock().unwrap();
    let success = manager.unregister(id);
    
    if success {
        log::debug!("Unregistered callback with ID: {}", id);
    } else {
        log::warn!("Failed to unregister callback with ID: {}", id);
    }
    
    Ok(cx.boolean(success))
}

/// Clear all registered callbacks
pub fn clear_all_callbacks(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let mut manager = CALLBACK_MANAGER.lock().unwrap();
    let count = manager.count();
    manager.clear_all();
    
    log::debug!("Cleared {} callbacks", count);
    Ok(cx.undefined())
}

/// Get the number of registered callbacks
pub fn get_callback_count(mut cx: FunctionContext) -> JsResult<JsNumber> {
    let manager = CALLBACK_MANAGER.lock().unwrap();
    let count = manager.count();
    
    log::debug!("Current callback count: {}", count);
    Ok(cx.number(count as f64))
}

/// Trigger a callback with given parameters (internal use)
pub fn trigger_callback(id: u64, params: Vec<String>) -> Result<(), String> {
    let manager = CALLBACK_MANAGER.lock().unwrap();
    
    if let Some(callback_info) = manager.get(id) {
        // TODO: Implement actual callback triggering
        // This would require a channel to communicate with the JS thread
        log::debug!("Would trigger callback {} with params: {:?}", id, params);
        Ok(())
    } else {
        Err(format!("Callback {} not found", id))
    }
}

/// Test a callback by calling it with sample data
pub fn test_callback(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let id = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    let test_message = cx.argument::<JsString>(1)?.value(&mut cx);
    
    let manager = CALLBACK_MANAGER.lock().unwrap();
    
    if let Some(callback_info) = manager.get(id) {
        // Create test parameters
        let test_params = vec![test_message];
        
        // For now, just log that we would call the callback
        log::debug!("Testing callback {} with message: {:?}", id, test_params);
        
        // TODO: Implement actual callback invocation
        // This requires careful handling of the JavaScript context
        drop(manager);
        Ok(cx.undefined())
    } else {
        TariError::InvalidHandle(id).to_js_error(&mut cx)
    }
}
