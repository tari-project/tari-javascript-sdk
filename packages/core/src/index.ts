/**
 * @fileoverview Core FFI bindings and utilities for Tari JavaScript SDK
 * 
 * This module provides the fundamental building blocks for interacting with
 * the Tari wallet through Rust FFI via NAPI-RS. It includes:
 * 
 * - FFI handle management and lifecycle
 * - Memory safety utilities
 * - Type conversions between JavaScript and Rust
 * - Error handling infrastructure
 * - Resource tracking and cleanup
 * 
 * @version 0.0.1
 * @author The Tari Community
 * @license BSD-3-Clause
 */

// Re-export everything from submodules for clean API
export * from './types/index';
export * from './errors/index';
export * from './utils/index';

// FFI resource management (Task 4+)
export * from './ffi/resource';
export * from './ffi/handle';

// Version information
export const VERSION = '0.0.1';
export const SDK_NAME = '@tari-project/tarijs-core';

// FFI integration status
export const FFI_AVAILABLE = true;
