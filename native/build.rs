// Build script for the secure storage native module
// This sets up platform-specific linking and configuration

use std::env;

fn main() {
    // Tell cargo to rerun if any of these environment variables change
    println!("cargo:rerun-if-env-changed=BUILD_TARGET");
    println!("cargo:rerun-if-env-changed=NETWORK_TYPE");

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
