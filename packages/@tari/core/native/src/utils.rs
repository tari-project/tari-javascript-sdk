use neon::prelude::*;
use crate::error::{TariError, TariResult};

/// Convert JavaScript string to Rust string
pub fn js_string_to_rust(cx: &mut FunctionContext, js_str: Handle<JsString>) -> String {
    js_str.value(cx)
}

/// Convert Rust string to JavaScript string
pub fn rust_string_to_js(cx: &mut FunctionContext, rust_str: String) -> JsResult<JsString> {
    Ok(cx.string(rust_str))
}

/// Parse a JavaScript object as a wallet configuration
pub fn parse_wallet_config(cx: &mut FunctionContext, config_obj: Handle<JsObject>) -> TariResult<WalletConfig> {
    // Extract seed_words (required)
    let seed_words = config_obj
        .get_opt::<JsString, _, _>(cx, "seedWords")?
        .map(|s| js_string_to_rust(cx, s))
        .unwrap_or_default();

    // Extract network (optional, default to mainnet)
    let network_str = config_obj
        .get_opt::<JsString, _, _>(cx, "network")?
        .map(|s| js_string_to_rust(cx, s))
        .unwrap_or_else(|| "mainnet".to_string());

    let network = match network_str.as_str() {
        "mainnet" => Network::Mainnet,
        "testnet" => Network::Testnet,
        "localnet" => Network::Localnet,
        _ => return Err(TariError::InvalidArgument(format!("Invalid network: {}", network_str))),
    };

    // Extract optional database settings
    let db_path = config_obj
        .get_opt::<JsString, _, _>(cx, "dbPath")?
        .map(|s| js_string_to_rust(cx, s));

    let db_name = config_obj
        .get_opt::<JsString, _, _>(cx, "dbName")?
        .map(|s| js_string_to_rust(cx, s));

    let passphrase = config_obj
        .get_opt::<JsString, _, _>(cx, "passphrase")?
        .map(|s| js_string_to_rust(cx, s));

    Ok(WalletConfig {
        seed_words,
        network,
        db_path,
        db_name,
        passphrase,
    })
}

/// Wallet configuration struct
#[derive(Debug, Clone)]
pub struct WalletConfig {
    pub seed_words: String,
    pub network: Network,
    pub db_path: Option<String>,
    pub db_name: Option<String>,
    pub passphrase: Option<String>,
}

/// Network enum
#[derive(Debug, Clone)]
pub enum Network {
    Mainnet,
    Testnet,
    Localnet,
}

/// Create a balance object for JavaScript
pub fn create_balance_object(
    cx: &mut FunctionContext,
    available: u64,
    pending: u64,
    locked: u64,
) -> JsResult<JsObject> {
    let obj = cx.empty_object();
    
    let available_str = cx.string(available.to_string());
    let pending_str = cx.string(pending.to_string());
    let locked_str = cx.string(locked.to_string());
    let total_str = cx.string((available + pending + locked).to_string());
    
    obj.set(cx, "available", available_str)?;
    obj.set(cx, "pending", pending_str)?;
    obj.set(cx, "locked", locked_str)?;
    obj.set(cx, "total", total_str)?;
    
    Ok(obj)
}

/// Create an address object for JavaScript
pub fn create_address_object(
    cx: &mut FunctionContext,
    handle: u64,
    emoji_id: String,
) -> JsResult<JsObject> {
    let obj = cx.empty_object();
    
    let handle_num = cx.number(handle as f64);
    let emoji_str = cx.string(emoji_id);
    
    obj.set(cx, "handle", handle_num)?;
    obj.set(cx, "emojiId", emoji_str)?;
    
    Ok(obj)
}

/// Create a UTXO object for JavaScript
pub fn create_utxo_object(
    cx: &mut FunctionContext,
    value: u64,
    commitment: String,
    mined_height: u64,
    status: u32,
) -> JsResult<JsObject> {
    let obj = cx.empty_object();
    
    let value_str = cx.string(value.to_string());
    let commitment_str = cx.string(commitment);
    let height_num = cx.number(mined_height as f64);
    let status_num = cx.number(status as f64);
    
    obj.set(cx, "value", value_str)?;
    obj.set(cx, "commitment", commitment_str)?;
    obj.set(cx, "minedHeight", height_num)?;
    obj.set(cx, "status", status_num)?;
    
    Ok(obj)
}

/// Extract send transaction parameters from JavaScript object
pub fn parse_send_params(cx: &mut FunctionContext, params_obj: Handle<JsObject>) -> TariResult<SendParams> {
    let destination = params_obj
        .get::<JsString, _, _>(cx, "destination")
        .map_err(|_| TariError::InvalidArgument("Missing destination".to_string()))?
        .value(cx);

    let amount = params_obj
        .get::<JsString, _, _>(cx, "amount")
        .map_err(|_| TariError::InvalidArgument("Missing amount".to_string()))?
        .value(cx);

    let fee_per_gram = params_obj
        .get_opt::<JsString, _, _>(cx, "feePerGram")?
        .map(|s| s.value(cx));

    let message = params_obj
        .get_opt::<JsString, _, _>(cx, "message")?
        .map(|s| s.value(cx));

    let one_sided = params_obj
        .get_opt::<JsBoolean, _, _>(cx, "oneSided")?
        .map(|b| b.value(cx))
        .unwrap_or(false);

    Ok(SendParams {
        destination,
        amount,
        fee_per_gram,
        message,
        one_sided,
    })
}

/// Send transaction parameters
#[derive(Debug, Clone)]
pub struct SendParams {
    pub destination: String,
    pub amount: String,
    pub fee_per_gram: Option<String>,
    pub message: Option<String>,
    pub one_sided: bool,
}
