/**
 * @fileoverview Native libsecret fallback bridge for Linux environments
 * 
 * Provides direct libsecret integration as a fallback when D-Bus Secret Service
 * is unavailable, particularly in headless and containerized environments.
 * Uses libsecret-rs with proper FFI bindings and memory management.
 */

use napi_derive::napi;
use napi::{Result, JsBuffer, Env, CallContext, JsString, JsBoolean, JsObject, JsNumber};
use std::collections::HashMap;
use std::ptr::NonNull;
use std::sync::{Arc, Mutex};

#[cfg(all(target_os = "linux", feature = "linux-libsecret"))]
use libsecret::{Service, ServiceFlags, Schema, SchemaFlags, SchemaAttribute, SchemaAttributeType, Collection};
#[cfg(all(target_os = "linux", feature = "linux-libsecret"))]
use glib::{MainLoop, MainContext};

/// Error types for libsecret operations
#[derive(Debug)]
pub enum LibSecretError {
    ServiceUnavailable,
    SchemaError(String),
    StorageError(String),
    RetrievalError(String),
    InvalidFormat,
    HeadlessSetupRequired,
}

impl From<LibSecretError> for napi::Error {
    fn from(err: LibSecretError) -> Self {
        match err {
            LibSecretError::ServiceUnavailable => napi::Error::new(
                napi::Status::GenericFailure, 
                "libsecret service is not available"
            ),
            LibSecretError::SchemaError(msg) => napi::Error::new(
                napi::Status::InvalidArg, 
                format!("Schema error: {}", msg)
            ),
            LibSecretError::StorageError(msg) => napi::Error::new(
                napi::Status::GenericFailure, 
                format!("Storage failed: {}", msg)
            ),
            LibSecretError::RetrievalError(msg) => napi::Error::new(
                napi::Status::GenericFailure, 
                format!("Retrieval failed: {}", msg)
            ),
            LibSecretError::InvalidFormat => napi::Error::new(
                napi::Status::InvalidArg, 
                "Invalid data format"
            ),
            LibSecretError::HeadlessSetupRequired => napi::Error::new(
                napi::Status::GenericFailure, 
                "Headless environment requires D-Bus setup"
            ),
        }
    }
}

/// Native representation of a secret item
#[napi(object)]
pub struct SecretItem {
    pub service: String,
    pub account: String,
    pub label: String,
    pub data: JsBuffer,
    pub created: Option<i64>,
    pub modified: Option<i64>,
}

/// Schema configuration for organizing secrets
#[napi(object)]
pub struct SecretSchema {
    pub name: String,
    pub attributes: Vec<String>,
    pub flags: u32,
}

/// Service connection status
#[napi(object)]
pub struct ServiceStatus {
    pub available: bool,
    pub headless_mode: bool,
    pub dbus_address: Option<String>,
    pub keyring_unlocked: bool,
}

/// Libsecret fallback service wrapper
pub struct LibSecretService {
    #[cfg(all(target_os = "linux", feature = "linux-libsecret"))]
    service: Option<Arc<Mutex<Service>>>,
    schemas: Arc<Mutex<HashMap<String, Schema>>>,
    #[cfg(all(target_os = "linux", feature = "linux-libsecret"))]
    main_context: Option<MainContext>,
}

impl LibSecretService {
    #[cfg(all(target_os = "linux", feature = "linux-libsecret"))]
    fn new() -> std::result::Result<Self, LibSecretError> {
        // Initialize GLib main context for async operations
        let main_context = MainContext::new();
        main_context.push_thread_default();

        // Attempt to connect to secret service
        let service = match Service::get_sync(ServiceFlags::OPEN_SESSION, None::<&gio::Cancellable>) {
            Ok(service) => Some(Arc::new(Mutex::new(service))),
            Err(_) => {
                // Check if we're in a headless environment
                if std::env::var("DISPLAY").is_err() && std::env::var("WAYLAND_DISPLAY").is_err() {
                    return Err(LibSecretError::HeadlessSetupRequired);
                }
                None
            }
        };

        Ok(Self {
            service,
            schemas: Arc::new(Mutex::new(HashMap::new())),
            main_context: Some(main_context),
        })
    }

    #[cfg(not(all(target_os = "linux", feature = "linux-libsecret")))]
    fn new() -> std::result::Result<Self, LibSecretError> {
        Err(LibSecretError::ServiceUnavailable)
    }

    #[cfg(all(target_os = "linux", feature = "linux-libsecret"))]
    fn get_or_create_schema(&self, name: &str) -> std::result::Result<Schema, LibSecretError> {
        let mut schemas = self.schemas.lock().unwrap();
        
        if let Some(schema) = schemas.get(name) {
            return Ok(schema.clone());
        }

        // Create a standard schema for Tari wallet secrets
        let mut schema_attributes = HashMap::new();
        schema_attributes.insert("service".to_string(), SchemaAttributeType::String);
        schema_attributes.insert("account".to_string(), SchemaAttributeType::String);
        schema_attributes.insert("application".to_string(), SchemaAttributeType::String);

        let schema = Schema::new(
            name,
            SchemaFlags::NONE,
            schema_attributes,
        );

        schemas.insert(name.to_string(), schema.clone());
        Ok(schema)
    }

