// @fileoverview Windows Credential Store secure storage module
//
// Platform-specific implementation for Windows using Credential Manager
// with DPAPI encryption and proper error handling.

use napi::{Result, Env};

pub mod dpapi;
pub mod credential_manager;

/// Initialize Windows credential storage support
pub fn init(_env: Env) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        // Test credential manager access
        match credential_manager::test_access() {
            Ok(_) => Ok(()),
            Err(e) => Err(napi::Error::new(
                napi::Status::GenericFailure,
                format!("Failed to access Windows Credential Manager: {}", e)
            )),
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        Err(napi::Error::new(
            napi::Status::GenericFailure,
            "Windows Credential Store only available on Windows"
        ))
    }
}

/// Check if Windows credential storage is available
pub fn is_available() -> bool {
    #[cfg(target_os = "windows")]
    {
        credential_manager::test_access().is_ok()
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}
