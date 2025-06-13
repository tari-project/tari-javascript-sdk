// @fileoverview Access control utilities for macOS Keychain
//
// Provides helper functions for creating and managing access control
// policies with Touch ID and user presence requirements.

#[cfg(target_os = "macos")]
use security_framework::access_control::{SecAccessControl, SecAccessControlCreateFlags};

/// Access control policy configuration
#[derive(Debug, Clone)]
pub struct AccessControlPolicy {
    /// Require Touch ID authentication
    pub require_biometry: bool,
    /// Require user presence (Touch ID or passcode)
    pub require_user_presence: bool,
    /// Allow fallback to device passcode
    pub allow_passcode_fallback: bool,
    /// Accessibility level
    pub accessibility: AccessibilityLevel,
}

/// Keychain accessibility levels
#[derive(Debug, Clone)]
pub enum AccessibilityLevel {
    /// Item accessible only when device is unlocked
    WhenUnlocked,
    /// Item accessible only when device is unlocked (this device only)
    WhenUnlockedThisDeviceOnly,
    /// Item accessible after first unlock until next reboot
    AfterFirstUnlock,
    /// Item accessible after first unlock until next reboot (this device only)
    AfterFirstUnlockThisDeviceOnly,
    /// Item always accessible (not recommended for sensitive data)
    Always,
    /// Item always accessible (this device only, not recommended)
    AlwaysThisDeviceOnly,
}

impl Default for AccessControlPolicy {
    fn default() -> Self {
        Self {
            require_biometry: false,
            require_user_presence: true,
            allow_passcode_fallback: true,
            accessibility: AccessibilityLevel::WhenUnlockedThisDeviceOnly,
        }
    }
}

impl AccessControlPolicy {
    /// Create a new access control policy
    pub fn new() -> Self {
        Default::default()
    }
    
    /// Require Touch ID authentication
    pub fn with_biometry(mut self) -> Self {
        self.require_biometry = true;
        self
    }
    
    /// Require user presence (Touch ID or passcode)
    pub fn with_user_presence(mut self) -> Self {
        self.require_user_presence = true;
        self
    }
    
    /// Allow passcode fallback when biometry fails
    pub fn with_passcode_fallback(mut self) -> Self {
        self.allow_passcode_fallback = true;
        self
    }
    
    /// Set accessibility level
    pub fn with_accessibility(mut self, accessibility: AccessibilityLevel) -> Self {
        self.accessibility = accessibility;
        self
    }
    
    /// Create a high-security policy (Touch ID required, no fallback)
    pub fn high_security() -> Self {
        Self {
            require_biometry: true,
            require_user_presence: true,
            allow_passcode_fallback: false,
            accessibility: AccessibilityLevel::WhenUnlockedThisDeviceOnly,
        }
    }
    
    /// Create a standard security policy (user presence required)
    pub fn standard_security() -> Self {
        Self {
            require_biometry: false,
            require_user_presence: true,
            allow_passcode_fallback: true,
            accessibility: AccessibilityLevel::WhenUnlockedThisDeviceOnly,
        }
    }
    
    /// Create a low-security policy (no authentication required)
    pub fn low_security() -> Self {
        Self {
            require_biometry: false,
            require_user_presence: false,
            allow_passcode_fallback: true,
            accessibility: AccessibilityLevel::WhenUnlocked,
        }
    }
}

/// Create SecAccessControl from policy
#[cfg(target_os = "macos")]
pub fn create_access_control(policy: &AccessControlPolicy) -> Result<SecAccessControl, String> {
    use security_framework::base;
    
    let accessibility = match policy.accessibility {
        AccessibilityLevel::WhenUnlocked => base::kSecAttrAccessibleWhenUnlocked,
        AccessibilityLevel::WhenUnlockedThisDeviceOnly => base::kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        AccessibilityLevel::AfterFirstUnlock => base::kSecAttrAccessibleAfterFirstUnlock,
        AccessibilityLevel::AfterFirstUnlockThisDeviceOnly => base::kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        AccessibilityLevel::Always => base::kSecAttrAccessibleAlways,
        AccessibilityLevel::AlwaysThisDeviceOnly => base::kSecAttrAccessibleAlwaysThisDeviceOnly,
    };
    
    let mut flags = SecAccessControlCreateFlags::empty();
    
    if policy.require_biometry {
        flags |= SecAccessControlCreateFlags::BIOMETRY_ANY;
        
        if policy.allow_passcode_fallback {
            flags |= SecAccessControlCreateFlags::OR;
            flags |= SecAccessControlCreateFlags::DEVICE_PASSCODE;
        }
    } else if policy.require_user_presence {
        flags |= SecAccessControlCreateFlags::USER_PRESENCE;
    }
    
    SecAccessControl::create_with_flags(accessibility, flags)
        .map_err(|e| format!("Failed to create access control: {:?}", e))
}

/// Get access control flags description
pub fn describe_access_control(policy: &AccessControlPolicy) -> String {
    let mut description = Vec::new();
    
    if policy.require_biometry {
        description.push("Touch ID required");
        if policy.allow_passcode_fallback {
            description.push("with passcode fallback");
        } else {
            description.push("(no fallback)");
        }
    } else if policy.require_user_presence {
        description.push("User authentication required");
    } else {
        description.push("No authentication required");
    }
    
    let accessibility_desc = match policy.accessibility {
        AccessibilityLevel::WhenUnlocked => "when unlocked",
        AccessibilityLevel::WhenUnlockedThisDeviceOnly => "when unlocked (this device only)",
        AccessibilityLevel::AfterFirstUnlock => "after first unlock",
        AccessibilityLevel::AfterFirstUnlockThisDeviceOnly => "after first unlock (this device only)",
        AccessibilityLevel::Always => "always accessible",
        AccessibilityLevel::AlwaysThisDeviceOnly => "always accessible (this device only)",
    };
    
    description.push(&format!("accessible {}", accessibility_desc));
    
    description.join(", ")
}

/// Check if biometry is available on the system
#[cfg(target_os = "macos")]
pub fn is_biometry_available() -> bool {
    // This would require LocalAuthentication framework bindings
    // For now, assume Touch ID is available on modern Macs
    true
}

#[cfg(not(target_os = "macos"))]
pub fn create_access_control(_policy: &AccessControlPolicy) -> Result<(), String> {
    Err("Access control only available on macOS".to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn is_biometry_available() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_access_control_policy_builder() {
        let policy = AccessControlPolicy::new()
            .with_biometry()
            .with_passcode_fallback();
            
        assert!(policy.require_biometry);
        assert!(policy.allow_passcode_fallback);
    }
    
    #[test]
    fn test_high_security_policy() {
        let policy = AccessControlPolicy::high_security();
        
        assert!(policy.require_biometry);
        assert!(policy.require_user_presence);
        assert!(!policy.allow_passcode_fallback);
    }
    
    #[test]
    fn test_describe_access_control() {
        let policy = AccessControlPolicy::high_security();
        let description = describe_access_control(&policy);
        
        assert!(description.contains("Touch ID required"));
        assert!(description.contains("no fallback"));
    }
}