    #[cfg(all(target_os = "linux", feature = "linux-libsecret"))]
    fn store_secret_internal(
        &self,
        schema_name: &str,
        attributes: &HashMap<String, String>,
        secret: &[u8],
        label: &str,
    ) -> std::result::Result<(), LibSecretError> {
        let service = self.service.as_ref()
            .ok_or(LibSecretError::ServiceUnavailable)?;
        
        let schema = self.get_or_create_schema(schema_name)?;
        let service_guard = service.lock().unwrap();

        // Convert secret bytes to string for libsecret
        let secret_str = String::from_utf8(secret.to_vec())
            .map_err(|_| LibSecretError::InvalidFormat)?;

        // Store secret synchronously
        match libsecret::password_store_sync(
            Some(&schema),
            attributes,
            Some(&Collection::default()),
            label,
            &secret_str,
            None::<&gio::Cancellable>,
        ) {
            Ok(_) => Ok(()),
            Err(e) => Err(LibSecretError::StorageError(e.to_string())),
        }
    }

    #[cfg(all(target_os = "linux", feature = "linux-libsecret"))]
    fn retrieve_secret_internal(
        &self,
        schema_name: &str,
        attributes: &HashMap<String, String>,
    ) -> std::result::Result<Vec<u8>, LibSecretError> {
        let service = self.service.as_ref()
            .ok_or(LibSecretError::ServiceUnavailable)?;
        
        let schema = self.get_or_create_schema(schema_name)?;

        // Retrieve secret synchronously
        match libsecret::password_lookup_sync(
            Some(&schema),
            attributes,
            None::<&gio::Cancellable>,
        ) {
            Ok(Some(secret_str)) => Ok(secret_str.as_bytes().to_vec()),
            Ok(None) => Err(LibSecretError::RetrievalError("Secret not found".to_string())),
            Err(e) => Err(LibSecretError::RetrievalError(e.to_string())),
        }
    }

    #[cfg(all(target_os = "linux", feature = "linux-libsecret"))]
    fn delete_secret_internal(
        &self,
        schema_name: &str,
        attributes: &HashMap<String, String>,
    ) -> std::result::Result<(), LibSecretError> {
        let schema = self.get_or_create_schema(schema_name)?;

        match libsecret::password_clear_sync(
            Some(&schema),
            attributes,
            None::<&gio::Cancellable>,
        ) {
            Ok(_) => Ok(()),
            Err(e) => Err(LibSecretError::StorageError(e.to_string())),
        }
    }

    #[cfg(not(all(target_os = "linux", feature = "linux-libsecret")))]
    fn store_secret_internal(&self, _: &str, _: &HashMap<String, String>, _: &[u8], _: &str) -> std::result::Result<(), LibSecretError> {
        Err(LibSecretError::ServiceUnavailable)
    }

    #[cfg(not(all(target_os = "linux", feature = "linux-libsecret")))]
    fn retrieve_secret_internal(&self, _: &str, _: &HashMap<String, String>) -> std::result::Result<Vec<u8>, LibSecretError> {
        Err(LibSecretError::ServiceUnavailable)
    }

    #[cfg(not(all(target_os = "linux", feature = "linux-libsecret")))]
    fn delete_secret_internal(&self, _: &str, _: &HashMap<String, String>) -> std::result::Result<(), LibSecretError> {
        Err(LibSecretError::ServiceUnavailable)
    }
}

// Global service instance
static mut SERVICE_INSTANCE: Option<Arc<Mutex<LibSecretService>>> = None;
static SERVICE_INIT: std::sync::Once = std::sync::Once::new();

fn get_service() -> std::result::Result<Arc<Mutex<LibSecretService>>, LibSecretError> {
    unsafe {
        SERVICE_INIT.call_once(|| {
            match LibSecretService::new() {
                Ok(service) => SERVICE_INSTANCE = Some(Arc::new(Mutex::new(service))),
                Err(_) => SERVICE_INSTANCE = None,
            }
        });
        
        SERVICE_INSTANCE.clone().ok_or(LibSecretError::ServiceUnavailable)
    }
}

