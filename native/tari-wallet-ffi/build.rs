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

    // Get Tari source paths from environment (optional for Phase 3)
    let tari_source = env::var("TARI_SOURCE_PATH")
        .unwrap_or_else(|_| {
            // For Phase 3, use placeholder path
            println!("cargo:warning=TARI_SOURCE_PATH not set, using placeholder");
            "/placeholder/tari/source".to_string()
        });
    
    let wallet_ffi_path = env::var("TARI_WALLET_FFI_PATH")
        .unwrap_or_else(|_| {
            PathBuf::from(&tari_source)
                .join("base_layer")
                .join("wallet_ffi")
                .to_string_lossy()
                .to_string()
        });

    // For Phase 3, skip validation since we're not using actual Tari yet
    if PathBuf::from(&wallet_ffi_path).exists() {
        println!("cargo:rustc-env=WALLET_FFI_PATH={}", wallet_ffi_path);
    } else {
        println!("cargo:warning=Tari wallet FFI path not found: {} (Phase 3 - using placeholder)", wallet_ffi_path);
    }

    // Tell cargo about Tari dependency path
    // This will be used when the actual Tari dependency is uncommented
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
