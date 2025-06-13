// @fileoverview Windows DPAPI encryption wrapper
//
// Provides user-scope DPAPI encryption for sensitive data
// with proper error handling and memory management.

// DPAPI functions use their own local imports to avoid conflicts

/// Encrypt data using Windows DPAPI
#[cfg(target_os = "windows")]
pub fn encrypt_data(data: &[u8], description: Option<&str>) -> Result<Vec<u8>, String> {
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_BLOB
    };
    use windows::Win32::System::Memory::LocalFree;
    use windows::Win32::Foundation::HLOCAL;
    use windows::core::PWSTR;
    use std::ptr;
    
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
        match CryptProtectData(
            &mut data_in,
            description_wide.as_ref().map_or(PWSTR::null(), |p| *p),
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut data_out,
        ) {
            Ok(_) => {
                let encrypted_data = std::slice::from_raw_parts(
                    data_out.pbData,
                    data_out.cbData as usize,
                ).to_vec();
                
                // Free the allocated memory
                LocalFree(HLOCAL(data_out.pbData as isize));
                
                Ok(encrypted_data)
            }
            Err(e) => {
                Err(format!("DPAPI encryption failed: {}", e.code().0))
            }
        }
    }
}

/// Decrypt data using Windows DPAPI
#[cfg(target_os = "windows")]
pub fn decrypt_data(encrypted_data: &[u8]) -> Result<Vec<u8>, String> {
    use windows::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_BLOB
    };
    use windows::Win32::System::Memory::LocalFree;
    use windows::Win32::Foundation::HLOCAL;
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
        match CryptUnprotectData(
            &mut data_in,
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut data_out,
        ) {
            Ok(_) => {
                let decrypted_data = std::slice::from_raw_parts(
                    data_out.pbData,
                    data_out.cbData as usize,
                ).to_vec();
                
                // Free the allocated memory
                LocalFree(HLOCAL(data_out.pbData as isize));
                
                Ok(decrypted_data)
            }
            Err(e) => {
                Err(format!("DPAPI decryption failed: {}", e.code().0))
            }
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
