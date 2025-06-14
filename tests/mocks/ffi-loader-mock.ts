/**
 * Mock for FFI loader to prevent real binary loading in unit tests
 * This file is referenced by Jest moduleNameMapper configuration
 */

import { getMockNativeBindings } from '../../packages/core/src/ffi/__mocks__/native';

/**
 * Mock loader that returns the mock FFI bindings
 */
export class MockNativeModuleLoader {
  private static instance: MockNativeModuleLoader | null = null;
  private nativeModule: any = null;
  private loaded = false;
  private loading = false;

  private constructor() {
    // Initialize with mock bindings
    this.nativeModule = getMockNativeBindings();
    this.loaded = true;
  }

  public static getInstance(): MockNativeModuleLoader {
    if (!this.instance) {
      this.instance = new MockNativeModuleLoader();
    }
    return this.instance;
  }

  public async loadModule(): Promise<any> {
    if (this.loaded) {
      return this.nativeModule;
    }

    this.loading = true;
    
    try {
      // Use mock bindings
      this.nativeModule = getMockNativeBindings();
      this.loaded = true;
      this.loading = false;
      
      return this.nativeModule;
    } catch (error) {
      this.loading = false;
      throw error;
    }
  }

  public getModule(): any {
    if (!this.loaded) {
      throw new Error('Native module not loaded - call loadModule() first');
    }
    
    return this.nativeModule;
  }

  public isLoaded(): boolean {
    return this.loaded;
  }

  public async reloadModule(): Promise<any> {
    this.loaded = false;
    this.loading = false;
    this.nativeModule = null;
    
    return this.loadModule();
  }

  public reset(): void {
    this.loaded = false;
    this.loading = false;
    this.nativeModule = null;
  }
}

// Export mock classes and functions that match the real loader interface
export const NativeModuleLoader = MockNativeModuleLoader;

export async function loadNativeModule(): Promise<any> {
  const loader = MockNativeModuleLoader.getInstance();
  return loader.loadModule();
}

export function getNativeModule(): any {
  const loader = MockNativeModuleLoader.getInstance();
  return loader.getModule();
}

// Mock binary resolver
export class MockBinaryResolver {
  public resolveBinary() {
    return {
      path: 'mock-native-module',
      exists: true,
      source: 'mock'
    };
  }

  public validateBinary() {
    return; // Always valid for mocks
  }

  public getInstallationInstructions(): string {
    return 'Mock installation instructions - FFI is mocked for testing';
  }
}

export const BinaryResolver = MockBinaryResolver;
