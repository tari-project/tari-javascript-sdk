// Build script for the native workspace
// This sets up the environment for compiling Tari wallet FFI

use std::env;
use std::path::PathBuf;

fn main() {
    // Tell cargo to rerun if any of these environment variables change
    println!("cargo:rerun-if-env-changed=TARI_SOURCE_PATH");
    println!("cargo:rerun-if-env-changed=BUILD_TARGET");
    println!("cargo:rerun-if-env-changed=NETWORK_TYPE");

    // Get Tari source path from environment
    let tari_source = env::var("TARI_SOURCE_PATH")
        .unwrap_or_else(|_| {
            // Default to cache directory structure
            let cache_dir = env::var("CARGO_MANIFEST_DIR")
                .map(|dir| PathBuf::from(dir).parent().unwrap().join(".tari-cache"))
                .unwrap_or_else(|_| PathBuf::from(".tari-cache"));
            
            // Try to find the most recent Tari source
            if let Ok(entries) = std::fs::read_dir(&cache_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() && path.file_name()
                        .and_then(|n| n.to_str())
                        .map(|s| s.starts_with("tari-"))
                        .unwrap_or(false)
                    {
                        return path.to_string_lossy().to_string();
                    }
                }
            }
            
            panic!("TARI_SOURCE_PATH not set and no cached Tari source found");
        });

    println!("cargo:rustc-env=TARI_SOURCE_PATH={}", tari_source);

    // Set up include paths for Tari dependencies
    let tari_path = PathBuf::from(&tari_source);
    
    // Verify Tari source structure
    let wallet_ffi_path = tari_path.join("base_layer").join("wallet_ffi");
    if !wallet_ffi_path.exists() {
        panic!(
            "Tari wallet FFI not found at expected path: {}",
            wallet_ffi_path.display()
        );
    }

    println!("cargo:rustc-env=TARI_WALLET_FFI_PATH={}", wallet_ffi_path.display());

    // Platform-specific configuration
    let target = env::var("TARGET").unwrap_or_default();
    
    match target.as_str() {
        t if t.contains("apple") => {
            // macOS specific configuration
            println!("cargo:rustc-link-lib=framework=Security");
            println!("cargo:rustc-link-lib=framework=SystemConfiguration");
        },
        t if t.contains("windows") => {
            // Windows specific configuration
            println!("cargo:rustc-link-lib=ws2_32");
            println!("cargo:rustc-link-lib=userenv");
            println!("cargo:rustc-link-lib=ntdll");
            println!("cargo:rustc-link-lib=iphlpapi");
            println!("cargo:rustc-link-lib=psapi");
            println!("cargo:rustc-link-lib=pdh");
            println!("cargo:rustc-link-lib=powrprof");
        },
        t if t.contains("linux") => {
            // Linux specific configuration
            println!("cargo:rustc-link-lib=ssl");
            println!("cargo:rustc-link-lib=crypto");
            
            // Check for musl
            if t.contains("musl") {
                println!("cargo:rustc-link-lib=static=ssl");
                println!("cargo:rustc-link-lib=static=crypto");
            }
        },
        _ => {
            println!("cargo:warning=Unknown target platform: {}", target);
        }
    }

    // Set network configuration
    let network_type = env::var("NETWORK_TYPE").unwrap_or_else(|_| "mainnet".to_string());
    println!("cargo:rustc-env=NETWORK_TYPE={}", network_type);

    // Output build information
    println!("cargo:rustc-env=BUILD_TIMESTAMP={}", chrono::Utc::now().timestamp());
    println!("cargo:rustc-env=BUILD_TARGET={}", target);
}
