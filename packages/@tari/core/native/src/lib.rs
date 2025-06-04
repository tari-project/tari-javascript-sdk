use neon::prelude::*;
use once_cell::sync::OnceCell;

mod error;
mod types;
mod utils;
mod wallet;

// Global initialization state
static INITIALIZED: OnceCell<()> = OnceCell::new();

/// Initialize the Tari FFI library
fn initialize(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    INITIALIZED.get_or_init(|| {
        // In real implementation, initialize FFI here
        // For now, just mark as initialized
    });
    
    Ok(cx.undefined())
}

/// Main module registration
#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("initialize", initialize)?;
    
    // Export wallet functions
    wallet::register(&mut cx)?;
    
    Ok(())
}