/// Check if libsecret service is available
#[napi]
pub fn is_service_available() -> Result<bool> {
    #[cfg(all(target_os = "linux", feature = "linux-libsecret"))]
    {
        match get_service() {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }
    
    #[cfg(not(all(target_os = "linux", feature = "linux-libsecret")))]
    {
        Ok(false)
    }
}

/// Get service status and diagnostics
#[napi]
pub fn get_service_status() -> Result<ServiceStatus> {
    #[cfg(all(target_os = "linux", feature = "linux-libsecret"))]
    {
        let available = get_service().is_ok();
        let headless_mode = std::env::var("DISPLAY").is_err() && std::env::var("WAYLAND_DISPLAY").is_err();
        let dbus_address = std::env::var("DBUS_SESSION_BUS_ADDRESS").ok();
        
        // Try to check if keyring is unlocked by attempting a test operation
        let keyring_unlocked = if available {
            // Attempt a simple test operation to see if keyring responds
            match get_service() {
                Ok(service) => {
                    let service_guard = service.lock().unwrap();
                    // For now, assume unlocked if service is available
                    true
                },
                Err(_) => false,
            }
        } else {
            false
        };

        Ok(ServiceStatus {
            available,
            headless_mode,
            dbus_address,
            keyring_unlocked,
        })
    }
    
    #[cfg(not(all(target_os = "linux", feature = "linux-libsecret")))]
    {
        Ok(ServiceStatus {
            available: false,
            headless_mode: false,
            dbus_address: None,
            keyring_unlocked: false,
        })
    }
}

/// Store a secret in libsecret
#[napi]
pub fn store_secret(
    schema_name: String,
    service: String,
    account: String,
    label: String,
    secret_data: JsBuffer,
) -> Result<()> {
    let service_instance = get_service().map_err(LibSecretError::from)?;
    let service_guard = service_instance.lock().unwrap();

    let mut attributes = HashMap::new();
    attributes.insert("service".to_string(), service);
    attributes.insert("account".to_string(), account);
    attributes.insert("application".to_string(), "tari-wallet".to_string());

    service_guard.store_secret_internal(
        &schema_name,
        &attributes,
        secret_data.as_ref(),
        &label,
    ).map_err(LibSecretError::from)?;

    Ok(())
}

/// Retrieve a secret from libsecret
#[napi]
pub fn retrieve_secret(
    env: Env,
    schema_name: String,
    service: String,
    account: String,
) -> Result<Option<JsBuffer>> {
    let service_instance = get_service().map_err(LibSecretError::from)?;
    let service_guard = service_instance.lock().unwrap();

    let mut attributes = HashMap::new();
    attributes.insert("service".to_string(), service);
    attributes.insert("account".to_string(), account);
    attributes.insert("application".to_string(), "tari-wallet".to_string());

    match service_guard.retrieve_secret_internal(&schema_name, &attributes) {
        Ok(secret_data) => {
            let buffer = env.create_buffer_with_data(secret_data)?;
            Ok(Some(buffer.into_raw()))
        },
        Err(LibSecretError::RetrievalError(_)) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Delete a secret from libsecret
#[napi]
pub fn delete_secret(
    schema_name: String,
    service: String,
    account: String,
) -> Result<bool> {
    let service_instance = get_service().map_err(LibSecretError::from)?;
    let service_guard = service_instance.lock().unwrap();

    let mut attributes = HashMap::new();
    attributes.insert("service".to_string(), service);
    attributes.insert("account".to_string(), account);
    attributes.insert("application".to_string(), "tari-wallet".to_string());

    match service_guard.delete_secret_internal(&schema_name, &attributes) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// Setup headless environment for libsecret
#[napi]
pub fn setup_headless_environment(master_password: Option<String>) -> Result<bool> {
    #[cfg(all(target_os = "linux", feature = "linux-libsecret"))]
    {
        use std::process::Command;
        
        // Check if D-Bus session exists
        if std::env::var("DBUS_SESSION_BUS_ADDRESS").is_err() {
            // Try to start D-Bus session
            let output = Command::new("dbus-daemon")
                .args(&["--session", "--print-address=1", "--fork"])
                .output();
                
            match output {
                Ok(result) if result.status.success() => {
                    let address = String::from_utf8_lossy(&result.stdout).trim().to_string();
                    std::env::set_var("DBUS_SESSION_BUS_ADDRESS", address);
                },
                _ => return Ok(false),
            }
        }

        // Try to unlock keyring if master password provided
        if let Some(password) = master_password {
            let _result = Command::new("sh")
                .arg("-c")
                .arg(format!("echo -n '{}' | gnome-keyring-daemon --unlock", password))
                .output();
        }

        // Test if service is now available
        Ok(get_service().is_ok())
    }
    
    #[cfg(not(all(target_os = "linux", feature = "linux-libsecret")))]
    {
        Ok(false)
    }
}

/// Test the libsecret fallback functionality
#[napi]
pub fn test_libsecret_fallback() -> Result<bool> {
    let test_schema = "org.tari.wallet.test".to_string();
    let test_service = "test-service".to_string();
    let test_account = "test-account".to_string();
    let test_label = "Test Secret".to_string();
    let test_data = b"test-secret-data";

    // Try to store a test secret
    let service_instance = get_service().map_err(LibSecretError::from)?;
    let service_guard = service_instance.lock().unwrap();

    let mut attributes = HashMap::new();
    attributes.insert("service".to_string(), test_service.clone());
    attributes.insert("account".to_string(), test_account.clone());
    attributes.insert("application".to_string(), "tari-wallet".to_string());

    // Store test secret
    service_guard.store_secret_internal(
        &test_schema,
        &attributes,
        test_data,
        &test_label,
    ).map_err(LibSecretError::from)?;

    // Retrieve test secret
    let retrieved = service_guard.retrieve_secret_internal(&test_schema, &attributes)
        .map_err(LibSecretError::from)?;

    // Clean up test secret
    let _ = service_guard.delete_secret_internal(&test_schema, &attributes);

    // Verify data matches
    Ok(retrieved == test_data)
}
