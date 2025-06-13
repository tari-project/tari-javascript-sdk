/**
 * @fileoverview Linux-specific FFI bindings for secret storage
 * 
 * Provides the NAPI-RS bindings that expose libsecret functionality
 * to the Node.js layer with proper error handling and memory management.
 */

use napi_derive::napi;
use napi::{Result, JsBuffer, Env, JsString, JsBoolean, JsObject, JsNumber};

// Re-export the libsecret fallback functionality
pub use crate::libsecret_fallback_bridge::*;

/// Linux-specific secret storage module initialization
#[napi]
pub fn init_linux_storage() -> Result<bool> {
    #[cfg(all(target_os = "linux", feature = "linux-libsecret"))]
    {
        // Initialize logging for libsecret operations
        env_logger::try_init().ok();
        
        // Check if we can initialize the service
        match is_service_available() {
            Ok(available) => Ok(available),
            Err(_) => Ok(false),
        }
    }
    
    #[cfg(not(all(target_os = "linux", feature = "linux-libsecret")))]
    {
        Ok(false)
    }
}

/// Check platform-specific secret storage capabilities
#[napi]
pub fn check_linux_capabilities() -> Result<JsObject> {
    #[cfg(all(target_os = "linux", feature = "linux-libsecret"))]
    {
        let status = get_service_status()?;
        
        // Convert to JS object manually since we need to control the structure
        Ok(serde_json::json!({
            "libsecret_available": status.available,
            "headless_mode": status.headless_mode,
            "dbus_configured": status.dbus_address.is_some(),
            "keyring_unlocked": status.keyring_unlocked,
            "fallback_required": status.headless_mode && !status.available,
        }).into())
    }
    
    #[cfg(not(all(target_os = "linux", feature = "linux-libsecret")))]
    {
        Ok(serde_json::json!({
            "libsecret_available": false,
            "headless_mode": false,
            "dbus_configured": false,
            "keyring_unlocked": false,
            "fallback_required": false,
        }).into())
    }
}

/// Attempt to configure headless environment
#[napi]
pub fn configure_headless_linux(master_password: Option<String>) -> Result<JsObject> {
    #[cfg(all(target_os = "linux", feature = "linux-libsecret"))]
    {
        let success = setup_headless_environment(master_password)?;
        let status = get_service_status()?;
        
        Ok(serde_json::json!({
            "setup_successful": success,
            "service_available": status.available,
            "dbus_address": status.dbus_address,
            "keyring_unlocked": status.keyring_unlocked,
        }).into())
    }
    
    #[cfg(not(all(target_os = "linux", feature = "linux-libsecret")))]
    {
        Ok(serde_json::json!({
            "setup_successful": false,
            "service_available": false,
            "dbus_address": null,
            "keyring_unlocked": false,
        }).into())
    }
}

/// Comprehensive test of Linux secret storage stack
#[napi]
pub fn test_linux_secret_storage() -> Result<JsObject> {
    #[cfg(all(target_os = "linux", feature = "linux-libsecret"))]
    {
        let initial_status = get_service_status()?;
        
        if !initial_status.available {
            return Ok(serde_json::json!({
                "test_passed": false,
                "error": "libsecret service not available",
                "capabilities": {
                    "service_available": false,
                    "headless_mode": initial_status.headless_mode,
                    "dbus_configured": initial_status.dbus_address.is_some(),
                }
            }).into());
        }

        // Run the actual test
        match test_libsecret_fallback() {
            Ok(test_passed) => Ok(serde_json::json!({
                "test_passed": test_passed,
                "capabilities": {
                    "service_available": initial_status.available,
                    "headless_mode": initial_status.headless_mode,
                    "dbus_configured": initial_status.dbus_address.is_some(),
                    "keyring_unlocked": initial_status.keyring_unlocked,
                }
            }).into()),
            Err(e) => Ok(serde_json::json!({
                "test_passed": false,
                "error": e.to_string(),
                "capabilities": {
                    "service_available": initial_status.available,
                    "headless_mode": initial_status.headless_mode,
                    "dbus_configured": initial_status.dbus_address.is_some(),
                    "keyring_unlocked": initial_status.keyring_unlocked,
                }
            }).into()),
        }
    }
    
    #[cfg(not(all(target_os = "linux", feature = "linux-libsecret")))]
    {
        Ok(serde_json::json!({
            "test_passed": false,
            "error": "Not running on Linux",
            "capabilities": {
                "service_available": false,
                "headless_mode": false,
                "dbus_configured": false,
                "keyring_unlocked": false,
            }
        }).into())
    }
}
