// Build script for tari-wallet-ffi crate
// This handles NAPI-RS code generation and Tari FFI integration

use std::env;
use std::path::PathBuf;

fn main() {
    // NAPI-RS build setup
    napi_build::setup();

    // Re-run if Tari source changes
    println!("cargo:rerun-if-env-changed=TARI_SOURCE_PATH");
    println!("cargo:rerun-if-env-changed=TARI_WALLET_FFI_PATH");
    println!("cargo:rerun-if-env-changed=TARI_VERSION");
    println!("cargo:rerun-if-env-changed=NETWORK_TYPE");

    // Get configuration from environment
    let tari_version = env::var("TARI_VERSION").unwrap_or_else(|_| "4.3.1".to_string());
    let network_type = env::var("NETWORK_TYPE").unwrap_or_else(|_| "mainnet".to_string());
    
    // Resolve Tari source path
    let tari_source = resolve_tari_source_path(&tari_version, &network_type);
    
    let wallet_ffi_path = env::var("TARI_WALLET_FFI_PATH")
        .unwrap_or_else(|_| {
            PathBuf::from(&tari_source)
                .join("base_layer")
                .join("wallet_ffi")
                .to_string_lossy()
                .to_string()
        });

    // Validate Tari source structure
    if PathBuf::from(&wallet_ffi_path).exists() {
        println!("cargo:rustc-env=WALLET_FFI_PATH={}", wallet_ffi_path);
        println!("cargo:warning=Using Tari FFI from: {}", wallet_ffi_path);
        
        // Validate that the wallet FFI directory has the expected structure
        validate_wallet_ffi_structure(&wallet_ffi_path);
    } else {
        println!("cargo:warning=Tari wallet FFI path not found: {}", wallet_ffi_path);
        println!("cargo:warning=Run 'npm run setup:tari-source' to fetch Tari source code");
        
        // In CI or when source is required, this should be an error
        if env::var("CI").is_ok() || env::var("REQUIRE_TARI_SOURCE").is_ok() {
            panic!("Tari source not found and required for build: {}", wallet_ffi_path);
        }
    }

    // Tell cargo about Tari dependency path
    println!("cargo:DEP_TARI_SOURCE={}", tari_source);
    println!("cargo:DEP_WALLET_FFI={}", wallet_ffi_path);

    // Set up features based on network type
    let network_type = env::var("NETWORK_TYPE").unwrap_or_else(|_| "mainnet".to_string());
    
    match network_type.as_str() {
        "testnet" => {
            println!("cargo:rustc-cfg=feature=\"testnet\"");
        },
        "nextnet" => {
            println!("cargo:rustc-cfg=feature=\"nextnet\"");
        },
        "mainnet" | _ => {
            println!("cargo:rustc-cfg=feature=\"mainnet\"");
        }
    }

    // Platform-specific NAPI configuration
    let target = env::var("TARGET").unwrap_or_default();
    
    if target.contains("apple") {
        // macOS: Ensure we link against the correct frameworks
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=Security");
    } else if target.contains("windows") {
        // Windows: Additional system libraries
        println!("cargo:rustc-link-lib=shell32");
        println!("cargo:rustc-link-lib=ole32");
    }

    // Debug vs Release configuration
    let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".to_string());
    
    if profile == "release" {
        // Release optimizations
        println!("cargo:rustc-cfg=feature=\"release\"");
    } else {
        // Debug configuration
        println!("cargo:rustc-cfg=feature=\"debug\"");
    }

    // Output build metadata
    println!("cargo:rustc-env=NAPI_FFI_VERSION=0.0.1");
    println!("cargo:rustc-env=BUILD_PROFILE={}", profile);
    println!("cargo:rustc-env=BUILD_TARGET={}", target);
    
    // Generate build info
    let build_info = format!(
        "tari-wallet-ffi {} built for {} in {} mode",
        env!("CARGO_PKG_VERSION"),
        target,
        profile
    );
    println!("cargo:rustc-env=BUILD_INFO={}", build_info);
}

/// Resolve the Tari source path based on version and network
fn resolve_tari_source_path(version: &str, network: &str) -> String {
    // Check for explicit TARI_SOURCE_PATH first
    if let Ok(path) = env::var("TARI_SOURCE_PATH") {
        println!("cargo:warning=Using explicit TARI_SOURCE_PATH: {}", path);
        return path;
    }

    // Resolve tag based on network
    let tag = match network {
        "mainnet" => format!("v{}", version),
        "testnet" => format!("v{}-pre.0", version), // Default to build 0
        "nextnet" => format!("v{}-rc.0", version),  // Default to build 0
        _ => {
            println!("cargo:warning=Unknown network type: {}, defaulting to mainnet", network);
            format!("v{}", version)
        }
    };

    // Get the project root directory (2 levels up from native/tari-wallet-ffi)
    let project_root = env::var("CARGO_MANIFEST_DIR")
        .map(|dir| PathBuf::from(dir).parent().unwrap().parent().unwrap().to_path_buf())
        .unwrap_or_else(|_| PathBuf::from("../.."));

    // Try to find cached Tari source
    let cache_dir = project_root.join(".tari-cache");
    
    // Check for version-specific cache
    let versioned_path = cache_dir.join(format!("tari-{}", tag));
    if versioned_path.exists() {
        println!("cargo:warning=Found cached Tari source: {}", versioned_path.display());
        return versioned_path.to_string_lossy().to_string();
    }
    
    // Check for generic cache (tari-current)
    let current_path = cache_dir.join("tari-current");
    if current_path.exists() {
        println!("cargo:warning=Using current Tari source: {}", current_path.display());
        return current_path.to_string_lossy().to_string();
    }

    // Fallback to expected cache location 
    println!("cargo:warning=No cached Tari source found, expecting: {}", versioned_path.display());
    versioned_path.to_string_lossy().to_string()
}

/// Validate the wallet FFI directory structure
fn validate_wallet_ffi_structure(wallet_ffi_path: &str) -> bool {
    let base_path = PathBuf::from(wallet_ffi_path);
    
    // Check for essential files
    let essential_files = [
        "Cargo.toml",
        "src/lib.rs",
    ];
    
    let mut missing_files = Vec::new();
    for file in &essential_files {
        let file_path = base_path.join(file);
        if !file_path.exists() {
            missing_files.push(file);
        }
    }
    
    if !missing_files.is_empty() {
        println!("cargo:warning=Missing essential files in wallet FFI: {:?}", missing_files);
        return false;
    }
    
    // Check for src directory structure
    let src_path = base_path.join("src");
    if !src_path.exists() {
        println!("cargo:warning=Missing src directory in wallet FFI");
        return false;
    }
    
    println!("cargo:warning=Wallet FFI structure validation passed");
    true
}
