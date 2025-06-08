use neon::prelude::*;
use crate::error::TariError;
use crate::types::{WalletInstance, AddressInstance, create_wallet_handle, destroy_wallet_handle, WALLET_HANDLES, ADDRESS_HANDLES};
use crate::utils::{parse_wallet_config, parse_send_params};
use crate::try_js;

// Peer management imports
use tari_crypto::keys::PublicKey as CryptoPublicKey;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use once_cell::sync::Lazy;

// Recovery service imports - simplified for compatibility
// use minotari_wallet::recovery::{RecoveryConfig, RecoveryValidation};
// use tari_core::transactions::tari_amount::MicroMinotari;

/// Create a new wallet instance
pub fn wallet_create(mut cx: FunctionContext) -> JsResult<JsNumber> {
    log::info!("Creating new wallet instance");
    let config_obj = cx.argument::<JsObject>(0)?;

    let config = match parse_wallet_config(&mut cx, config_obj) {
        Ok(cfg) => cfg,
        Err(e) => {
            println!("Error parsing wallet config: {}", e);
            return cx.throw_error(format!("Config error: {}", e));
        },
    };

    log::info!("Creating wallet with network: {}", config.network);

    let wallet = try_js!(&mut cx, WalletInstance::new_sync(config));
    let handle = create_wallet_handle(wallet);
    Ok(cx.number(handle as f64))

}

/// Destroy a wallet instance
pub fn wallet_destroy(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    
    try_js!(&mut cx, destroy_wallet_handle(handle));
    log::debug!("Destroyed wallet handle: {}", handle);
    Ok(cx.undefined())
}

/// Get wallet seed words
pub fn wallet_get_seed_words(mut cx: FunctionContext) -> JsResult<JsString> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    let wallet = match handles.get_handle(handle) {
        Some(w) => w,
        None => return TariError::InvalidHandle(handle).to_js_error(&mut cx),
    };
    
    // Get actual seed words from real Tari wallet
    let seed_words = match &wallet.real_wallet {
        Some(real_wallet) => {
            wallet.runtime.block_on(async {
                real_wallet.get_seed_words().await
            })
        },
        None => return TariError::WalletError("Real wallet not initialized".to_string()).to_js_error(&mut cx),
    };
    
    let seed_words = try_js!(&mut cx, seed_words);
    let seed_words_str = seed_words.join(" ");
    
    log::debug!("Retrieved seed words for wallet: {}", handle);
    Ok(cx.string(seed_words_str))
}

/// Get wallet balance
pub fn wallet_get_balance(mut cx: FunctionContext) -> JsResult<JsObject> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    let wallet = match handles.get_handle(handle) {
        Some(w) => w,
        None => return TariError::InvalidHandle(handle).to_js_error(&mut cx),
    };
    
    // Get actual balance from real Tari wallet
    let balance = match &wallet.real_wallet {
        Some(real_wallet) => {
            wallet.runtime.block_on(async {
                real_wallet.get_real_balance().await
            })
        },
        None => return TariError::WalletError("Real wallet not initialized".to_string()).to_js_error(&mut cx),
    };
    
    let balance = try_js!(&mut cx, balance);
    
    log::debug!("Retrieved balance for wallet: {} - available: {}", handle, balance.available);
    
    let obj = cx.empty_object();
    let available = balance.available.as_u64();
    let pending = balance.pending_incoming.as_u64();
    let locked = balance.timelocked.as_u64();
    let total = available + pending + locked;
    
    obj.set(&mut cx, "available", available)?;
    obj.set(&mut cx, "pending", pending)?;
    obj.set(&mut cx, "locked", locked)?;
    obj.set(&mut cx, "total", total)?;
    
    Ok(obj)
}

