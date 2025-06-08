use neon::prelude::*;
use crate::error::TariError;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;

// Wallet event imports
use minotari_wallet::output_manager_service::handle::OutputManagerEvent;
use minotari_wallet::transaction_service::handle::TransactionEvent;
use tokio::sync::broadcast;
use std::sync::mpsc;

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
    
    if let Some(_callback_info) = manager.get(id) {
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
    
    if let Some(_callback_info) = manager.get(id) {
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

/// Enhanced callback manager with event processing
pub struct EventCallbackManager {
    transaction_callbacks: Vec<u64>,
    balance_callbacks: Vec<u64>,
    connectivity_callbacks: Vec<u64>,
    recovery_callbacks: Vec<u64>,
    event_senders: HashMap<String, mpsc::Sender<WalletEvent>>,
}

impl EventCallbackManager {
    pub fn new() -> Self {
        Self {
            transaction_callbacks: Vec::new(),
            balance_callbacks: Vec::new(),
            connectivity_callbacks: Vec::new(),
            recovery_callbacks: Vec::new(),
            event_senders: HashMap::new(),
        }
    }

    /// Register callback for transaction events
    pub fn register_transaction_callback(&mut self, callback_id: u64) -> Result<(), String> {
        if !self.transaction_callbacks.contains(&callback_id) {
            self.transaction_callbacks.push(callback_id);
            log::debug!("Registered transaction callback {}", callback_id);
        }
        Ok(())
    }

    /// Register callback for balance update events
    pub fn register_balance_callback(&mut self, callback_id: u64) -> Result<(), String> {
        if !self.balance_callbacks.contains(&callback_id) {
            self.balance_callbacks.push(callback_id);
            log::debug!("Registered balance callback {}", callback_id);
        }
        Ok(())
    }

    /// Register callback for connectivity events
    pub fn register_connectivity_callback(&mut self, callback_id: u64) -> Result<(), String> {
        if !self.connectivity_callbacks.contains(&callback_id) {
            self.connectivity_callbacks.push(callback_id);
            log::debug!("Registered connectivity callback {}", callback_id);
        }
        Ok(())
    }

    /// Register callback for recovery events
    pub fn register_recovery_callback(&mut self, callback_id: u64) -> Result<(), String> {
        if !self.recovery_callbacks.contains(&callback_id) {
            self.recovery_callbacks.push(callback_id);
            log::debug!("Registered recovery callback {}", callback_id);
        }
        Ok(())
    }
}

/// Wallet event types
#[derive(Debug, Clone)]
pub enum WalletEvent {
    TransactionReceived { tx_id: String, amount: u64 },
    TransactionSent { tx_id: String, amount: u64 },
    TransactionConfirmed { tx_id: String },
    BalanceUpdated { available: u64, pending: u64 },
    PeerConnected { peer_id: String },
    PeerDisconnected { peer_id: String },
    RecoveryProgress { percentage: f64, blocks_scanned: u64 },
}

/// Process transaction events
pub async fn process_transaction_event(event: TransactionEvent) -> Result<(), String> {
    match event {
        TransactionEvent::ReceivedTransaction(tx_id) => {
            log::info!("Processing received transaction event: {:?}", tx_id);
            // In a real implementation, this would:
            // 1. Extract transaction details
            // 2. Trigger registered transaction callbacks
            // 3. Update wallet balance
            Ok(())
        }
        TransactionEvent::TransactionSendResult { tx_id, result } => {
            log::info!("Processing transaction send result: {:?} -> {:?}", tx_id, result);
            // Handle transaction send completion
            Ok(())
        }
        _ => {
            log::debug!("Unhandled transaction event: {:?}", event);
            Ok(())
        }
    }
}

/// Process output manager events
pub async fn process_output_manager_event(event: OutputManagerEvent) -> Result<(), String> {
    match event {
        OutputManagerEvent::TxoValidationSuccess(_) => {
            log::info!("Processing TXO validation success event");
            // Handle successful output validation
            Ok(())
        }
        OutputManagerEvent::TxoValidationFailure { .. } => {
            log::warn!("Processing TXO validation failure event");
            // Handle failed output validation
            Ok(())
        }
        _ => {
            log::debug!("Unhandled output manager event: {:?}", event);
            Ok(())
        }
    }
}

/// Global event callback manager
static EVENT_CALLBACK_MANAGER: Lazy<Arc<Mutex<EventCallbackManager>>> = 
    Lazy::new(|| Arc::new(Mutex::new(EventCallbackManager::new())));
