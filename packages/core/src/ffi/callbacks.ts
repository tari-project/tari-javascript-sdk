/**
 * @fileoverview FFI callback bindings for wallet events
 * 
 * This module provides TypeScript bindings for the native callback
 * system, enabling JavaScript to receive events from the Rust wallet.
 */

import { getFFIBindings } from './bindings';
import type { WalletHandle } from './types';

/**
 * Raw event payload from native FFI
 */
export interface FFIEventPayload {
  event_type: string;
  wallet_handle: WalletHandle;
  data: unknown;
  timestamp: number;
}

/**
 * Event callback function type for native events
 */
export type FFIEventCallback = (payload: string) => void;

/**
 * Callback statistics from native layer
 */
export interface CallbackStats {
  registeredWallets: number;
  activeCallbacks: number;
}

/**
 * Register an event callback for a wallet handle
 * 
 * @param walletHandle - The wallet handle to register callback for
 * @param callback - JavaScript function to call when events occur
 * @throws {Error} If callback registration fails
 */
export async function setWalletEventCallback(
  walletHandle: WalletHandle,
  callback: FFIEventCallback
): Promise<void> {
  const ffi = await getFFIBindings();
  
  try {
    await ffi.walletSetEventCallback(walletHandle, callback);
  } catch (error) {
    throw new Error(
      `Failed to register event callback for wallet ${walletHandle}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Remove event callback for a wallet handle
 * 
 * @param walletHandle - The wallet handle to remove callback for
 * @throws {Error} If callback removal fails
 */
export async function removeWalletEventCallback(
  walletHandle: WalletHandle
): Promise<void> {
  const ffi = await getFFIBindings();
  
  try {
    await ffi.walletRemoveEventCallback(walletHandle);
  } catch (error) {
    throw new Error(
      `Failed to remove event callback for wallet ${walletHandle}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Get callback statistics from native layer
 * 
 * @returns Statistics about registered callbacks
 * @throws {Error} If stats retrieval fails
 */
export async function getCallbackStats(): Promise<CallbackStats> {
  const ffi = await getFFIBindings();
  
  try {
    const stats = await ffi.getCallbackStats();
    return {
      registeredWallets: stats.registeredWallets,
      activeCallbacks: stats.activeCallbacks
    };
  } catch (error) {
    throw new Error(
      `Failed to get callback statistics: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Cleanup all callbacks (for testing and shutdown)
 * 
 * @throws {Error} If cleanup fails
 */
export async function cleanupAllCallbacks(): Promise<void> {
  const ffi = await getFFIBindings();
  
  try {
    await ffi.cleanupAllCallbacks();
  } catch (error) {
    throw new Error(
      `Failed to cleanup callbacks: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Parse FFI event payload from JSON string
 * 
 * @param payloadJson - JSON string from native callback
 * @returns Parsed event payload
 * @throws {Error} If JSON parsing fails
 */
export function parseFFIEventPayload(payloadJson: string): FFIEventPayload {
  try {
    const payload = JSON.parse(payloadJson) as FFIEventPayload;
    
    // Validate required fields
    if (!payload.event_type || typeof payload.event_type !== 'string') {
      throw new Error('Invalid event_type in payload');
    }
    
    if (!payload.wallet_handle || typeof payload.wallet_handle !== 'number') {
      throw new Error('Invalid wallet_handle in payload');
    }
    
    if (!payload.timestamp || typeof payload.timestamp !== 'number') {
      throw new Error('Invalid timestamp in payload');
    }
    
    return payload;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse event payload JSON: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Validate event callback function
 * 
 * @param callback - Function to validate
 * @throws {Error} If callback is invalid
 */
export function validateEventCallback(callback: unknown): asserts callback is FFIEventCallback {
  if (typeof callback !== 'function') {
    throw new Error('Event callback must be a function');
  }
  
  if (callback.length < 1) {
    throw new Error('Event callback must accept at least one parameter');
  }
}

/**
 * Create a safe event callback wrapper with error handling
 * 
 * @param callback - Original callback function
 * @param errorHandler - Optional error handler
 * @returns Wrapped callback with error handling
 */
export function createSafeEventCallback(
  callback: FFIEventCallback,
  errorHandler?: (error: Error, payload?: string) => void
): FFIEventCallback {
  return (payload: string) => {
    try {
      callback(payload);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      if (errorHandler) {
        try {
          errorHandler(err, payload);
        } catch (handlerError) {
          console.error('Error in callback error handler:', handlerError);
        }
      } else {
        console.error('Error in event callback:', err);
      }
    }
  };
}

/**
 * Test utilities for callback functionality
 */
export const testUtils = {
  /**
   * Create a mock event payload for testing
   */
  createMockEventPayload(
    eventType: string,
    walletHandle: WalletHandle,
    data: unknown = {}
  ): FFIEventPayload {
    return {
      event_type: eventType,
      wallet_handle: walletHandle,
      data,
      timestamp: Date.now()
    };
  },

  /**
   * Create a mock callback for testing
   */
  createMockCallback(): {
    callback: FFIEventCallback;
    calls: string[];
    reset: () => void;
  } {
    const calls: string[] = [];
    
    return {
      callback: (payload: string) => {
        calls.push(payload);
      },
      calls,
      reset: () => {
        calls.length = 0;
      }
    };
  }
};