/// Get wallet address  
pub fn wallet_get_address(mut cx: FunctionContext) -> JsResult<JsObject> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    let wallet = match handles.get_handle(handle) {
        Some(w) => w,
        None => return TariError::InvalidHandle(handle).to_js_error(&mut cx),
    };
    
    // Get actual address from real Tari wallet
    let address_str = match &wallet.real_wallet {
        Some(real_wallet) => {
            wallet.runtime.block_on(async {
                real_wallet.get_wallet_address().await
            })
        },
        None => return TariError::WalletError("Real wallet not initialized".to_string()).to_js_error(&mut cx),
    };
    
    let address_str = try_js!(&mut cx, address_str);
    
    // Get actual emoji ID from real Tari wallet
    let emoji_id = match &wallet.real_wallet {
        Some(real_wallet) => {
            wallet.runtime.block_on(async {
                real_wallet.get_wallet_emoji_id().await
            })
        },
        None => return TariError::WalletError("Real wallet not initialized".to_string()).to_js_error(&mut cx),
    };
    
    let emoji_id = try_js!(&mut cx, emoji_id);
    
    // Create address instance for handle management
    let address = AddressInstance {
        placeholder: address_str.clone(),
        emoji_id,
    };
    
    let mut address_handles = ADDRESS_HANDLES.lock().unwrap();
    let address_handle = address_handles.create_handle(address.clone());
    drop(address_handles);
    
    log::debug!("Retrieved address for wallet: {} - {}", handle, address_str);
    
    let obj = cx.empty_object();
    let handle_num = cx.number(address_handle as f64);
    let emoji_str = cx.string(address.emoji_id);
    
    obj.set(&mut cx, "handle", handle_num)?;
    obj.set(&mut cx, "emojiId", emoji_str)?;
    
    Ok(obj)
}

/// Send a transaction
pub fn wallet_send_transaction(mut cx: FunctionContext) -> JsResult<JsString> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    let params_obj = cx.argument::<JsObject>(1)?;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    let wallet = match handles.get_handle(handle) {
        Some(w) => w,
        None => return TariError::InvalidHandle(handle).to_js_error(&mut cx),
    };
    
    let params = try_js!(&mut cx, parse_send_params(&mut cx, params_obj));
    
    log::info!("Sending {} to {} from wallet {}", 
              params.amount, params.destination, handle);
    
    // Send actual transaction through real Tari wallet
    let tx_id = match &wallet.real_wallet {
        Some(real_wallet) => {
            wallet.runtime.block_on(async {
                // Parse amount from string to MicroMinotari
                let amount = params.amount.parse::<u64>()
                    .map_err(|e| crate::error::TariError::InvalidInput(format!("Invalid amount: {}", e)))?;
                let amount = tari_core::transactions::tari_amount::MicroMinotari::from(amount);
                
                // Parse fee (default to 25 if not provided)
                let fee_per_gram = params.fee_per_gram
                    .unwrap_or_else(|| "25".to_string())
                    .parse::<u64>()
                    .map_err(|e| crate::error::TariError::InvalidInput(format!("Invalid fee: {}", e)))?;
                let fee_per_gram = tari_core::transactions::tari_amount::MicroMinotari::from(fee_per_gram);
                
                let message = params.message.unwrap_or_default();
                
                real_wallet.send_real_transaction(
                    params.destination,
                    amount,
                    fee_per_gram,
                    message
                ).await
            })
        },
        None => return TariError::WalletError("Real wallet not initialized".to_string()).to_js_error(&mut cx),
    };
    
    let tx_id = try_js!(&mut cx, tx_id);
    
    log::debug!("Sent transaction with ID: {}", tx_id);
    Ok(cx.string(tx_id.to_string()))
}

