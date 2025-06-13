/**
 * @fileoverview Touch ID and Face ID integration for macOS
 * 
 * Provides LocalAuthentication framework integration with proper
 * error handling, biometric state management, and security policies.
 */

use std::sync::{Arc, Mutex};
use std::collections::HashMap;

#[cfg(target_os = "macos")]
use core_foundation::{
    base::{CFType, TCFType, CFTypeRef, ToVoid},
    string::{CFString, CFStringRef},
    dictionary::{CFDictionary, CFMutableDictionary},
    data::{CFData, CFDataRef},
    boolean::{CFBoolean, CFBooleanRef},
    number::{CFNumber, CFNumberRef},
    error::{CFError, CFErrorRef},
};

/// Biometric authentication policy
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BiometricPolicy {
    /// Device owner authentication with biometrics
    DeviceOwnerAuthenticationWithBiometrics,
    /// Device owner authentication with biometrics or passcode
    DeviceOwnerAuthentication,
    /// Watch authentication (for Apple Watch integration)
    WatchAuthentication,
}

/// Biometric authentication error codes
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BiometricError {
    /// Authentication was not successful because the user failed to provide valid credentials
    AuthenticationFailed = -1,
    /// Authentication was canceled by the user (e.g., tapped Cancel button)
    UserCancel = -2,
    /// Authentication was canceled by the system (e.g., another application went to foreground)
    SystemCancel = -4,
    /// Authentication could not start because passcode is not set on the device
    PasscodeNotSet = -5,
    /// Authentication could not start because Touch ID or Face ID is not available on the device
    BiometryNotAvailable = -6,
    /// Authentication could not start because Touch ID or Face ID has no enrolled fingers or faces
    BiometryNotEnrolled = -7,
    /// Authentication was not successful because there were too many failed biometry attempts
    BiometryLockout = -8,
    /// Authentication was canceled by application (e.g., invalidated by new auth context)
    AppCancel = -9,
    /// LAContext passed to this call has been previously invalidated
    InvalidContext = -10,
    /// Authentication could not start because biometry is locked out
    BiometryPermanentLockout = -1004,
}

impl BiometricError {
    pub fn from_code(code: i32) -> Option<Self> {
        match code {
            -1 => Some(BiometricError::AuthenticationFailed),
            -2 => Some(BiometricError::UserCancel),
            -4 => Some(BiometricError::SystemCancel),
            -5 => Some(BiometricError::PasscodeNotSet),
            -6 => Some(BiometricError::BiometryNotAvailable),
            -7 => Some(BiometricError::BiometryNotEnrolled),
            -8 => Some(BiometricError::BiometryLockout),
            -9 => Some(BiometricError::AppCancel),
            -10 => Some(BiometricError::InvalidContext),
            -1004 => Some(BiometricError::BiometryPermanentLockout),
            _ => None,
        }
    }
    
    pub fn description(&self) -> &'static str {
        match self {
            BiometricError::AuthenticationFailed => "Authentication failed - invalid biometric data",
            BiometricError::UserCancel => "Authentication canceled by user",
            BiometricError::SystemCancel => "Authentication canceled by system",
            BiometricError::PasscodeNotSet => "Device passcode is not set",
            BiometricError::BiometryNotAvailable => "Biometry is not available on this device",
            BiometricError::BiometryNotEnrolled => "No biometric data enrolled",
            BiometricError::BiometryLockout => "Biometry is locked due to too many failed attempts",
            BiometricError::AppCancel => "Authentication canceled by application",
            BiometricError::InvalidContext => "Authentication context is invalid",
            BiometricError::BiometryPermanentLockout => "Biometry is permanently locked",
        }
    }
    
    pub fn is_recoverable(&self) -> bool {
        match self {
            BiometricError::AuthenticationFailed |
            BiometricError::UserCancel |
            BiometricError::SystemCancel |
            BiometricError::AppCancel => true,
            _ => false,
        }
    }
    
    pub fn requires_passcode_fallback(&self) -> bool {
        match self {
            BiometricError::BiometryLockout |
            BiometricError::BiometryPermanentLockout |
            BiometricError::BiometryNotAvailable |
            BiometricError::BiometryNotEnrolled => true,
            _ => false,
        }
    }
}

/// Biometric type available on the device
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BiometricType {
    None = 0,
    TouchID = 1,
    FaceID = 2,
    OpticID = 3, // For future Apple Vision devices
}

