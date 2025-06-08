// Re-export all types and interfaces
export * from './ffi-types';
export * from './bindings';
export * from './wrapper';

// Export the native loader
export { loadNativeBinding } from './loader';

export const VERSION = '0.0.1';

// Auto-initialize the library
import { loadNativeBinding } from './loader';
import { ffi } from './wrapper';

// Track initialization state
let initialized = false;

/**
 * Initialize the Tari FFI library
 * 
 * This function loads the native binding and initializes the FFI wrapper.
 * It's safe to call multiple times.
 */
export function initialize(): void {
  if (!initialized) {
    loadNativeBinding();
    ffi.initialize();
    initialized = true;
  }
}

/**
 * Check if the library is initialized
 */
export function isInitialized(): boolean {
  return initialized && ffi.isInitialized;
}

// Auto-initialize on import (safe to call multiple times)
initialize();

// Export the wrapper as default export for convenience
export default ffi;

// Named exports for specific functionality
export {
  ffi,
  createDefaultWallet,
  createMainnetWallet,
  createTestnetWallet,
  safeDestroyWallet,
} from './wrapper';

// Legacy export for backwards compatibility
export const core = ffi;
