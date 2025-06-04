use neon::prelude::*;

pub type TariResult<T> = Result<T, TariError>;

#[derive(Debug)]
pub enum TariError {
    InvalidArgument(String),
    WalletError(i32), // FFI error code
    InternalError(String),
    NotInitialized,
}

impl TariError {
    pub fn throw<'a, C: Context<'a>>(self, cx: &mut C) -> NeonResult<()> {
        let message = match self {
            TariError::InvalidArgument(msg) => format!("Invalid argument: {}", msg),
            TariError::WalletError(code) => format!("Wallet error: {}", error_code_to_string(code)),
            TariError::InternalError(msg) => format!("Internal error: {}", msg),
            TariError::NotInitialized => "Tari core not initialized".to_string(),
        };
        
        cx.throw_error(message)
    }
}

fn error_code_to_string(code: i32) -> &'static str {
    match code {
        1 => "Invalid seed phrase",
        2 => "Network error",
        3 => "Insufficient balance",
        4 => "Transaction failed",
        _ => "Unknown error",
    }
}
