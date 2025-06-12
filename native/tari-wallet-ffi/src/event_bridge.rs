/**
 * Event bridge for marshaling Tari wallet events to JavaScript
 * 
 * This module acts as an adapter between Tari wallet events and
 * the JavaScript callback system, handling event transformation
 * and routing.
 */

use serde_json::json;
use std::collections::HashMap;

use crate::types::WalletHandle;
use crate::callbacks::{emit_wallet_event, emit_wallet_event_direct};
use crate::error::TariWalletError;

/// Transaction event types from Tari wallet
#[derive(Debug, Clone)]
pub enum TransactionEvent {
    Received {
        tx_id: u64,
        amount: u64,
        source_address: String,
        message: String,
    },
    Broadcast {
        tx_id: u64,
        amount: u64,
        destination: String,
    },
    Mined {
        tx_id: u64,
        block_height: u64,
        block_hash: String,
        confirmations: u32,
    },
    Cancelled {
        tx_id: u64,
        reason: String,
    },
}

/// Balance event from Tari wallet
#[derive(Debug, Clone)]
pub struct BalanceEvent {
    pub available: u64,
    pub pending_incoming: u64,
    pub pending_outgoing: u64,
    pub total: u64,
}

/// Connectivity event from Tari wallet
#[derive(Debug, Clone)]
pub enum ConnectivityEvent {
    Connected {
        base_node_address: String,
        peer_count: u32,
    },
    Disconnected {
        reason: String,
    },
    Syncing {
        current_block: u64,
        target_block: u64,
    },
}

/// Sync progress event from Tari wallet
#[derive(Debug, Clone)]
pub struct SyncProgressEvent {
    pub current: u64,
    pub total: u64,
}

/// Event bridge for converting Tari events to JavaScript events
pub struct EventBridge {
    wallet_handle: WalletHandle,
}

impl EventBridge {
    /// Create a new event bridge for a wallet
    pub fn new(wallet_handle: WalletHandle) -> Self {
        Self { wallet_handle }
    }

    /// Handle a transaction event
    pub fn handle_transaction_event(&self, event: TransactionEvent) -> Result<(), TariWalletError> {
        let (event_type, data) = match event {
            TransactionEvent::Received { tx_id, amount, source_address, message } => {
                let data = json!({
                    "id": tx_id,
                    "amount": amount.to_string(),
                    "source": source_address,
                    "message": message,
                    "status": "pending",
                    "isInbound": true,
                    "timestamp": chrono::Utc::now().timestamp_millis(),
                    "confirmations": 0
                });
                ("tx:received", data)
            },
            TransactionEvent::Broadcast { tx_id, amount, destination } => {
                let data = json!({
                    "id": tx_id,
                    "amount": amount.to_string(),
                    "destination": destination,
                    "status": "broadcast",
                    "isInbound": false,
                    "timestamp": chrono::Utc::now().timestamp_millis(),
                    "confirmations": 0
                });
                ("tx:broadcast", data)
            },
            TransactionEvent::Mined { tx_id, block_height, block_hash, confirmations } => {
                let data = json!({
                    "id": tx_id,
                    "blockHeight": block_height,
                    "blockHash": block_hash,
                    "confirmations": confirmations,
                    "status": "mined_confirmed",
                    "timestamp": chrono::Utc::now().timestamp_millis()
                });
                ("tx:mined", data)
            },
            TransactionEvent::Cancelled { tx_id, reason } => {
                let data = json!({
                    "id": tx_id,
                    "reason": reason,
                    "status": "cancelled",
                    "cancelledAt": chrono::Utc::now().timestamp_millis()
                });
                ("tx:cancelled", data)
            },
        };

        emit_wallet_event(self.wallet_handle, event_type, data)
    }

    /// Handle a balance update event
    pub fn handle_balance_event(&self, event: BalanceEvent) -> Result<(), TariWalletError> {
        let data = json!({
            "available": event.available.to_string(),
            "pendingIncoming": event.pending_incoming.to_string(),
            "pendingOutgoing": event.pending_outgoing.to_string(),
            "total": event.total.to_string(),
            "lastUpdated": chrono::Utc::now().timestamp_millis()
        });

        emit_wallet_event(self.wallet_handle, "balance:updated", data)
    }

    /// Handle a connectivity event
    pub fn handle_connectivity_event(&self, event: ConnectivityEvent) -> Result<(), TariWalletError> {
        let (status, data) = match event {
            ConnectivityEvent::Connected { base_node_address, peer_count } => {
                let data = json!({
                    "status": "online",
                    "baseNode": base_node_address,
                    "peerCount": peer_count,
                    "timestamp": chrono::Utc::now().timestamp_millis()
                });
                ("connectivity:changed", data)
            },
            ConnectivityEvent::Disconnected { reason } => {
                let data = json!({
                    "status": "offline",
                    "reason": reason,
                    "peerCount": 0,
                    "timestamp": chrono::Utc::now().timestamp_millis()
                });
                ("connectivity:changed", data)
            },
            ConnectivityEvent::Syncing { current_block, target_block } => {
                let data = json!({
                    "status": "syncing",
                    "currentBlock": current_block,
                    "targetBlock": target_block,
                    "peerCount": 1, // Assume at least one peer when syncing
                    "timestamp": chrono::Utc::now().timestamp_millis()
                });
                ("connectivity:changed", data)
            },
        };

        emit_wallet_event(self.wallet_handle, status, data)
    }

