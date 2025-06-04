use neon::prelude::*;
use std::sync::Mutex;

// Simple mock wallet state
static MOCK_WALLET: Mutex<Option<MockWallet>> = Mutex::new(None);

#[derive(Debug, Clone)]
struct MockWallet {
    address: String,
    balance: u64,
    utxos: Vec<MockUtxo>,
}

#[derive(Debug, Clone)]
struct MockUtxo {
    value: u64,
    commitment: String,
}

pub fn wallet_create(mut cx: FunctionContext) -> JsResult<JsNumber> {
    let seed_phrase = cx.argument::<JsString>(0)?.value(&mut cx);
    let wallet_name = cx.argument::<JsString>(1)?.value(&mut cx);
    
    println!("Creating wallet: {} with seed: {}", wallet_name, seed_phrase);
    
    let wallet = MockWallet {
        address: "tari_mock_address_123".to_string(),
        balance: 1000000, // 1 Tari
        utxos: vec![
            MockUtxo {
                value: 500000,
                commitment: "commitment_1".to_string(),
            },
            MockUtxo {
                value: 500000,
                commitment: "commitment_2".to_string(),
            },
        ],
    };
    
    let mut mock_wallet = MOCK_WALLET.lock().unwrap();
    *mock_wallet = Some(wallet);
    
    // Return mock wallet handle
    Ok(cx.number(1))
}

pub fn wallet_get_balance(mut cx: FunctionContext) -> JsResult<JsObject> {
    let _wallet_handle = cx.argument::<JsNumber>(0)?.value(&mut cx);
    
    let mock_wallet = MOCK_WALLET.lock().unwrap();
    let balance = mock_wallet.as_ref().map(|w| w.balance).unwrap_or(0);
    
    let result = cx.empty_object();
    let available_val = cx.number(balance as f64);
    let pending_in_val = cx.number(0);
    let pending_out_val = cx.number(0);
    let locked_val = cx.number(0);
    
    result.set(&mut cx, "available", available_val)?;
    result.set(&mut cx, "pendingIncoming", pending_in_val)?;
    result.set(&mut cx, "pendingOutgoing", pending_out_val)?;
    result.set(&mut cx, "locked", locked_val)?;
    
    Ok(result)
}

pub fn wallet_get_address(mut cx: FunctionContext) -> JsResult<JsString> {
    let _wallet_handle = cx.argument::<JsNumber>(0)?.value(&mut cx);
    
    let mock_wallet = MOCK_WALLET.lock().unwrap();
    let address = mock_wallet.as_ref()
        .map(|w| w.address.clone())
        .unwrap_or_else(|| "tari_default_address".to_string());
    
    Ok(cx.string(address))
}

pub fn send_transaction(mut cx: FunctionContext) -> JsResult<JsString> {
    let _wallet_handle = cx.argument::<JsNumber>(0)?.value(&mut cx);
    let destination = cx.argument::<JsString>(1)?.value(&mut cx);
    let amount = cx.argument::<JsNumber>(2)?.value(&mut cx) as u64;
    let _fee = cx.argument::<JsNumber>(3)?.value(&mut cx) as u64;
    let _message = cx.argument::<JsString>(4)?.value(&mut cx);
    
    println!("Sending {} to {}", amount, destination);
    
    // Generate mock transaction ID
    let tx_id = format!("tx_{}", rand::random::<u64>());
    
    Ok(cx.string(tx_id))
}

pub fn get_utxos(mut cx: FunctionContext) -> JsResult<JsArray> {
    let _wallet_handle = cx.argument::<JsNumber>(0)?.value(&mut cx);
    let _page = cx.argument::<JsNumber>(1)?.value(&mut cx) as u32;
    let _page_size = cx.argument::<JsNumber>(2)?.value(&mut cx) as u32;
    
    let mock_wallet = MOCK_WALLET.lock().unwrap();
    let empty_utxos = vec![];
    let utxos = mock_wallet.as_ref().map(|w| &w.utxos).unwrap_or(&empty_utxos);
    
    let result = cx.empty_array();
    
    for (i, utxo) in utxos.iter().enumerate() {
        let utxo_obj = cx.empty_object();
        let value_val = cx.number(utxo.value as f64);
        let commitment_val = cx.string(&utxo.commitment);
        let height_val = cx.number(100.0 + i as f64);
        
        utxo_obj.set(&mut cx, "value", value_val)?;
        utxo_obj.set(&mut cx, "commitment", commitment_val)?;
        utxo_obj.set(&mut cx, "minedHeight", height_val)?;
        
        result.set(&mut cx, i as u32, utxo_obj)?;
    }
    
    Ok(result)
}
