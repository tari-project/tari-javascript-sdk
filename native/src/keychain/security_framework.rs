// @fileoverview Enhanced Security framework integration
//
// Provides advanced keychain operations with access control,
// Touch ID integration, and proper error handling.

#[cfg(target_os = "macos")]
use security_framework::{
    keychain::{SecKeychain, ItemClass, ItemSearchOptions},
    item::{SearchResult, ItemSearchOptions as ItemSearch},
    access_control::{SecAccessControl, SecAccessControlCreateFlags},
    passwords::{set_generic_password, find_generic_password, delete_generic_password},
};

#[cfg(target_os = "macos")]
use core_foundation::{
    string::CFString,
    data::CFData,
    dictionary::CFDictionary,
    base::{TCFType, CFType},
    date::CFDate,
};

use napi::{Result, JsBuffer, Env};

/// Enhanced keychain item with access control
#[cfg(target_os = "macos")]
pub struct SecureKeychainItem {
    pub service: String,
    pub account: String,
    pub data: Vec<u8>,
    pub label: Option<String>,
    pub require_touch_id: bool,
    pub require_user_presence: bool,
}

/// Create a keychain item with advanced access control
#[cfg(target_os = "macos")]
pub fn create_secure_item(item: SecureKeychainItem) -> Result<()> {
    use security_framework::item::{add_item, ItemAddOptions, ItemAddValue};
    use security_framework::base::ToVoid;
    use std::collections::HashMap;
    
    let service_cf = CFString::new(&item.service);
    let account_cf = CFString::new(&item.account);
    let data_cf = CFData::from_buffer(&item.data);
    
    // Create access control based on requirements
    let mut access_flags = SecAccessControlCreateFlags::empty();
    
    if item.require_touch_id {
        access_flags |= SecAccessControlCreateFlags::BIOMETRY_ANY;
    }
    
    if item.require_user_presence {
        access_flags |= SecAccessControlCreateFlags::USER_PRESENCE;
    }
    
    // Set default to require device passcode if no other auth specified
    if access_flags.is_empty() {
        access_flags |= SecAccessControlCreateFlags::DEVICE_PASSCODE;
    }
    
    let access_control = SecAccessControl::create_with_flags(
        security_framework::base::kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        access_flags
    ).map_err(|e| napi::Error::new(
        napi::Status::GenericFailure,
        format!("Failed to create access control: {:?}", e)
    ))?;
    
    // Build attributes dictionary
    let mut attributes = HashMap::new();
    attributes.insert(
        security_framework::item::kSecClass.to_void(),
        security_framework::item::kSecClassGenericPassword.to_void()
    );
    attributes.insert(
        security_framework::item::kSecAttrService.to_void(),
        service_cf.to_void()
    );
    attributes.insert(
        security_framework::item::kSecAttrAccount.to_void(),
        account_cf.to_void()
    );
    attributes.insert(
        security_framework::item::kSecValueData.to_void(),
        data_cf.to_void()
    );
    attributes.insert(
        security_framework::item::kSecAttrAccessControl.to_void(),
        access_control.to_void()
    );
    
    if let Some(label) = &item.label {
        let label_cf = CFString::new(label);
        attributes.insert(
            security_framework::item::kSecAttrLabel.to_void(),
            label_cf.to_void()
        );
    }
    
    // Add the item to keychain
    let add_options = ItemAddOptions::new(attributes);
    
    match add_item(&add_options) {
        Ok(_) => Ok(()),
        Err(e) => Err(napi::Error::new(
            napi::Status::GenericFailure,
            format!("Failed to create keychain item: {:?}", e)
        ))
    }
}

