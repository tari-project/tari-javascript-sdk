// @fileoverview Windows Credential Manager implementation
//
// Provides access to Windows Credential Store with proper
// error handling and credential lifecycle management.

#[cfg(target_os = "windows")]
use windows::Win32::Security::Credentials::{
    CredWriteW, CredReadW, CredDeleteW, CredFree,
    CREDENTIALW, CRED_TYPE_GENERIC, CRED_PERSIST_LOCAL_MACHINE,
    CREDENTIAL_ATTRIBUTEW,
};

#[cfg(target_os = "windows")]
use windows::core::{PWSTR, PCWSTR};

/// Test access to Windows Credential Manager
pub fn test_access() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Try to read a non-existent credential to test access
        let test_target = "TariWalletTestAccess";
        let target_wide: Vec<u16> = test_target.encode_utf16().chain(std::iter::once(0)).collect();
        
        unsafe {
            let mut credential_ptr = std::ptr::null_mut();
            let result = CredReadW(
                PCWSTR(target_wide.as_ptr()),
                CRED_TYPE_GENERIC,
                0,
                &mut credential_ptr,
            );
            
            // We expect this to fail (credential not found), but if it succeeds,
            // we need to free the memory
            if result.is_ok() && !credential_ptr.is_null() {
                CredFree(credential_ptr as *const std::ffi::c_void);
            }
        }
        
        // If we get here without crashing, Credential Manager is accessible
        Ok(())
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
        let result = CredWriteW(&credential, 0);
        if result.is_ok() {
            Ok(())
        } else {
            Err("Failed to store credential".to_string())
        }
    }
}

/// Retrieve a credential from Windows Credential Manager
#[cfg(target_os = "windows")]
pub fn retrieve_credential(target: &str) -> Result<(String, Vec<u8>), String> {
    let target_wide: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
    
    unsafe {
        let mut credential_ptr = std::ptr::null_mut();
        let result = CredReadW(
            PCWSTR(target_wide.as_ptr()),
            CRED_TYPE_GENERIC,
            0,
            &mut credential_ptr,
        );
        
        if result.is_ok() && !credential_ptr.is_null() {
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
        } else {
            Err("Credential not found".to_string())
        }
    }
}

/// Delete a credential from Windows Credential Manager
#[cfg(target_os = "windows")]
pub fn delete_credential(target: &str) -> Result<(), String> {
    let target_wide: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
    
    unsafe {
        let result = CredDeleteW(
            PCWSTR(target_wide.as_ptr()),
            CRED_TYPE_GENERIC,
            0,
        );
        
        if result.is_ok() {
            Ok(())
        } else {
            Err("Failed to delete credential".to_string())
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