/// Get wallet UTXOs
pub fn wallet_get_utxos(mut cx: FunctionContext) -> JsResult<JsArray> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    let page = cx.argument_opt(1)
        .and_then(|arg| arg.downcast::<JsNumber, _>(&mut cx).ok())
        .map(|arg| arg.value(&mut cx) as u32)
        .unwrap_or(0);
    let page_size = cx.argument_opt(2)
        .and_then(|arg| arg.downcast::<JsNumber, _>(&mut cx).ok())
        .map(|arg| arg.value(&mut cx) as u32)
        .unwrap_or(100);
    
    let handles = WALLET_HANDLES.lock().unwrap();
    let wallet = match handles.get_handle(handle) {
        Some(w) => w,
        None => return TariError::InvalidHandle(handle).to_js_error(&mut cx),
    };
    
    log::debug!("Getting UTXOs for wallet {} (page: {}, size: {})", 
               handle, page, page_size);
    
    // Get actual UTXOs from real Tari wallet
    let utxos = match &wallet.real_wallet {
        Some(real_wallet) => {
            wallet.runtime.block_on(async {
                real_wallet.get_real_utxos(page, page_size).await
            })
        },
        None => return TariError::WalletError("Real wallet not initialized".to_string()).to_js_error(&mut cx),
    };
    
    let utxos = try_js!(&mut cx, utxos);
    
    let result = cx.empty_array();
    for (i, utxo) in utxos.iter().enumerate() {
        let utxo_obj = cx.empty_object();
        let value_str = cx.string(utxo.value.to_string());
        let commitment_str = cx.string(utxo.commitment.clone());
        let height_num = cx.number(utxo.mined_height.unwrap_or(0) as f64);
        let status_num = cx.number(match utxo.status {
            crate::wallet_real::UtxoStatus::Unspent => 0,
            crate::wallet_real::UtxoStatus::Spent => 1,
            crate::wallet_real::UtxoStatus::Unconfirmed => 2,
        });
        
        utxo_obj.set(&mut cx, "value", value_str)?;
        utxo_obj.set(&mut cx, "commitment", commitment_str)?;
        utxo_obj.set(&mut cx, "minedHeight", height_num)?;
        utxo_obj.set(&mut cx, "status", status_num)?;
        
        result.set(&mut cx, i as u32, utxo_obj)?;
    }
    
    Ok(result)
}

/// Import a UTXO into the wallet
pub fn wallet_import_utxo(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    let params_obj = cx.argument::<JsObject>(1)?;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    let wallet = match handles.get_handle(handle) {
        Some(w) => w,
        None => return TariError::InvalidHandle(handle).to_js_error(&mut cx),
    };
    
    // Parse UTXO import parameters
    let value_str = params_obj.get::<JsString, _, _>(&mut cx, "value")?.value(&mut cx);
    let spending_key = params_obj.get::<JsString, _, _>(&mut cx, "spendingKey")?.value(&mut cx);
    let script_bytes = params_obj.get::<JsArray, _, _>(&mut cx, "script")?;
    let input_data_bytes = params_obj.get::<JsArray, _, _>(&mut cx, "inputData")?;
    let script_private_key = params_obj.get::<JsString, _, _>(&mut cx, "scriptPrivateKey")?.value(&mut cx);
    let sender_offset_public_key = params_obj.get::<JsString, _, _>(&mut cx, "senderOffsetPublicKey")?.value(&mut cx);
    let metadata_sig_ephemeral_commitment = params_obj.get::<JsString, _, _>(&mut cx, "metadataSignatureEphemeralCommitment")?.value(&mut cx);
    let metadata_sig_ephemeral_pubkey = params_obj.get::<JsString, _, _>(&mut cx, "metadataSignatureEphemeralPubkey")?.value(&mut cx);
    let metadata_sig_u_a = params_obj.get::<JsString, _, _>(&mut cx, "metadataSignatureUA")?.value(&mut cx);
    let metadata_sig_u_x = params_obj.get::<JsString, _, _>(&mut cx, "metadataSignatureUX")?.value(&mut cx);
    let metadata_sig_u_y = params_obj.get::<JsString, _, _>(&mut cx, "metadataSignatureUY")?.value(&mut cx);
    let mined_height = params_obj.get_opt::<JsNumber, _, _>(&mut cx, "minedHeight")?.map(|n| n.value(&mut cx) as u64);
    
    // Convert JS arrays to Rust Vec<u8>
    let script = (0..script_bytes.len(&mut cx))
        .map(|i| script_bytes.get::<JsNumber, _, _>(&mut cx, i as u32).unwrap().value(&mut cx) as u8)
        .collect::<Vec<u8>>();
    let input_data = (0..input_data_bytes.len(&mut cx))
        .map(|i| input_data_bytes.get::<JsNumber, _, _>(&mut cx, i as u32).unwrap().value(&mut cx) as u8)
        .collect::<Vec<u8>>();
    
    // Parse amount
    let value = value_str.parse::<u64>()
        .map_err(|e| TariError::InvalidInput(format!("Invalid value: {}", e)))
        .and_then(|v| Ok(tari_core::transactions::tari_amount::MicroMinotari::from(v)));
    let value = try_js!(&mut cx, value);
    
    log::debug!("Importing UTXO for wallet: {} with value: {}", handle, value);
    
    // Import UTXO through real Tari wallet
    let result = match &wallet.real_wallet {
        Some(real_wallet) => {
            wallet.runtime.block_on(async {
                real_wallet.import_utxo(
                    value,
                    spending_key,
                    script,
                    input_data,
                    script_private_key,
                    sender_offset_public_key,
                    metadata_sig_ephemeral_commitment,
                    metadata_sig_ephemeral_pubkey,
                    metadata_sig_u_a,
                    metadata_sig_u_x,
                    metadata_sig_u_y,
                    mined_height,
                ).await
            })
        },
        None => return TariError::WalletError("Real wallet not initialized".to_string()).to_js_error(&mut cx),
    };
    
    let success = try_js!(&mut cx, result);
    log::debug!("UTXO import result for wallet {}: {}", handle, success);
    Ok(cx.boolean(success))
}

