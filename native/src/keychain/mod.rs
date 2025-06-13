// @fileoverview macOS Keychain secure storage module
//
// Platform-specific implementation for macOS using Security framework
// with proper error handling and keychain management.

use napi::{Result, Env};

#[cfg(target_os = "macos")]
use security_framework::keychain::SecKeychain;

/// Initialize macOS keychain support
pub fn init(_env: Env) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        // Verify Security framework is available
        match SecKeychain::default() {
            Ok(_) => Ok(()),
            Err(_) => Err(napi::Error::new(
                napi::Status::GenericFailure,
                "Failed to access default keychain"
            )),
        }
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        Err(napi::Error::new(
            napi::Status::GenericFailure,
            "macOS Keychain only available on macOS"
        ))
    }
}

/// Check if keychain is available
pub fn is_available() -> bool {
    #[cfg(target_os = "macos")]
    {
        SecKeychain::default().is_ok()
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}