    /// Handle a sync progress event
    pub fn handle_sync_progress(&self, event: SyncProgressEvent) -> Result<(), TariWalletError> {
        let percent = if event.total > 0 {
            ((event.current as f64 / event.total as f64) * 100.0) as u32
        } else {
            0
        };

        // Calculate estimated time remaining (simple estimation)
        let estimated_time_remaining = if event.current > 0 && event.total > event.current {
            let remaining_blocks = event.total - event.current;
            // Assume 1 block per second processing speed
            Some(remaining_blocks)
        } else {
            None
        };

        let data = json!({
            "current": event.current,
            "total": event.total,
            "percent": percent,
            "estimatedTimeRemaining": estimated_time_remaining,
            "timestamp": chrono::Utc::now().timestamp_millis()
        });

        emit_wallet_event(self.wallet_handle, "sync:progress", data)
    }

    /// Handle wallet lifecycle events
    pub fn handle_wallet_started(&self) -> Result<(), TariWalletError> {
        let data = json!({
            "timestamp": chrono::Utc::now().timestamp_millis()
        });
        
        // Use direct emit for critical lifecycle events
        emit_wallet_event_direct(self.wallet_handle, "wallet:started", data)
    }

    pub fn handle_wallet_stopped(&self) -> Result<(), TariWalletError> {
        let data = json!({
            "timestamp": chrono::Utc::now().timestamp_millis()
        });
        
        emit_wallet_event_direct(self.wallet_handle, "wallet:stopped", data)
    }

    /// Handle base node connection events
    pub fn handle_base_node_connected(&self, address: String) -> Result<(), TariWalletError> {
        let data = json!({
            "address": address,
            "timestamp": chrono::Utc::now().timestamp_millis()
        });
        
        emit_wallet_event(self.wallet_handle, "basenode:connected", data)
    }

    pub fn handle_base_node_disconnected(&self, address: String) -> Result<(), TariWalletError> {
        let data = json!({
            "address": address,
            "timestamp": chrono::Utc::now().timestamp_millis()
        });
        
        emit_wallet_event(self.wallet_handle, "basenode:disconnected", data)
    }

    /// Handle error events
    pub fn handle_error(&self, error: &str, context: HashMap<String, String>) -> Result<(), TariWalletError> {
        let data = json!({
            "error": error,
            "context": context,
            "timestamp": chrono::Utc::now().timestamp_millis()
        });
        
        // Use direct emit for error events (high priority)
        emit_wallet_event_direct(self.wallet_handle, "error", data)
    }

    /// Handle sync completion
    pub fn handle_sync_completed(&self, duration_ms: u64) -> Result<(), TariWalletError> {
        let data = json!({
            "timestamp": chrono::Utc::now().timestamp_millis(),
            "duration": duration_ms
        });
        
        emit_wallet_event(self.wallet_handle, "sync:completed", data)
    }

    /// Handle sync failure
    pub fn handle_sync_failed(&self, error: &str) -> Result<(), TariWalletError> {
        let data = json!({
            "error": error,
            "timestamp": chrono::Utc::now().timestamp_millis()
        });
        
        emit_wallet_event_direct(self.wallet_handle, "sync:failed", data)
    }
}

/// Helper functions for creating event bridges

/// Create event bridge for a wallet handle
pub fn create_event_bridge(wallet_handle: WalletHandle) -> EventBridge {
    EventBridge::new(wallet_handle)
}

/// Simulate a transaction received event (for testing)
#[cfg(any(test, feature = "test-utils"))]
pub fn simulate_transaction_received(
    wallet_handle: WalletHandle,
    tx_id: u64,
    amount: u64,
    source: &str,
) -> Result<(), TariWalletError> {
    let bridge = EventBridge::new(wallet_handle);
    let event = TransactionEvent::Received {
        tx_id,
        amount,
        source_address: source.to_string(),
        message: "Test transaction".to_string(),
    };
    bridge.handle_transaction_event(event)
}

/// Simulate a balance update event (for testing)
#[cfg(any(test, feature = "test-utils"))]
pub fn simulate_balance_update(
    wallet_handle: WalletHandle,
    available: u64,
    pending_incoming: u64,
    pending_outgoing: u64,
) -> Result<(), TariWalletError> {
    let bridge = EventBridge::new(wallet_handle);
    let event = BalanceEvent {
        available,
        pending_incoming,
        pending_outgoing,
        total: available + pending_incoming,
    };
    bridge.handle_balance_event(event)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transaction_event_conversion() {
        let event = TransactionEvent::Received {
            tx_id: 123,
            amount: 1000,
            source_address: "test_address".to_string(),
            message: "test message".to_string(),
        };

        // This would normally be tested with a mock callback
        // For now, just verify the enum works correctly
        match event {
            TransactionEvent::Received { tx_id, amount, .. } => {
                assert_eq!(tx_id, 123);
                assert_eq!(amount, 1000);
            }
            _ => panic!("Wrong event type"),
        }
    }

    #[test]
    fn test_balance_event_creation() {
        let event = BalanceEvent {
            available: 1000,
            pending_incoming: 500,
            pending_outgoing: 200,
            total: 1500,
        };

        assert_eq!(event.available, 1000);
        assert_eq!(event.total, 1500);
    }
}