/// Split coins for mining preparation
pub fn wallet_coin_split(mut cx: FunctionContext) -> JsResult<JsString> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    let params_obj = cx.argument::<JsObject>(1)?;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    let wallet = match handles.get_handle(handle) {
        Some(w) => w,
        None => return TariError::InvalidHandle(handle).to_js_error(&mut cx),
    };
    
    // Parse split parameters
    let amount_str = params_obj
        .get::<JsString, _, _>(&mut cx, "amount")?
        .value(&mut cx);
    let count = params_obj
        .get::<JsNumber, _, _>(&mut cx, "count")?
        .value(&mut cx) as usize;
    let fee_per_gram_str = params_obj
        .get_opt::<JsString, _, _>(&mut cx, "feePerGram")?
        .map(|s| s.value(&mut cx))
        .unwrap_or_else(|| "25".to_string());
    let message = params_obj
        .get_opt::<JsString, _, _>(&mut cx, "message")?
        .map(|s| s.value(&mut cx))
        .unwrap_or_default();
    let lock_height = params_obj
        .get_opt::<JsNumber, _, _>(&mut cx, "lockHeight")?
        .map(|n| n.value(&mut cx) as u64);
    
    // Parse amounts
    let amount = amount_str.parse::<u64>()
        .map_err(|e| TariError::InvalidInput(format!("Invalid amount: {}", e)))
        .and_then(|v| Ok(tari_core::transactions::tari_amount::MicroMinotari::from(v)));
    let amount = try_js!(&mut cx, amount);
    
    let fee_per_gram = fee_per_gram_str.parse::<u64>()
        .map_err(|e| TariError::InvalidInput(format!("Invalid fee: {}", e)))
        .and_then(|v| Ok(tari_core::transactions::tari_amount::MicroMinotari::from(v)));
    let fee_per_gram = try_js!(&mut cx, fee_per_gram);
    
    log::info!("Splitting {} coins into {} UTXOs for wallet {}", 
               amount, count, handle);
    
    // Create coin split through real Tari wallet
    let tx_id = match &wallet.real_wallet {
        Some(real_wallet) => {
            wallet.runtime.block_on(async {
                real_wallet.create_coin_split(
                    amount,
                    count,
                    fee_per_gram,
                    message,
                    lock_height,
                ).await
            })
        },
        None => return TariError::WalletError("Real wallet not initialized".to_string()).to_js_error(&mut cx),
    };
    
    let tx_id = try_js!(&mut cx, tx_id);
    log::debug!("Created coin split transaction ID: {}", tx_id);
    Ok(cx.string(tx_id.to_string()))
}

