mod wallet;

use neon::prelude::*;

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    // Basic initialization function
    cx.export_function("initialize", initialize)?;
    
    // Wallet API exports
    cx.export_function("wallet_create", wallet::wallet_create)?;
    cx.export_function("wallet_get_balance", wallet::wallet_get_balance)?;
    cx.export_function("wallet_get_address", wallet::wallet_get_address)?;
    cx.export_function("send_transaction", wallet::send_transaction)?;
    cx.export_function("get_utxos", wallet::get_utxos)?;
    
    Ok(())
}

fn initialize(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    println!("Tari Core Native module initialized successfully");
    Ok(cx.undefined())
}