/// Retrieve a keychain item with authentication
#[cfg(target_os = "macos")]
pub fn get_secure_item(
    service: &str,
    account: &str,
    use_touch_id: bool
) -> Result<Option<Vec<u8>>> {
    use security_framework::item::{ItemSearchOptions, SearchResult};
    use security_framework::base::ToVoid;
    use std::collections::HashMap;
    
    let service_cf = CFString::new(service);
    let account_cf = CFString::new(account);
    
    // Build search query
    let mut query = HashMap::new();
    query.insert(
        security_framework::item::kSecClass.to_void(),
        security_framework::item::kSecClassGenericPassword.to_void()
    );
    query.insert(
        security_framework::item::kSecAttrService.to_void(),
        service_cf.to_void()
    );
    query.insert(
        security_framework::item::kSecAttrAccount.to_void(),
        account_cf.to_void()
    );
    query.insert(
        security_framework::item::kSecReturnData.to_void(),
        true.to_void()
    );
    query.insert(
        security_framework::item::kSecMatchLimit.to_void(),
        security_framework::item::kSecMatchLimitOne.to_void()
    );
    
    if use_touch_id {
        query.insert(
            security_framework::item::kSecUseAuthenticationUI.to_void(),
            security_framework::item::kSecUseAuthenticationUIAllow.to_void()
        );
    }
    
    let search_options = ItemSearchOptions::new(query);
    
    match security_framework::item::search_items(&search_options) {
        Ok(results) => {
            if let Some(SearchResult::Data(data)) = results.first() {
                Ok(Some(data.to_vec()))
            } else {
                Ok(None)
            }
        }
        Err(_) => Ok(None)
    }
}

/// Delete a keychain item
#[cfg(target_os = "macos")]
pub fn delete_secure_item(service: &str, account: &str) -> Result<()> {
    let service_cf = CFString::new(service);
    let account_cf = CFString::new(account);
    
    match delete_generic_password(&service_cf, &account_cf) {
        Ok(_) => Ok(()),
        Err(e) => Err(napi::Error::new(
            napi::Status::GenericFailure,
            format!("Failed to delete keychain item: {:?}", e)
        ))
    }
}

/// List all items for a service
#[cfg(target_os = "macos")]
pub fn list_service_items(service: &str) -> Result<Vec<String>> {
    use security_framework::item::{ItemSearchOptions, SearchResult};
    use security_framework::base::ToVoid;
    use std::collections::HashMap;
    
    let service_cf = CFString::new(service);
    let mut accounts = Vec::new();
    
    // Build search query
    let mut query = HashMap::new();
    query.insert(
        security_framework::item::kSecClass.to_void(),
        security_framework::item::kSecClassGenericPassword.to_void()
    );
    query.insert(
        security_framework::item::kSecAttrService.to_void(),
        service_cf.to_void()
    );
    query.insert(
        security_framework::item::kSecReturnAttributes.to_void(),
        true.to_void()
    );
    query.insert(
        security_framework::item::kSecMatchLimit.to_void(),
        security_framework::item::kSecMatchLimitAll.to_void()
    );
    
    let search_options = ItemSearchOptions::new(query);
    
    match security_framework::item::search_items(&search_options) {
        Ok(results) => {
            for result in results {
                if let SearchResult::Dict(dict) = result {
                    if let Some(account_ref) = dict.find(&*security_framework::item::kSecAttrAccount) {
                        if let Ok(account_string) = account_ref.downcast::<CFString>() {
                            accounts.push(account_string.to_string());
                        }
                    }
                }
            }
            Ok(accounts)
        }
        Err(e) => Err(napi::Error::new(
            napi::Status::GenericFailure,
            format!("Failed to list keychain items: {:?}", e)
        ))
    }
}

/// Non-macOS placeholder implementations
#[cfg(not(target_os = "macos"))]
pub struct SecureKeychainItem {
    pub service: String,
    pub account: String,
    pub data: Vec<u8>,
    pub label: Option<String>,
    pub require_touch_id: bool,
    pub require_user_presence: bool,
}

#[cfg(not(target_os = "macos"))]
pub fn create_secure_item(_item: SecureKeychainItem) -> Result<()> {
    Err(napi::Error::new(
        napi::Status::GenericFailure,
        "macOS Keychain only available on macOS"
    ))
}

#[cfg(not(target_os = "macos"))]
pub fn get_secure_item(
    _service: &str,
    _account: &str,
    _use_touch_id: bool
) -> Result<Option<Vec<u8>>> {
    Err(napi::Error::new(
        napi::Status::GenericFailure,
        "macOS Keychain only available on macOS"
    ))
}

#[cfg(not(target_os = "macos"))]
pub fn delete_secure_item(_service: &str, _account: &str) -> Result<()> {
    Err(napi::Error::new(
        napi::Status::GenericFailure,
        "macOS Keychain only available on macOS"
    ))
}

#[cfg(not(target_os = "macos"))]
pub fn list_service_items(_service: &str) -> Result<Vec<String>> {
    Err(napi::Error::new(
        napi::Status::GenericFailure,
        "macOS Keychain only available on macOS"
    ))
}
