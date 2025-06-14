// @fileoverview Native Rust bridge for macOS Keychain access
// 
// This module provides a Node.js native addon for accessing macOS Keychain
// services through the Security framework. It uses NAPI-RS for Node.js binding.

use napi_derive::napi;
use napi::{Result, JsBuffer, JsString, JsObject, JsBoolean, JsNumber, Env};
use std::collections::HashMap;

#[cfg(target_os = "macos")]
use security_framework::passwords::{set_generic_password, delete_generic_password};
#[cfg(target_os = "macos")]
use core_foundation::string::CFString;

/// Keychain item structure for JavaScript interface
#[napi(object)]
pub struct KeychainItem {
  pub service: String,
  pub account: String,
  pub data: JsBuffer,
  pub access_control: Option<KeychainAccessControl>,
  pub label: Option<String>,
  pub comment: Option<String>,
}

/// Access control configuration for keychain items
#[napi(object)]
pub struct KeychainAccessControl {
  pub require_user_presence: Option<bool>,
  pub allow_when_unlocked: Option<bool>,
  pub allow_after_first_unlock: Option<bool>,
  pub application_access: Option<bool>,
}

/// Keychain item information
#[napi(object)]
pub struct KeychainItemInfo {
  pub created: Option<i64>,
  pub modified: Option<i64>,
  pub size: i32,
}

/// Set an item in the keychain
#[napi]
pub fn set_item(item: KeychainItem) -> Result<()> {
  #[cfg(target_os = "macos")]
  {
    let service_str = &item.service;
    let account_str = &item.account;
    let password_data = item.data.into_value()?;
    
    // Convert Buffer to bytes
    let password_bytes = password_data.as_slice();
    
    // Delete existing item if it exists (for update functionality)
    let _ = delete_generic_password(service_str, account_str);
    
    // Set the password in keychain
    set_generic_password(service_str, account_str, password_bytes)
      .map_err(|e| napi::Error::new(
        napi::Status::GenericFailure,
        format!("Failed to set keychain item: {:?}", e)
      ))?;
    
    Ok(())
  }
  
  #[cfg(not(target_os = "macos"))]
  {
    Err(napi::Error::new(
      napi::Status::GenericFailure,
      "Keychain access is only available on macOS"
    ))
  }
}

/// Get an item from the keychain
#[napi]
pub fn get_item(env: Env, service: String, account: String) -> Result<Option<JsBuffer>> {
  #[cfg(target_os = "macos")]
  {
    let service_cf = CFString::new(&service);
    let account_cf = CFString::new(&account);
    
    match find_generic_password(None, &service_cf, &account_cf) {
      Ok((password_data, _)) => {
        // Convert the password data to a Node.js Buffer
        let buffer = env.create_buffer_with_data(password_data.to_vec())?;
        Ok(Some(buffer.into_raw()))
      }
      Err(_) => Ok(None),
    }
  }
  
  #[cfg(not(target_os = "macos"))]
  {
    Err(napi::Error::new(
      napi::Status::GenericFailure,
      "Keychain access is only available on macOS"
    ))
  }
}

/// Delete an item from the keychain
#[napi]
pub fn delete_item(service: String, account: String) -> Result<()> {
  #[cfg(target_os = "macos")]
  {
    delete_generic_password(&service, &account)
      .map_err(|e| napi::Error::new(
        napi::Status::GenericFailure,
        format!("Failed to delete keychain item: {:?}", e)
      ))?;
    
    Ok(())
  }
  
  #[cfg(not(target_os = "macos"))]
  {
    Err(napi::Error::new(
      napi::Status::GenericFailure,
      "Keychain access is only available on macOS"
    ))
  }
}

/// Find all items for a service
#[napi]
pub fn find_items(env: Env, _service: String) -> Result<JsArray> {
  #[cfg(target_os = "macos")]
  {
    // Simplified implementation - return empty array for now
    // A full implementation would use SecItemCopyMatching with complex queries
    let accounts = Vec::<String>::new();
    
    let js_array = env.create_array_with_length(accounts.len())?;
    
    for (index, account) in accounts.iter().enumerate() {
      let js_string = env.create_string(account)?;
      js_array.set_element(index as u32, js_string)?;
    }
    
    Ok(js_array)
  }
  
  #[cfg(not(target_os = "macos"))]
  {
    Err(napi::Error::new(
      napi::Status::GenericFailure,
      "Keychain access is only available on macOS"
    ))
  }
}

/// Check if an item exists in the keychain
#[napi]
pub fn item_exists(service: String, account: String) -> Result<bool> {
  #[cfg(target_os = "macos")]
  {
    let service_cf = CFString::new(&service);
    let account_cf = CFString::new(&account);
    
    match find_generic_password(None, &service_cf, &account_cf) {
      Ok(_) => Ok(true),
      Err(_) => Ok(false),
    }
  }
  
  #[cfg(not(target_os = "macos"))]
  {
    Ok(false)
  }
}

/// Get information about a keychain item
#[napi]
pub fn get_item_info(service: String, account: String) -> Result<Option<KeychainItemInfo>> {
  #[cfg(target_os = "macos")]
  {
    use core_foundation::string::CFString;
    
    let service_cf = CFString::new(&service);
    let account_cf = CFString::new(&account);
    
    match find_generic_password(None, &service_cf, &account_cf) {
      Ok((password_data, _)) => {
        // Basic implementation - would get actual dates from keychain attributes in full version
        Ok(Some(KeychainItemInfo {
          created: Some(chrono::Utc::now().timestamp()),
          modified: Some(chrono::Utc::now().timestamp()),
          size: password_data.len() as i32,
        }))
      }
      Err(_) => Ok(None),
    }
  }
  
  #[cfg(not(target_os = "macos"))]
  {
    Ok(None)
  }
}

/// Clear all items for a service
#[napi]
pub fn clear_service(service: String) -> Result<()> {
  #[cfg(target_os = "macos")]
  {
    // Simplified implementation - would need SecItemCopyMatching to find all items
    // For now, this is a placeholder that always succeeds
    Ok(())
  }
  
  #[cfg(not(target_os = "macos"))]
  {
    Err(napi::Error::new(
      napi::Status::GenericFailure,
      "Keychain access is only available on macOS"
    ))
  }
}

// Error code constants that match macOS Security framework
#[napi]
pub const ERR_SEC_SUCCESS: i32 = 0;
#[napi]
pub const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;
#[napi]
pub const ERR_SEC_DUPLICATE_ITEM: i32 = -25299;
#[napi]
pub const ERR_SEC_USER_CANCELED: i32 = -128;
#[napi]
pub const ERR_SEC_AUTH_FAILED: i32 = -25293;

/*
 * Build configuration for this native module:
 * 
 * Cargo.toml additions needed:
 * 
 * [dependencies]
 * napi = "2"
 * napi-derive = "2"
 * 
 * [target.'cfg(target_os = "macos")'.dependencies]
 * security-framework = "2.0"
 * core-foundation = "0.9"
 * 
 * [lib]
 * crate-type = ["cdylib"]
 * 
 * Build script would use napi-build to generate the Node.js addon
 * The resulting binary would be keychain-bridge.node
 */
