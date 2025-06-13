// @fileoverview Windows Credential Manager implementation
//
// Provides access to Windows Credential Store with proper
// error handling and credential lifecycle management.

// Core Windows credential manager functions
// Individual functions import their dependencies to avoid conflicts

/// Test access to Windows Credential Manager
pub fn test_access() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Security::Credentials::{CredReadW, CredFree, CRED_TYPE_GENERIC};
        use windows::Win32::Foundation::ERROR_NOT_FOUND;
        use windows::core::{PCWSTR, Error};
        
        // Try to read a non-existent credential to test access
        let test_target = "TariWalletTestAccess";
        let target_wide: Vec<u16> = test_target.encode_utf16().chain(std::iter::once(0)).collect();
        
        unsafe {
            let mut credential_ptr = std::ptr::null_mut();
            match CredReadW(
                PCWSTR(target_wide.as_ptr()),
                CRED_TYPE_GENERIC,
                0,
                &mut credential_ptr,
            ) {
                Ok(_) => {
                    // Unexpectedly found a credential, clean it up
                    if !credential_ptr.is_null() {
                        CredFree(credential_ptr as *const std::ffi::c_void);
                    }
                    Ok(())
                }
                Err(e) => {
                    // Check if it's just "not found" which is expected
                    let error_code = e.code().0 as u32;
                    if error_code == ERROR_NOT_FOUND.0 {
                        Ok(())
                    } else {
                        Err(format!("Credential Manager access test failed: {}", error_code))
                    }
                }
            }
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        Err("Windows Credential Manager only available on Windows".to_string())
    }
}

/// Store a credential in Windows Credential Manager
#[cfg(target_os = "windows")]
pub fn store_credential(
    target: &str,
    username: &str,
    password: &[u8],
    comment: Option<&str>,
) -> Result<(), String> {
    use windows::Win32::Security::Credentials::{
        CredWriteW, CREDENTIALW, CRED_TYPE_GENERIC, CRED_PERSIST_LOCAL_MACHINE
    };
    use windows::core::PWSTR;
    use std::ptr;
    
    let target_wide: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
    let username_wide: Vec<u16> = username.encode_utf16().chain(std::iter::once(0)).collect();
    let comment_wide = comment.map(|c| {
        c.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>()
    });
    
    let credential = CREDENTIALW {
        Flags: 0,
        Type: CRED_TYPE_GENERIC,
        TargetName: PWSTR(target_wide.as_ptr() as *mut u16),
        Comment: comment_wide.as_ref().map_or(PWSTR::null(), |c| PWSTR(c.as_ptr() as *mut u16)),
        LastWritten: unsafe { std::mem::zeroed() },
        CredentialBlobSize: password.len() as u32,
        CredentialBlob: password.as_ptr() as *mut u8,
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        AttributeCount: 0,
        Attributes: ptr::null_mut(),
        TargetAlias: PWSTR::null(),
        UserName: PWSTR(username_wide.as_ptr() as *mut u16),
    };
    
    unsafe {
        match CredWriteW(&credential, 0) {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to store credential: {}", e.code().0))
        }
    }
}

/// Retrieve a credential from Windows Credential Manager
#[cfg(target_os = "windows")]
pub fn retrieve_credential(target: &str) -> Result<(String, Vec<u8>), String> {
    use windows::Win32::Security::Credentials::{CredReadW, CredFree, CREDENTIALW, CRED_TYPE_GENERIC};
    use windows::core::PCWSTR;
    
    let target_wide: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
    
    unsafe {
        let mut credential_ptr = std::ptr::null_mut();
        match CredReadW(
            PCWSTR(target_wide.as_ptr()),
            CRED_TYPE_GENERIC,
            0,
            &mut credential_ptr,
        ) {
            Ok(_) if !credential_ptr.is_null() => {
                let credential = &*(credential_ptr as *const CREDENTIALW);
                
                // Extract username
                let username = if !credential.UserName.is_null() {
                    let username_slice = std::slice::from_raw_parts(
                        credential.UserName.0,
                        wcslen(credential.UserName.0),
                    );
                    String::from_utf16_lossy(username_slice)
                } else {
                    String::new()
                };
                
                // Extract password
                let password = std::slice::from_raw_parts(
                    credential.CredentialBlob,
                    credential.CredentialBlobSize as usize,
                ).to_vec();
                
                // Free the credential
                CredFree(credential_ptr as *const std::ffi::c_void);
                
                Ok((username, password))
            }
            Ok(_) => {
                Err("Invalid credential pointer".to_string())
            }
            Err(e) => {
                Err(format!("Credential not found: {}", e.code().0))
            }
        }
    }
}

/// Delete a credential from Windows Credential Manager
#[cfg(target_os = "windows")]
pub fn delete_credential(target: &str) -> Result<(), String> {
    use windows::Win32::Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC};
    use windows::core::PCWSTR;
    
    let target_wide: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
    
    unsafe {
        match CredDeleteW(
            PCWSTR(target_wide.as_ptr()),
            CRED_TYPE_GENERIC,
            0,
        ) {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to delete credential: {}", e.code().0))
        }
    }
}

/// Helper function to calculate wide string length
#[cfg(target_os = "windows")]
unsafe fn wcslen(s: *const u16) -> usize {
    let mut len = 0;
    while *s.add(len) != 0 {
        len += 1;
    }
    len
}

/// Placeholder implementations for non-Windows platforms
#[cfg(not(target_os = "windows"))]
pub fn store_credential(
    _target: &str,
    _username: &str,
    _password: &[u8],
    _comment: Option<&str>,
) -> Result<(), String> {
    Err("Windows Credential Manager only available on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn retrieve_credential(_target: &str) -> Result<(String, Vec<u8>), String> {
    Err("Windows Credential Manager only available on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn delete_credential(_target: &str) -> Result<(), String> {
    Err("Windows Credential Manager only available on Windows".to_string())
}
