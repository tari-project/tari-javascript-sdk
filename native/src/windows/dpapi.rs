// @fileoverview Windows DPAPI encryption wrapper
//
// Provides user-scope DPAPI encryption for sensitive data
// with proper error handling and memory management.

#[cfg(target_os = "windows")]
use windows::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN,
    CRYPT_BLOB, CRYPTPROTECT_LOCAL_MACHINE
};

/// Encrypt data using Windows DPAPI
#[cfg(target_os = "windows")]
pub fn encrypt_data(data: &[u8], description: Option<&str>) -> Result<Vec<u8>, String> {
    use std::ptr;
    use windows::core::PWSTR;
    
    let mut data_in = CRYPT_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    
    let mut data_out = CRYPT_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    
    let description_wide = description.map(|s| {
        let wide: Vec<u16> = s.encode_utf16().chain(std::iter::once(0)).collect();
        PWSTR(wide.as_ptr() as *mut u16)
    });
    
    unsafe {
        let result = CryptProtectData(
            &mut data_in,
            description_wide.as_ref().map_or(PWSTR::null(), |p| *p),
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut data_out,
        );
        
        if result.is_ok() {
            let encrypted_data = std::slice::from_raw_parts(
                data_out.pbData,
                data_out.cbData as usize,
            ).to_vec();
            
            // Free the allocated memory
            windows::Win32::System::Memory::LocalFree(
                windows::Win32::Foundation::HLOCAL(data_out.pbData as isize)
            );
            
            Ok(encrypted_data)
        } else {
            Err("DPAPI encryption failed".to_string())
        }
    }
}

/// Decrypt data using Windows DPAPI
#[cfg(target_os = "windows")]
pub fn decrypt_data(encrypted_data: &[u8]) -> Result<Vec<u8>, String> {
    use std::ptr;
    
    let mut data_in = CRYPT_BLOB {
        cbData: encrypted_data.len() as u32,
        pbData: encrypted_data.as_ptr() as *mut u8,
    };
    
    let mut data_out = CRYPT_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    
    unsafe {
        let result = CryptUnprotectData(
            &mut data_in,
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut data_out,
        );
        
        if result.is_ok() {
            let decrypted_data = std::slice::from_raw_parts(
                data_out.pbData,
                data_out.cbData as usize,
            ).to_vec();
            
            // Free the allocated memory
            windows::Win32::System::Memory::LocalFree(
                windows::Win32::Foundation::HLOCAL(data_out.pbData as isize)
            );
            
            Ok(decrypted_data)
        } else {
            Err("DPAPI decryption failed".to_string())
        }
    }
}

/// Placeholder implementations for non-Windows platforms
#[cfg(not(target_os = "windows"))]
pub fn encrypt_data(_data: &[u8], _description: Option<&str>) -> Result<Vec<u8>, String> {
    Err("DPAPI only available on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn decrypt_data(_encrypted_data: &[u8]) -> Result<Vec<u8>, String> {
    Err("DPAPI only available on Windows".to_string())
}