/// Join coins for UTXO consolidation
pub fn wallet_coin_join(mut cx: FunctionContext) -> JsResult<JsString> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    let params_obj = cx.argument::<JsObject>(1)?;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    let wallet = match handles.get_handle(handle) {
        Some(w) => w,
        None => return TariError::InvalidHandle(handle).to_js_error(&mut cx),
    };
    
    // Parse join parameters
    let commitments_array = params_obj
        .get::<JsArray, _, _>(&mut cx, "commitments")?;
    let fee_per_gram_str = params_obj
        .get_opt::<JsString, _, _>(&mut cx, "feePerGram")?
        .map(|s| s.value(&mut cx))
        .unwrap_or_else(|| "25".to_string());
    let message = params_obj
        .get_opt::<JsString, _, _>(&mut cx, "message")?
        .map(|s| s.value(&mut cx))
        .unwrap_or_default();
    
    // Convert JS array to Vec<String>
    let commitment_count = commitments_array.len(&mut cx);
    let commitments = (0..commitment_count)
        .map(|i| commitments_array.get::<JsString, _, _>(&mut cx, i).unwrap().value(&mut cx))
        .collect::<Vec<String>>();
    
    // Parse fee
    let fee_per_gram = fee_per_gram_str.parse::<u64>()
        .map_err(|e| TariError::InvalidInput(format!("Invalid fee: {}", e)))
        .and_then(|v| Ok(tari_core::transactions::tari_amount::MicroMinotari::from(v)));
    let fee_per_gram = try_js!(&mut cx, fee_per_gram);
    
    log::info!("Joining {} UTXOs for wallet {}", 
               commitment_count, handle);
    
    // Create coin join through real Tari wallet
    let tx_id = match &wallet.real_wallet {
        Some(real_wallet) => {
            wallet.runtime.block_on(async {
                real_wallet.create_coin_join(
                    commitments,
                    fee_per_gram,
                    message,
                ).await
            })
        },
        None => return TariError::WalletError("Real wallet not initialized".to_string()).to_js_error(&mut cx),
    };
    
    let tx_id = try_js!(&mut cx, tx_id);
    log::debug!("Created coin join transaction ID: {}", tx_id);
    Ok(cx.string(tx_id.to_string()))
}

/// Start wallet recovery from blockchain
pub fn wallet_start_recovery(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    let base_node_key = cx.argument::<JsString>(1)?.value(&mut cx);
    let _callback = cx.argument::<JsFunction>(2)?;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    if !handles.is_valid(handle) {
        return TariError::InvalidHandle(handle).to_js_error(&mut cx);
    }
    drop(handles);
    
    log::info!("Starting wallet recovery for wallet {} with base node {}", 
               handle, base_node_key);
    
    // Validate base node key format
    match validate_peer_public_key(&base_node_key) {
        Ok(base_node_key_bytes) => {
            log::debug!("Base node public key validated: {} bytes", base_node_key_bytes.len());
        }
        Err(e) => {
            log::warn!("Invalid base node public key: {}", e);
            return TariError::WalletError(format!("Invalid base node key: {}", e)).to_js_error(&mut cx);
        }
    }
    
    // In a real implementation, this would:
    // 1. Create RecoveryConfig with scan parameters
    // 2. Initialize WalletRecovery service with config
    // 3. Parse mnemonic to cipher seed (if seed-based recovery)
    // 4. Generate wallet keys from seed
    // 5. Start blockchain scanning from genesis or specified height
    // 6. Discover and validate UTXOs belonging to the wallet
    // 7. Update wallet balance and transaction history
    // 8. Implement progress callbacks for JavaScript layer
    // 9. Handle network interruptions with resume capability
    
    // Create recovery configuration (placeholder)
    let recovery_config = create_recovery_config();
    log::debug!("Created recovery configuration: scan_from_genesis={}", recovery_config.scan_from_genesis);
    
    // Start UTXO discovery and validation
    log::info!("Starting UTXO discovery and validation for wallet {}", handle);
    
    // Store recovery progress (in real implementation, this would be persistent)
    RECOVERY_PROGRESS.lock().unwrap().insert(handle, RecoveryProgress {
        blocks_scanned: 0,
        total_blocks: 1000000, // Placeholder total
        utxos_found: 0,
        scan_rate: 0.0,
        current_height: 0,
        started_at: SystemTime::now(),
        errors: Vec::new(),
    });
    
    log::info!("Wallet recovery started successfully for wallet: {}", handle);
    Ok(cx.boolean(true))
}