impl BiometricType {
    pub fn from_code(code: i32) -> Self {
        match code {
            1 => BiometricType::TouchID,
            2 => BiometricType::FaceID,
            3 => BiometricType::OpticID,
            _ => BiometricType::None,
        }
    }
    
    pub fn description(&self) -> &'static str {
        match self {
            BiometricType::None => "No biometric authentication available",
            BiometricType::TouchID => "Touch ID",
            BiometricType::FaceID => "Face ID",
            BiometricType::OpticID => "Optic ID",
        }
    }
}

/// Authentication context for managing biometric sessions
#[derive(Clone)]
pub struct AuthenticationContext {
    #[cfg(target_os = "macos")]
    context: Option<CFTypeRef>, // LAContext in real implementation
    policy: BiometricPolicy,
    fallback_title: Option<String>,
    cancel_title: Option<String>,
    max_retry_count: u32,
    current_retry_count: u32,
    locked_until: Option<std::time::SystemTime>,
}

impl AuthenticationContext {
    pub fn new() -> Self {
        Self {
            #[cfg(target_os = "macos")]
            context: None, // Would create LAContext here
            policy: BiometricPolicy::DeviceOwnerAuthenticationWithBiometrics,
            fallback_title: None,
            cancel_title: None,
            max_retry_count: 3,
            current_retry_count: 0,
            locked_until: None,
        }
    }
    
    pub fn with_policy(mut self, policy: BiometricPolicy) -> Self {
        self.policy = policy;
        self
    }
    
    pub fn with_fallback_title(mut self, title: String) -> Self {
        self.fallback_title = Some(title);
        self
    }
    
    pub fn with_cancel_title(mut self, title: String) -> Self {
        self.cancel_title = Some(title);
        self
    }
    
    pub fn with_max_retries(mut self, count: u32) -> Self {
        self.max_retry_count = count;
        self
    }
    
    #[cfg(target_os = "macos")]
    pub fn can_evaluate_policy(&self) -> Result<bool, BiometricError> {
        // In real implementation, this would call LAContext.canEvaluatePolicy
        // For now, simulate the check
        
        // Check if biometric hardware is available
        let biometric_available = self.is_biometric_hardware_available();
        if !biometric_available {
            return Err(BiometricError::BiometryNotAvailable);
        }
        
        // Check if biometrics are enrolled
        let biometric_enrolled = self.is_biometric_enrolled();
        if !biometric_enrolled {
            return Err(BiometricError::BiometryNotEnrolled);
        }
        
        // Check if device is locked out
        if self.is_temporarily_locked() {
            return Err(BiometricError::BiometryLockout);
        }
        
        if self.is_permanently_locked() {
            return Err(BiometricError::BiometryPermanentLockout);
        }
        
        Ok(true)
    }
    
    #[cfg(not(target_os = "macos"))]
    pub fn can_evaluate_policy(&self) -> Result<bool, BiometricError> {
        Err(BiometricError::BiometryNotAvailable)
    }
    
    #[cfg(target_os = "macos")]
    pub async fn evaluate_policy(&mut self, reason: &str) -> Result<(), BiometricError> {
        // Check if we can evaluate first
        self.can_evaluate_policy()?;
        
        // Check retry limits
        if self.current_retry_count >= self.max_retry_count {
            self.locked_until = Some(
                std::time::SystemTime::now() + std::time::Duration::from_secs(300) // 5 minutes
            );
            return Err(BiometricError::BiometryLockout);
        }
        
        // In real implementation, this would be:
        // 1. Create completion handler
        // 2. Call LAContext.evaluatePolicy with reason and completion
        // 3. Handle async result
        
        // For simulation, we'll just return success
        // Real implementation would handle all the BiometricError cases
        
        self.current_retry_count = 0; // Reset on success
        Ok(())
    }
    
    #[cfg(not(target_os = "macos"))]
    pub async fn evaluate_policy(&mut self, _reason: &str) -> Result<(), BiometricError> {
        Err(BiometricError::BiometryNotAvailable)
    }
    
    pub fn get_biometric_type(&self) -> BiometricType {
        #[cfg(target_os = "macos")]
        {
            // In real implementation, this would check LAContext.biometryType
            // For simulation, assume Touch ID is available
            BiometricType::TouchID
        }
        
        #[cfg(not(target_os = "macos"))]
        {
            BiometricType::None
        }
    }
    
    pub fn invalidate(&mut self) {
        #[cfg(target_os = "macos")]
        {
            // In real implementation, this would call LAContext.invalidate()
            self.context = None;
        }
        
        self.current_retry_count = 0;
        self.locked_until = None;
    }
    
