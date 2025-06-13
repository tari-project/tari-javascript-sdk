/**
 * Tauri storage backend module
 * 
 * Provides secure storage operations via Tauri commands with platform-specific
 * secure storage integration (Keychain, Credential Store, Secret Service).
 */

#[cfg(feature = "tauri-backend")]
pub mod commands;

#[cfg(feature = "tauri-backend")]
pub mod storage;

#[cfg(feature = "tauri-backend")]
pub mod platform;

#[cfg(feature = "tauri-backend")]
pub use commands::*;

#[cfg(feature = "tauri-backend")]
pub use storage::*;

#[cfg(feature = "tauri-backend")]
pub use platform::*;