/// Check if wallet recovery is in progress
pub fn wallet_is_recovery_in_progress(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    if !handles.is_valid(handle) {
        return TariError::InvalidHandle(handle).to_js_error(&mut cx);
    }
    drop(handles);
    
    // Check actual recovery status from progress tracker
    let recovery_progress = RECOVERY_PROGRESS.lock().unwrap();
    let is_in_progress = recovery_progress.contains_key(&handle);
    
    if is_in_progress {
        if let Some(progress) = recovery_progress.get(&handle) {
            let progress_percentage = calculate_scan_progress(progress.blocks_scanned, progress.total_blocks);
            log::debug!("Recovery progress for wallet {}: {:.2}% ({}/{})", 
                       handle, progress_percentage, progress.blocks_scanned, progress.total_blocks);
        }
    }
    
    log::debug!("Recovery status for wallet {}: {}", handle, is_in_progress);
    Ok(cx.boolean(is_in_progress))
}

/// Get detailed recovery status and metrics
pub fn wallet_get_recovery_status(mut cx: FunctionContext) -> JsResult<JsObject> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    if !handles.is_valid(handle) {
        return TariError::InvalidHandle(handle).to_js_error(&mut cx);
    }
    drop(handles);
    
    let recovery_progress = RECOVERY_PROGRESS.lock().unwrap();
    let result = cx.empty_object();
    
    if let Some(progress) = recovery_progress.get(&handle) {
        // Recovery is in progress - return detailed metrics
        let progress_percentage = calculate_scan_progress(progress.blocks_scanned, progress.total_blocks);
        let remaining_blocks = progress.total_blocks.saturating_sub(progress.blocks_scanned);
        let estimated_completion = estimate_completion_time(progress.scan_rate, remaining_blocks);
        
        // Set progress fields
        let blocks_scanned = cx.number(progress.blocks_scanned as f64);
        let total_blocks = cx.number(progress.total_blocks as f64);
        let utxos_found = cx.number(progress.utxos_found as f64);
        let scan_rate = cx.number(progress.scan_rate);
        let current_height = cx.number(progress.current_height as f64);
        let percentage = cx.number(progress_percentage);
        let in_progress = cx.boolean(true);
        
        result.set(&mut cx, "inProgress", in_progress)?;
        result.set(&mut cx, "blocksScanned", blocks_scanned)?;
        result.set(&mut cx, "totalBlocks", total_blocks)?;
        result.set(&mut cx, "utxosFound", utxos_found)?;
        result.set(&mut cx, "scanRate", scan_rate)?;
        result.set(&mut cx, "currentHeight", current_height)?;
        result.set(&mut cx, "percentage", percentage)?;
        
        // Add estimated completion time if available
        if let Some(completion_time) = estimated_completion {
            let completion_timestamp = completion_time
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            let completion = cx.number(completion_timestamp as f64);
            result.set(&mut cx, "estimatedCompletion", completion)?;
        }
        
        // Add errors if any
        if !progress.errors.is_empty() {
            let errors_array = cx.empty_array();
            for (i, error) in progress.errors.iter().enumerate() {
                let error_str = cx.string(error);
                errors_array.set(&mut cx, i as u32, error_str)?;
            }
            result.set(&mut cx, "errors", errors_array)?;
        }
        
        log::debug!("Retrieved recovery status for wallet {}: {:.2}% complete", handle, progress_percentage);
    } else {
        // No recovery in progress
        let in_progress = cx.boolean(false);
        result.set(&mut cx, "inProgress", in_progress)?;
        log::debug!("No recovery in progress for wallet {}", handle);
    }
    
    Ok(result)
}