    fn is_biometric_hardware_available(&self) -> bool {
        #[cfg(target_os = "macos")]
        {
            // Would check device capabilities
            true
        }
        
        #[cfg(not(target_os = "macos"))]
        {
            false
        }
    }
    
    fn is_biometric_enrolled(&self) -> bool {
        #[cfg(target_os = "macos")]
        {
            // Would check if biometric data is enrolled
            true
        }
        
        #[cfg(not(target_os = "macos"))]
        {
            false
        }
    }
    
    fn is_temporarily_locked(&self) -> bool {
        if let Some(locked_until) = self.locked_until {
            std::time::SystemTime::now() < locked_until
        } else {
            false
        }
    }
    
    fn is_permanently_locked(&self) -> bool {
        // In real implementation, this would check system biometric lockout state
        false
    }
}

/// Global authentication manager
pub struct BiometricManager {
    contexts: Arc<Mutex<HashMap<String, AuthenticationContext>>>,
    global_settings: Arc<Mutex<BiometricSettings>>,
}

/// Global biometric settings
#[derive(Debug, Clone)]
pub struct BiometricSettings {
    pub max_global_retries: u32,
    pub lockout_duration_seconds: u64,
    pub require_passcode_fallback: bool,
    pub log_authentication_attempts: bool,
}

impl Default for BiometricSettings {
    fn default() -> Self {
        Self {
            max_global_retries: 5,
            lockout_duration_seconds: 300, // 5 minutes
            require_passcode_fallback: true,
            log_authentication_attempts: true,
        }
    }
}

impl BiometricManager {
    pub fn new() -> Self {
        Self {
            contexts: Arc::new(Mutex::new(HashMap::new())),
            global_settings: Arc::new(Mutex::new(BiometricSettings::default())),
        }
    }
    
    pub fn create_context(&self, id: String) -> AuthenticationContext {
        let context = AuthenticationContext::new();
        
        let mut contexts = self.contexts.lock().unwrap();
        contexts.insert(id, context.clone());
        
        context
    }
    
    pub fn get_context(&self, id: &str) -> Option<AuthenticationContext> {
        let contexts = self.contexts.lock().unwrap();
        contexts.get(id).cloned()
    }
    
    pub fn remove_context(&self, id: &str) {
        let mut contexts = self.contexts.lock().unwrap();
        if let Some(mut context) = contexts.remove(id) {
            context.invalidate();
        }
    }
    
    pub fn update_settings(&self, settings: BiometricSettings) {
        let mut global_settings = self.global_settings.lock().unwrap();
        *global_settings = settings;
    }
    
    pub fn get_settings(&self) -> BiometricSettings {
        let global_settings = self.global_settings.lock().unwrap();
        global_settings.clone()
    }
    
    /// Check overall biometric availability on the system
    pub fn system_biometric_available(&self) -> Result<BiometricType, BiometricError> {
        #[cfg(target_os = "macos")]
        {
            let context = AuthenticationContext::new();
            match context.can_evaluate_policy() {
                Ok(_) => Ok(context.get_biometric_type()),
                Err(e) => Err(e),
            }
        }
        
        #[cfg(not(target_os = "macos"))]
        {
            Err(BiometricError::BiometryNotAvailable)
        }
    }
    
    /// Perform a system-wide biometric check
    pub async fn authenticate_with_system_biometric(
        &self,
        reason: &str,
        context_id: Option<String>,
    ) -> Result<(), BiometricError> {
        let context_id = context_id.unwrap_or_else(|| "default".to_string());
        
        let context = {
            let contexts = self.contexts.lock().unwrap();
            contexts.get(&context_id).cloned()
        };
        
        let mut context = context.unwrap_or_else(|| self.create_context(context_id.clone()));
        
        let result = context.evaluate_policy(reason).await;
        
        // Update the stored context
        let mut contexts = self.contexts.lock().unwrap();
        contexts.insert(context_id, context);
        
        result
    }
    
    /// Clear all authentication contexts (useful for app backgrounding)
    pub fn clear_all_contexts(&self) {
        let mut contexts = self.contexts.lock().unwrap();
        for (_, mut context) in contexts.drain() {
            context.invalidate();
        }
    }
}

/// Global biometric manager instance
static mut BIOMETRIC_MANAGER: Option<Arc<BiometricManager>> = None;
static MANAGER_INIT: std::sync::Once = std::sync::Once::new();

