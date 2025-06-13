// @fileoverview Native Rust bridge for Windows Credential Store access
//
// This module provides a Node.js native addon for accessing Windows
// Credential Manager with DPAPI encryption through NAPI-RS.

use napi_derive::napi;
use napi::{Result, JsBuffer, JsString, JsObject, JsBoolean, Env};

/// Windows credential item structure for JavaScript interface
#[napi(object)]
pub struct WindowsCredentialItem {
  pub target: String,
  pub username: String,
  pub data: JsBuffer,
  pub comment: Option<String>,
}

/// Store a credential in Windows Credential Manager
#[napi]
pub fn store_credential(item: WindowsCredentialItem) -> Result<()> {
  #[cfg(target_os = "windows")]
  {
    use crate::windows::credential_manager;
    use crate::windows::dpapi;
    
    let password_data = item.data.into_value()?;
    let password_bytes = password_data.as_slice();
    
    // Encrypt the password using DPAPI
    let encrypted_data = dpapi::encrypt_data(password_bytes, Some("Tari Wallet"))
      .map_err(|e| napi::Error::new(
        napi::Status::GenericFailure,
        format!("DPAPI encryption failed: {}", e)
      ))?;
    
    // Store the encrypted credential
    credential_manager::store_credential(
      &item.target,
      &item.username,
      &encrypted_data,
      item.comment.as_deref(),
    ).map_err(|e| napi::Error::new(
      napi::Status::GenericFailure,
      format!("Failed to store credential: {}", e)
    ))?;
    
    Ok(())
  }
  
  #[cfg(not(target_os = "windows"))]
  {
    Err(napi::Error::new(
      napi::Status::GenericFailure,
      "Windows Credential Store is only available on Windows"
    ))
  }
}

/// Retrieve a credential from Windows Credential Manager
#[napi]
pub fn get_credential(env: Env, target: String) -> Result<Option<JsBuffer>> {
  #[cfg(target_os = "windows")]
  {
    use crate::windows::credential_manager;
    use crate::windows::dpapi;
    
    match credential_manager::retrieve_credential(&target) {
      Ok((_username, encrypted_data)) => {
        // Decrypt the password using DPAPI
        match dpapi::decrypt_data(&encrypted_data) {
          Ok(decrypted_data) => {
            let buffer = env.create_buffer_with_data(decrypted_data)?;
            Ok(Some(buffer.into_raw()))
          }
          Err(e) => Err(napi::Error::new(
            napi::Status::GenericFailure,
            format!("DPAPI decryption failed: {}", e)
          ))
        }
      }
      Err(_) => Ok(None),
    }
  }
  
  #[cfg(not(target_os = "windows"))]
  {
    Err(napi::Error::new(
      napi::Status::GenericFailure,
      "Windows Credential Store is only available on Windows"
    ))
  }
}

/// Delete a credential from Windows Credential Manager
#[napi]
pub fn delete_credential(target: String) -> Result<()> {
  #[cfg(target_os = "windows")]
  {
    use crate::windows::credential_manager;
    
    credential_manager::delete_credential(&target)
      .map_err(|e| napi::Error::new(
        napi::Status::GenericFailure,
        format!("Failed to delete credential: {}", e)
      ))?;
    
    Ok(())
  }
  
  #[cfg(not(target_os = "windows"))]
  {
    Err(napi::Error::new(
      napi::Status::GenericFailure,
      "Windows Credential Store is only available on Windows"
    ))
  }
}

/// Check if a credential exists in Windows Credential Manager
#[napi]
pub fn credential_exists(target: String) -> Result<bool> {
  #[cfg(target_os = "windows")]
  {
    use crate::windows::credential_manager;
    
    match credential_manager::retrieve_credential(&target) {
      Ok(_) => Ok(true),
      Err(_) => Ok(false),
    }
  }
  
  #[cfg(not(target_os = "windows"))]
  {
    Ok(false)
  }
}

/// Test Windows Credential Manager access
#[napi]
pub fn test_credential_manager() -> Result<bool> {
  #[cfg(target_os = "windows")]
  {
    use crate::windows::credential_manager;
    
    match credential_manager::test_access() {
      Ok(_) => Ok(true),
      Err(_) => Ok(false),
    }
  }
  
  #[cfg(not(target_os = "windows"))]
  {
    Ok(false)
  }
}