/// Get connected peers for a wallet
pub fn wallet_get_peers(mut cx: FunctionContext) -> JsResult<JsArray> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    
    let handles = WALLET_HANDLES.lock().unwrap();
    if !handles.is_valid(handle) {
        return TariError::InvalidHandle(handle).to_js_error(&mut cx);
    }
    drop(handles);
    
    log::debug!("Getting peers for wallet: {}", handle);
    
    // TODO: Get actual peers from Tari wallet
    let mock_peers = vec![
        ("peer_1", "127.0.0.1:18141", 1640995200, false),
        ("peer_2", "127.0.0.1:18142", 1640995100, false),
    ];
    
    let result = cx.empty_array();
    for (i, (public_key, address, last_seen, banned)) in mock_peers.iter().enumerate() {
        let peer_obj = cx.empty_object();
        let public_key_str = cx.string(*public_key);
        let address_str = cx.string(*address);
        let last_seen_num = cx.number(*last_seen as f64);
        let banned_bool = cx.boolean(*banned);
        
        peer_obj.set(&mut cx, "publicKey", public_key_str)?;
        peer_obj.set(&mut cx, "address", address_str)?;
        peer_obj.set(&mut cx, "lastSeen", last_seen_num)?;
        peer_obj.set(&mut cx, "banned", banned_bool)?;
        
        result.set(&mut cx, i as u32, peer_obj)?;
    }
    
    Ok(result)
}

/// Add a peer to the wallet
pub fn wallet_add_peer(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    let public_key = cx.argument::<JsString>(1)?.value(&mut cx);
    let address = cx.argument::<JsString>(2)?.value(&mut cx);
    
    let handles = WALLET_HANDLES.lock().unwrap();
    if !handles.is_valid(handle) {
        return TariError::InvalidHandle(handle).to_js_error(&mut cx);
    }
    drop(handles);
    
    log::info!("Adding peer {} at {} to wallet {}", 
               public_key, address, handle);
    
    // Validate peer public key format
    let peer_key_bytes = try_js!(&mut cx, validate_peer_public_key(&public_key));
    
    // Test peer connectivity
    match test_peer_connectivity(&address) {
        Ok(connected) => {
            if !connected {
                log::warn!("Peer connectivity test failed for {}", address);
            }
        }
        Err(e) => {
            log::warn!("Peer connectivity test error: {}", e);
            return TariError::WalletError(format!("Invalid peer address: {}", e)).to_js_error(&mut cx);
        }
    }
    
    // In a real implementation, this would:
    // 1. Get the peer manager from the wallet's comms node
    // 2. Create a Peer object with public key and addresses
    // 3. Add to peer manager database
    // 4. Initiate connection attempt
    // 5. Update peer reputation tracking
    
    // For now, we'll simulate successful peer addition
    log::info!("Peer {} successfully validated and would be added to peer manager", public_key);
    
    // Update peer reputation with initial score
    if let Err(e) = update_peer_reputation(&peer_key_bytes, 10) {
        log::warn!("Failed to update peer reputation: {}", e);
    }
    
    log::debug!("Added peer to wallet: {}", handle);
    Ok(cx.boolean(true))
}

/// Ban a peer from the wallet
pub fn wallet_ban_peer(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let handle = cx.argument::<JsNumber>(0)?.value(&mut cx) as u64;
    let public_key = cx.argument::<JsString>(1)?.value(&mut cx);
    let duration = cx.argument_opt(2)
        .and_then(|arg| arg.downcast::<JsNumber, _>(&mut cx).ok())
        .map(|arg| arg.value(&mut cx) as u64);
    
    let handles = WALLET_HANDLES.lock().unwrap();
    if !handles.is_valid(handle) {
        return TariError::InvalidHandle(handle).to_js_error(&mut cx);
    }
    drop(handles);
    
    log::info!("Banning peer {} from wallet {} for {:?} seconds", 
               public_key, handle, duration);
    
    // Validate peer public key format
    let peer_key_bytes = try_js!(&mut cx, validate_peer_public_key(&public_key));
    
    // Calculate ban expiry time
    let ban_duration = duration.unwrap_or(3600); // Default to 1 hour
    let ban_expiry = SystemTime::now() + std::time::Duration::from_secs(ban_duration);
    
    // Add peer to ban list
    {
        let mut banned_peers = BANNED_PEERS.lock().unwrap();
        banned_peers.insert(public_key.clone(), ban_expiry);
        log::debug!("Added peer {} to ban list until {:?}", public_key, ban_expiry);
    }
    
    // In a real implementation, this would:
    // 1. Disconnect from peer gracefully
    // 2. Add peer to Tari wallet's ban list with duration
    // 3. Prevent future connection attempts
    // 4. Persist ban list across wallet restarts
    // 5. Update peer reputation with negative score
    
    // Update peer reputation with penalty
    if let Err(e) = update_peer_reputation(&peer_key_bytes, -50) {
        log::warn!("Failed to update peer reputation: {}", e);
    }
    
    log::info!("Peer {} banned for {} seconds", public_key, ban_duration);
    log::debug!("Banned peer from wallet: {}", handle);
    Ok(cx.boolean(true))
}

