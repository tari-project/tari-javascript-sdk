// @fileoverview Unified native module entry point for platform-specific secure storage
//
// This module exports platform-appropriate secure storage implementations
// with proper error handling and graceful fallbacks.

#![allow(dead_code, unused_imports)]

// Platform-specific modules
#[cfg(target_os = "macos")]
pub mod keychain;

#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "linux")]
pub mod linux;

// Re-export everything from keychain-bridge for backward compatibility
#[path = "../keychain-bridge-simple.rs"]
pub mod keychain_bridge;
pub use keychain_bridge::*;

use napi_derive::napi;
use napi::{Result, Env};

/// Initialize the native secure storage module
#[napi]
pub fn init_secure_storage(env: Env) -> Result<()> {
    // Platform-specific initialization
    #[cfg(target_os = "macos")]
    {
        keychain::init(env)?;
    }
    
    #[cfg(target_os = "windows")]
    {
        windows::init(env)?;
    }
    
    #[cfg(target_os = "linux")]
    {
        linux::init(env)?;
    }
    
    Ok(())
}

/// Get platform information
#[napi]
pub fn get_platform_info() -> Result<String> {
    let platform = if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    };
    
    Ok(platform.to_string())
}

/// Check if secure storage is available on this platform
#[napi]
pub fn is_secure_storage_available() -> Result<bool> {
    #[cfg(target_os = "macos")]
    {
        Ok(keychain::is_available())
    }
    
    #[cfg(target_os = "windows")]
    {
        Ok(windows::is_available())
    }
    
    #[cfg(target_os = "linux")]
    {
        Ok(linux::is_available())
    }
    
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Ok(false)
    }
}

/// Module initialization function for Node.js
#[napi::module_init]
fn init() {
    // Initialization code that runs when the module is loaded
}
