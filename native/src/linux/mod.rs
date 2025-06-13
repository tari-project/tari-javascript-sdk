// @fileoverview Linux secret storage module
//
// Platform-specific implementation for Linux using libsecret
// as fallback when D-Bus is not available.

use napi::{Result, Env};

pub mod libsecret;
pub mod bindings;

// Re-export key functionality
pub use bindings::*;

/// Initialize Linux secret storage support
pub fn init(_env: Env) -> Result<()> {
    #[cfg(target_os = "linux")]
    {
        // Test libsecret access
        match libsecret::test_access() {
            Ok(_) => Ok(()),
            Err(e) => {
                // libsecret not available, but that's okay - D-Bus might work
                println!("libsecret not available: {}", e);
                Ok(())
            }
        }
    }
    
    #[cfg(not(target_os = "linux"))]
    {
        Err(napi::Error::new(
            napi::Status::GenericFailure,
            "Linux secret storage only available on Linux"
        ))
    }
}

/// Check if Linux secret storage is available
pub fn is_available() -> bool {
    #[cfg(target_os = "linux")]
    {
        // Either libsecret or D-Bus could be available
        libsecret::test_access().is_ok()
    }
    
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}
