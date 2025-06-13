/**
 * Platform-specific Tauri integration helpers
 * 
 * Provides platform detection and optimization recommendations
 * specifically for Tauri runtime environments.
 */

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct TauriPlatformInfo {
    pub os: String,
    pub arch: String,
    pub family: String,
    pub runtime: String,
    pub tauri_version: String,
    pub capabilities: TauriCapabilities,
    pub recommendations: TauriRecommendations,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TauriCapabilities {
    pub secure_storage: bool,
    pub native_storage: bool,
    pub hardware_crypto: bool,
    pub memory_protection: bool,
    pub permission_system: bool,
    pub async_runtime: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TauriRecommendations {
    pub storage_backend: String,
    pub security_level: String,
    pub performance_mode: String,
    pub optimizations: Vec<String>,
}

/// Detect Tauri platform capabilities
pub fn detect_tauri_capabilities() -> TauriCapabilities {
    let secure_storage = cfg!(any(
        target_os = "macos",
        target_os = "windows", 
        target_os = "linux"
    ));
    
    let native_storage = secure_storage;
    
    // Hardware crypto available on most modern platforms
    let hardware_crypto = cfg!(any(
        target_arch = "x86_64",
        target_arch = "aarch64"
    ));
    
    // Tauri provides memory protection by default
    let memory_protection = true;
    
    // Tauri has explicit permission system
    let permission_system = true;
    
    // Tokio async runtime available
    let async_runtime = true;
    
    TauriCapabilities {
        secure_storage,
        native_storage,
        hardware_crypto,
        memory_protection,
        permission_system,
        async_runtime,
    }
}

/// Generate platform-specific recommendations
pub fn generate_tauri_recommendations() -> TauriRecommendations {
    let capabilities = detect_tauri_capabilities();
    
    let storage_backend = if capabilities.native_storage {
        match std::env::consts::OS {
            "macos" => "keychain",
            "windows" => "credential-store", 
            "linux" => "secret-service",
            _ => "encrypted-file",
        }
    } else {
        "encrypted-file"
    }.to_string();
    
    let security_level = if capabilities.hardware_crypto && capabilities.native_storage {
        "hardware-backed"
    } else if capabilities.native_storage {
        "os-level"
    } else {
        "software-encrypted"
    }.to_string();
    
    let performance_mode = if capabilities.hardware_crypto {
        "optimized"
    } else {
        "standard"
    }.to_string();
    
    let mut optimizations = Vec::new();
    
    if capabilities.async_runtime {
        optimizations.push("async-operations".to_string());
    }
    
    if capabilities.hardware_crypto {
        optimizations.push("hardware-acceleration".to_string());
    }
    
    if capabilities.memory_protection {
        optimizations.push("memory-safety".to_string());
    }
    
    // Platform-specific optimizations
    match std::env::consts::OS {
        "macos" => {
            optimizations.push("security-framework-integration".to_string());
            optimizations.push("touch-id-support".to_string());
        },
        "windows" => {
            optimizations.push("dpapi-integration".to_string());
            optimizations.push("credential-manager".to_string());
        },
        "linux" => {
            optimizations.push("dbus-integration".to_string());
            optimizations.push("secret-service".to_string());
        },
        _ => {}
    }
    
    // Architecture-specific optimizations
    match std::env::consts::ARCH {
        "x86_64" => {
            optimizations.push("aes-ni-acceleration".to_string());
            optimizations.push("avx-simd".to_string());
        },
        "aarch64" => {
            optimizations.push("crypto-extensions".to_string());
            optimizations.push("neon-simd".to_string());
        },
        _ => {}
    }
    
    optimizations.push("zero-copy-serialization".to_string());
    optimizations.push("minimal-ipc-overhead".to_string());
    
    TauriRecommendations {
        storage_backend,
        security_level,
        performance_mode,
        optimizations,
    }
}

/// Get complete Tauri platform information
pub fn get_tauri_platform_info() -> TauriPlatformInfo {
    let capabilities = detect_tauri_capabilities();
    let recommendations = generate_tauri_recommendations();
    
    TauriPlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        family: std::env::consts::FAMILY.to_string(),
        runtime: "tauri".to_string(),
        tauri_version: env!("CARGO_PKG_VERSION").to_string(),
        capabilities,
        recommendations,
    }
}

/// Tauri command to get platform information
#[tauri::command]
pub async fn get_tauri_platform_info_command() -> Result<TauriPlatformInfo, String> {
    Ok(get_tauri_platform_info())
}

/// Initialize Tauri platform integration
pub fn initialize_tauri_platform() -> Result<(), String> {
    // Set up platform-specific optimizations
    #[cfg(target_os = "macos")]
    {
        // Initialize Security Framework if needed
        // This would be done automatically by the keychain backend
    }
    
    #[cfg(target_os = "windows")]
    {
        // Initialize Windows security features if needed
        // This would be done automatically by the credential store backend
    }
    
    #[cfg(target_os = "linux")]
    {
        // Initialize D-Bus connection for Secret Service if needed
        // This would be done automatically by the secret service backend
    }
    
    Ok(())
}

/// Platform-specific security recommendations
pub fn get_security_recommendations() -> Vec<String> {
    let mut recommendations = Vec::new();
    
    recommendations.push("Use Tauri's explicit permission allowlist".to_string());
    recommendations.push("Enable CSP (Content Security Policy)".to_string());
    recommendations.push("Implement rate limiting for storage operations".to_string());
    recommendations.push("Use secure serialization for sensitive data".to_string());
    
    match std::env::consts::OS {
        "macos" => {
            recommendations.push("Enable Keychain biometric authentication".to_string());
            recommendations.push("Use App Sandbox for additional isolation".to_string());
        },
        "windows" => {
            recommendations.push("Use DPAPI for additional encryption".to_string());
            recommendations.push("Enable Windows Defender integration".to_string());
        },
        "linux" => {
            recommendations.push("Verify Secret Service daemon availability".to_string());
            recommendations.push("Use encrypted home directory when available".to_string());
        },
        _ => {}
    }
    
    recommendations
}