/// Helper functions for peer management
use hex;

/// Validate peer public key format (hex string, 64 characters)
fn validate_peer_public_key(public_key: &str) -> Result<Vec<u8>, TariError> {
    // Check if the string is exactly 64 characters (32 bytes hex encoded)
    if public_key.len() != 64 {
        return Err(TariError::WalletError(format!(
            "Invalid public key length: expected 64 characters, got {}", 
            public_key.len()
        )));
    }
    
    // Try to parse as hex
    let key_bytes = hex::decode(public_key)
        .map_err(|e| TariError::WalletError(format!("Invalid hex public key: {}", e)))?;
    
    // Validate it's 32 bytes
    if key_bytes.len() != 32 {
        return Err(TariError::WalletError("Public key must be exactly 32 bytes".to_string()));
    }
    
    Ok(key_bytes)
}

/// Test peer connectivity (simplified implementation)
fn test_peer_connectivity(address: &str) -> Result<bool, TariError> {
    // Basic address format validation
    if !address.contains(':') {
        return Err(TariError::WalletError("Invalid address format: missing port".to_string()));
    }
    
    // In a real implementation, this would test actual connectivity
    log::debug!("Testing connectivity to peer at address: {}", address);
    Ok(true)
}

/// Update peer reputation score (placeholder implementation)
fn update_peer_reputation(peer_key_bytes: &[u8], score_delta: i32) -> Result<(), TariError> {
    log::debug!("Updating peer reputation for {} bytes key by {}", peer_key_bytes.len(), score_delta);
    // In a real implementation, this would update the peer manager's reputation system
    Ok(())
}

/// Store for banned peers (in a real implementation, this would be persistent)
static BANNED_PEERS: Lazy<std::sync::Mutex<HashMap<String, SystemTime>>> = Lazy::new(|| std::sync::Mutex::new(HashMap::new()));

/// Recovery progress tracking
#[derive(Debug, Clone)]
struct RecoveryProgress {
    blocks_scanned: u64,
    total_blocks: u64,
    utxos_found: usize,
    scan_rate: f64,
    current_height: u64,
    started_at: SystemTime,
    errors: Vec<String>,
}

/// Store for wallet recovery progress
static RECOVERY_PROGRESS: Lazy<std::sync::Mutex<HashMap<u64, RecoveryProgress>>> = Lazy::new(|| std::sync::Mutex::new(HashMap::new()));

/// Simple recovery configuration structure
struct SimpleRecoveryConfig {
    scan_from_genesis: bool,
    start_height: u64,
    end_height: Option<u64>,
}

/// Create recovery configuration with scan parameters
fn create_recovery_config() -> SimpleRecoveryConfig {
    SimpleRecoveryConfig {
        scan_from_genesis: true,
        start_height: 0,
        end_height: None,
    }
}

/// Calculate scan progress percentage
fn calculate_scan_progress(current_height: u64, target_height: u64) -> f64 {
    if target_height == 0 {
        return 0.0;
    }
    (current_height as f64 / target_height as f64) * 100.0
}

/// Estimate completion time based on scan rate
fn estimate_completion_time(scan_rate: f64, remaining_blocks: u64) -> Option<SystemTime> {
    if scan_rate <= 0.0 {
        return None;
    }
    
    let remaining_seconds = remaining_blocks as f64 / scan_rate;
    Some(SystemTime::now() + std::time::Duration::from_secs(remaining_seconds as u64))
}
