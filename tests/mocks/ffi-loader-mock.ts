/**
 * Mock FFI loader for unit tests
 * Prevents loading of real native bindings
 */

import { getMockNativeBindings } from '../../packages/core/src/ffi/__mocks__/native';

/**
 * Mock NativeModuleLoader class
 */
export class NativeModuleLoader {
  private static instance: NativeModuleLoader | null = null;
  private mockModule: any = null;

  private constructor() {
    this.mockModule = getMockNativeBindings();
  }

  static getInstance(): NativeModuleLoader {
    if (!NativeModuleLoader.instance) {
      NativeModuleLoader.instance = new NativeModuleLoader();
    }
    return NativeModuleLoader.instance;
  }

  async loadModule(): Promise<any> {
    // Return mock instead of loading real module
    return this.mockModule;
  }

  getModule(): any {
    return this.mockModule;
  }

  isLoaded(): boolean {
    return true; // Always loaded in tests
  }

  reset(): void {
    this.mockModule = getMockNativeBindings();
  }
}

/**
 * Mock loadNativeModule function
 */
export async function loadNativeModule(): Promise<any> {
  const loader = NativeModuleLoader.getInstance();
  return loader.loadModule();
}

/**
 * Mock getNativeModule function
 */
export function getNativeModule(): any {
  const loader = NativeModuleLoader.getInstance();
  return loader.getModule();
}