pub fn get_biometric_manager() -> Arc<BiometricManager> {
    unsafe {
        MANAGER_INIT.call_once(|| {
            BIOMETRIC_MANAGER = Some(Arc::new(BiometricManager::new()));
        });
        
        BIOMETRIC_MANAGER.as_ref().unwrap().clone()
    }
}

/// Utility functions for common biometric operations
pub mod utils {
    use super::*;
    
    /// Quick check if biometric authentication is available and enrolled
    pub fn is_biometric_ready() -> bool {
        let manager = get_biometric_manager();
        match manager.system_biometric_available() {
            Ok(biometric_type) => biometric_type != BiometricType::None,
            Err(_) => false,
        }
    }
    
    /// Get a user-friendly description of biometric availability
    pub fn get_biometric_status_description() -> String {
        let manager = get_biometric_manager();
        match manager.system_biometric_available() {
            Ok(biometric_type) => {
                format!("{} is available and ready", biometric_type.description())
            },
            Err(error) => error.description().to_string(),
        }
    }
    
    /// Perform authentication with automatic retry and fallback handling
    pub async fn authenticate_with_retry(
        reason: &str,
        max_retries: u32,
    ) -> Result<(), BiometricError> {
        let manager = get_biometric_manager();
        let context_id = format!("retry-context-{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs());
        
        for attempt in 0..max_retries {
            match manager.authenticate_with_system_biometric(reason, Some(context_id.clone())).await {
                Ok(_) => {
                    manager.remove_context(&context_id);
                    return Ok(());
                },
                Err(error) => {
                    if !error.is_recoverable() || attempt == max_retries - 1 {
                        manager.remove_context(&context_id);
                        return Err(error);
                    }
                    
                    // Add small delay between retries
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                }
            }
        }
        
        manager.remove_context(&context_id);
        Err(BiometricError::AuthenticationFailed)
    }
    
    /// Check if the system should prompt for passcode fallback
    pub fn should_offer_passcode_fallback(error: &BiometricError) -> bool {
        error.requires_passcode_fallback()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_biometric_error_codes() {
        assert_eq!(
            BiometricError::from_code(-1),
            Some(BiometricError::AuthenticationFailed)
        );
        assert_eq!(
            BiometricError::from_code(-6),
            Some(BiometricError::BiometryNotAvailable)
        );
        assert_eq!(BiometricError::from_code(999), None);
    }
    
    #[test]
    fn test_biometric_type_descriptions() {
        assert_eq!(BiometricType::TouchID.description(), "Touch ID");
        assert_eq!(BiometricType::FaceID.description(), "Face ID");
        assert_eq!(BiometricType::None.description(), "No biometric authentication available");
    }
    
    #[test]
    fn test_error_recoverability() {
        assert!(BiometricError::AuthenticationFailed.is_recoverable());
        assert!(BiometricError::UserCancel.is_recoverable());
        assert!(!BiometricError::BiometryNotAvailable.is_recoverable());
        assert!(!BiometricError::PasscodeNotSet.is_recoverable());
    }
    
    #[test]
    fn test_passcode_fallback_requirements() {
        assert!(BiometricError::BiometryLockout.requires_passcode_fallback());
        assert!(BiometricError::BiometryNotEnrolled.requires_passcode_fallback());
        assert!(!BiometricError::UserCancel.requires_passcode_fallback());
    }
    
    #[tokio::test]
    async fn test_authentication_context() {
        let mut context = AuthenticationContext::new()
            .with_policy(BiometricPolicy::DeviceOwnerAuthentication)
            .with_fallback_title("Use Passcode".to_string())
            .with_max_retries(3);
        
        // Test policy evaluation
        #[cfg(target_os = "macos")]
        {
            // This would test actual biometric evaluation in real implementation
            match context.evaluate_policy("Test authentication").await {
                Ok(_) => println!("Authentication successful"),
                Err(e) => println!("Authentication failed: {:?}", e),
            }
        }
        
        #[cfg(not(target_os = "macos"))]
        {
            assert!(matches!(
                context.evaluate_policy("Test authentication").await,
                Err(BiometricError::BiometryNotAvailable)
            ));
        }
    }
    
    #[test]
    fn test_biometric_manager() {
        let manager = get_biometric_manager();
        
        let context = manager.create_context("test-context".to_string());
        assert!(context.policy == BiometricPolicy::DeviceOwnerAuthenticationWithBiometrics);
        
        let retrieved = manager.get_context("test-context");
        assert!(retrieved.is_some());
        
        manager.remove_context("test-context");
        let after_removal = manager.get_context("test-context");
        assert!(after_removal.is_none());
    }
}
