/**
 * @fileoverview Platform-specific mocks for testing
 * 
 * Provides mock implementations for platform-specific functionality
 * to enable comprehensive testing in different environments.
 */

import type { SecureStorage, StorageResult } from '../../packages/wallet/src/platform/storage/secure-storage.js';
import type { PlatformInfo } from '../../packages/wallet/src/platform/detector.js';
import type { CapabilityAssessment } from '../../packages/wallet/src/platform/capabilities.js';

/**
 * Mock platform detector for testing different platform scenarios
 */
export class MockPlatformDetector {
  private static mockPlatform: PlatformInfo | null = null;
  
  static setMockPlatform(platform: Partial<PlatformInfo>): void {
    this.mockPlatform = {
      os: 'linux',
      arch: 'x64',
      isElectron: false,
      isNode: true,
      isContainer: false,
      version: '1.0.0',
      ...platform,
    };
  }
  
  static clearMock(): void {
    this.mockPlatform = null;
  }
  
  static detect(): PlatformInfo {
    if (this.mockPlatform) {
      return this.mockPlatform;
    }
    
    // Fallback to actual detection
    return {
      os: process.platform as any,
      arch: process.arch as any,
      isElectron: typeof window !== 'undefined' && 'electron' in window,
      isNode: typeof process !== 'undefined' && process.versions?.node !== undefined,
      isContainer: !!process.env.DOCKER || !!process.env.KUBERNETES_SERVICE_HOST,
      version: process.version,
    };
  }
}

/**
 * Mock secure storage implementation for testing
 */
export class MockSecureStorage implements SecureStorage {
  private storage = new Map<string, Buffer>();
  private metadata = new Map<string, any>();
  private shouldFail = false;
  private failureMessage = 'Mock storage failure';
  private latency = 0;
  
  constructor(private config: { 
    shouldFail?: boolean; 
    failureMessage?: string;
    latency?: number;
  } = {}) {
    this.shouldFail = config.shouldFail || false;
    this.failureMessage = config.failureMessage || 'Mock storage failure';
    this.latency = config.latency || 0;
  }
  
  private async simulateLatency(): Promise<void> {
    if (this.latency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latency));
    }
  }
  
  private createResult<T>(success: boolean, data?: T, error?: string): StorageResult<T> {
    return {
      success,
      data,
      error,
    };
  }
  
  async store(key: string, value: Buffer, options?: any): Promise<StorageResult> {
    await this.simulateLatency();
    
    if (this.shouldFail) {
      return this.createResult(false, undefined, this.failureMessage);
    }
    
    if (!key || !value) {
      return this.createResult(false, undefined, 'Invalid key or value');
    }
    
    this.storage.set(key, Buffer.from(value));
    this.metadata.set(key, {
      created: Date.now(),
      modified: Date.now(),
      size: value.length,
      ...options,
    });
    
    return this.createResult(true);
  }
  
  async retrieve(key: string, options?: any): Promise<StorageResult<Buffer>> {
    await this.simulateLatency();
    
    if (this.shouldFail) {
      return this.createResult(false, undefined, this.failureMessage);
    }
    
    if (!key) {
      return this.createResult(false, undefined, 'Invalid key');
    }
    
    const value = this.storage.get(key);
    if (!value) {
      return this.createResult(false, undefined, 'Key not found');
    }
    
    return this.createResult(true, Buffer.from(value));
  }
  
  async remove(key: string): Promise<StorageResult> {
    await this.simulateLatency();
    
    if (this.shouldFail) {
      return this.createResult(false, undefined, this.failureMessage);
    }
    
    if (!key) {
      return this.createResult(false, undefined, 'Invalid key');
    }
    
    const existed = this.storage.has(key);
    this.storage.delete(key);
    this.metadata.delete(key);
    
    return this.createResult(true);
  }
  
  async exists(key: string): Promise<StorageResult<boolean>> {
    await this.simulateLatency();
    
    if (this.shouldFail) {
      return this.createResult(false, undefined, this.failureMessage);
    }
    
    if (!key) {
      return this.createResult(false, undefined, 'Invalid key');
    }
    
    const exists = this.storage.has(key);
    return this.createResult(true, exists);
  }
  
  async list(): Promise<StorageResult<string[]>> {
    await this.simulateLatency();
    
    if (this.shouldFail) {
      return this.createResult(false, undefined, this.failureMessage);
    }
    
    const keys = Array.from(this.storage.keys());
    return this.createResult(true, keys);
  }
  
  async getMetadata(key: string): Promise<StorageResult<any>> {
    await this.simulateLatency();
    
    if (this.shouldFail) {
      return this.createResult(false, undefined, this.failureMessage);
    }
    
    if (!key) {
      return this.createResult(false, undefined, 'Invalid key');
    }
    
    const metadata = this.metadata.get(key);
    if (!metadata) {
      return this.createResult(false, undefined, 'Key not found');
    }
    
    return this.createResult(true, metadata);
  }
  
  async clear(): Promise<StorageResult> {
    await this.simulateLatency();
    
    if (this.shouldFail) {
      return this.createResult(false, undefined, this.failureMessage);
    }
    
    this.storage.clear();
    this.metadata.clear();
    return this.createResult(true);
  }
  
  async getInfo(): Promise<StorageResult<any>> {
    await this.simulateLatency();
    
    if (this.shouldFail) {
      return this.createResult(false, undefined, this.failureMessage);
    }
    
    return this.createResult(true, {
      type: 'mock',
      size: this.storage.size,
      totalSize: Array.from(this.storage.values()).reduce((acc, buf) => acc + buf.length, 0),
      available: !this.shouldFail,
    });
  }
  
  async test(): Promise<StorageResult> {
    await this.simulateLatency();
    
    if (this.shouldFail) {
      return this.createResult(false, undefined, this.failureMessage);
    }
    
    // Test basic functionality
    const testKey = `test-${Date.now()}`;
    const testData = Buffer.from('test-data');
    
    const storeResult = await this.store(testKey, testData);
    if (!storeResult.success) {
      return storeResult;
    }
    
    const retrieveResult = await this.retrieve(testKey);
    if (!retrieveResult.success) {
      return retrieveResult;
    }
    
    if (!retrieveResult.data?.equals(testData)) {
      return this.createResult(false, undefined, 'Test data mismatch');
    }
    
    await this.remove(testKey);
    return this.createResult(true);
  }
  
  // Mock-specific methods for testing
  setFailure(shouldFail: boolean, message?: string): void {
    this.shouldFail = shouldFail;
    if (message) {
      this.failureMessage = message;
    }
  }
  
  setLatency(latency: number): void {
    this.latency = latency;
  }
  
  getStorageState(): { keys: string[]; sizes: number[] } {
    return {
      keys: Array.from(this.storage.keys()),
      sizes: Array.from(this.storage.values()).map(buf => buf.length),
    };
  }
}

/**
 * Mock capabilities manager for testing different capability scenarios
 */
export class MockCapabilitiesManager {
  private static mockCapabilities: CapabilityAssessment | null = null;
  
  static setMockCapabilities(capabilities: Partial<CapabilityAssessment>): void {
    this.mockCapabilities = {
      secureStorage: {
        available: true,
        backends: ['memory', 'encrypted-file'],
        preferredBackend: 'memory',
      },
      fileSystem: {
        available: true,
        writable: true,
        persistent: true,
      },
      network: {
        available: true,
        httpSupported: true,
        httpsSupported: true,
      },
      crypto: {
        available: true,
        hardwareSupported: false,
        algorithms: ['AES-256-GCM', 'AES-256-CBC', 'ChaCha20-Poly1305'],
      },
      notifications: {
        available: false,
        types: [],
      },
      ...capabilities,
    };
  }
  
  static clearMock(): void {
    this.mockCapabilities = null;
  }
  
  getCapabilityAssessment(): CapabilityAssessment {
    if (MockCapabilitiesManager.mockCapabilities) {
      return MockCapabilitiesManager.mockCapabilities;
    }
    
    // Fallback to default capabilities
    return {
      secureStorage: {
        available: true,
        backends: ['memory'],
        preferredBackend: 'memory',
      },
      fileSystem: {
        available: true,
        writable: true,
        persistent: true,
      },
      network: {
        available: true,
        httpSupported: true,
        httpsSupported: true,
      },
      crypto: {
        available: true,
        hardwareSupported: false,
        algorithms: ['AES-256-GCM'],
      },
      notifications: {
        available: false,
        types: [],
      },
    };
  }
  
  async initialize(): Promise<void> {
    // Mock initialization
  }
}

/**
 * Mock storage factory for testing
 */
export class MockStorageFactory {
  private static mockBackends: Map<string, () => SecureStorage> = new Map();
  
  static registerMockBackend(type: string, factory: () => SecureStorage): void {
    this.mockBackends.set(type, factory);
  }
  
  static clearMockBackends(): void {
    this.mockBackends.clear();
  }
  
  static async create(config: any = {}): Promise<SecureStorage> {
    const backendType = config.forceBackend || 'mock';
    
    if (this.mockBackends.has(backendType)) {
      const factory = this.mockBackends.get(backendType)!;
      return factory();
    }
    
    // Default mock storage
    return new MockSecureStorage({
      shouldFail: config.shouldFail || false,
      latency: config.latency || 0,
    });
  }
}

/**
 * Platform-specific mock scenarios
 */
export const MOCK_SCENARIOS = {
  macOS: {
    platform: {
      os: 'darwin' as const,
      arch: 'x64' as const,
      isElectron: false,
      isNode: true,
      isContainer: false,
      version: '20.0.0',
    },
    capabilities: {
      secureStorage: {
        available: true,
        backends: ['keychain', 'encrypted-file', 'memory'],
        preferredBackend: 'keychain',
      },
      crypto: {
        available: true,
        hardwareSupported: true, // Secure Enclave
        algorithms: ['AES-256-GCM', 'AES-256-CBC', 'ChaCha20-Poly1305'],
      },
    },
  },
  
  Windows: {
    platform: {
      os: 'win32' as const,
      arch: 'x64' as const,
      isElectron: false,
      isNode: true,
      isContainer: false,
      version: '20.0.0',
    },
    capabilities: {
      secureStorage: {
        available: true,
        backends: ['credential-store', 'encrypted-file', 'memory'],
        preferredBackend: 'credential-store',
      },
      crypto: {
        available: true,
        hardwareSupported: true, // TPM
        algorithms: ['AES-256-GCM', 'AES-256-CBC'],
      },
    },
  },
  
  LinuxDesktop: {
    platform: {
      os: 'linux' as const,
      arch: 'x64' as const,
      isElectron: false,
      isNode: true,
      isContainer: false,
      version: '20.0.0',
    },
    capabilities: {
      secureStorage: {
        available: true,
        backends: ['secret-service', 'encrypted-file', 'memory'],
        preferredBackend: 'secret-service',
      },
      crypto: {
        available: true,
        hardwareSupported: false,
        algorithms: ['AES-256-GCM', 'AES-256-CBC', 'ChaCha20-Poly1305'],
      },
    },
  },
  
  LinuxHeadless: {
    platform: {
      os: 'linux' as const,
      arch: 'x64' as const,
      isElectron: false,
      isNode: true,
      isContainer: true,
      version: '20.0.0',
    },
    capabilities: {
      secureStorage: {
        available: true,
        backends: ['encrypted-file', 'memory'],
        preferredBackend: 'encrypted-file',
      },
      crypto: {
        available: true,
        hardwareSupported: false,
        algorithms: ['AES-256-GCM', 'AES-256-CBC'],
      },
    },
  },
  
  ElectronApp: {
    platform: {
      os: 'darwin' as const,
      arch: 'x64' as const,
      isElectron: true,
      isNode: true,
      isContainer: false,
      version: '20.0.0',
    },
    capabilities: {
      secureStorage: {
        available: true,
        backends: ['keychain', 'encrypted-file', 'memory'],
        preferredBackend: 'keychain',
      },
      crypto: {
        available: true,
        hardwareSupported: true,
        algorithms: ['AES-256-GCM', 'AES-256-CBC', 'ChaCha20-Poly1305'],
      },
    },
  },
};

/**
 * Test utilities for setting up mock environments
 */
export class MockEnvironment {
  private static originalPlatform: typeof process.platform;
  private static originalEnv: typeof process.env;
  
  static setupScenario(scenarioName: keyof typeof MOCK_SCENARIOS): void {
    const scenario = MOCK_SCENARIOS[scenarioName];
    
    // Set up platform mock
    MockPlatformDetector.setMockPlatform(scenario.platform);
    
    // Set up capabilities mock
    MockCapabilitiesManager.setMockCapabilities(scenario.capabilities);
    
    // Set up environment variables if needed
    if (scenarioName === 'LinuxHeadless') {
      delete process.env.DISPLAY;
      delete process.env.WAYLAND_DISPLAY;
      process.env.DOCKER = 'true';
    }
  }
  
  static teardown(): void {
    MockPlatformDetector.clearMock();
    MockCapabilitiesManager.clearMock();
    MockStorageFactory.clearMockBackends();
    
    // Restore environment
    if (this.originalEnv) {
      process.env = this.originalEnv;
    }
  }
  
  static createFailingStorage(errorMessage: string = 'Mock failure'): MockSecureStorage {
    return new MockSecureStorage({
      shouldFail: true,
      failureMessage: errorMessage,
    });
  }
  
  static createSlowStorage(latency: number = 1000): MockSecureStorage {
    return new MockSecureStorage({
      latency,
    });
  }
  
  static createLimitedStorage(maxSize: number = 1024): MockSecureStorage {
    const storage = new MockSecureStorage();
    
    // Override store method to enforce size limit
    const originalStore = storage.store.bind(storage);
    storage.store = async (key: string, value: Buffer, options?: any) => {
      if (value.length > maxSize) {
        return {
          success: false,
          error: `Data size (${value.length}) exceeds limit (${maxSize})`,
        };
      }
      return originalStore(key, value, options);
    };
    
    return storage;
  }
}

/**
 * Mock network conditions for testing
 */
export class MockNetworkConditions {
  static simulateOffline(): void {
    MockCapabilitiesManager.setMockCapabilities({
      network: {
        available: false,
        httpSupported: false,
        httpsSupported: false,
      },
    });
  }
  
  static simulateSlowNetwork(): void {
    MockCapabilitiesManager.setMockCapabilities({
      network: {
        available: true,
        httpSupported: true,
        httpsSupported: true,
      },
    });
    
    // This would integrate with actual storage backends to simulate latency
  }
  
  static simulateUnstableNetwork(): void {
    // Simulate intermittent failures
    let failureRate = 0.3; // 30% failure rate
    
    MockStorageFactory.registerMockBackend('unstable', () => {
      const shouldFail = Math.random() < failureRate;
      return new MockSecureStorage({
        shouldFail,
        failureMessage: 'Network instability',
      });
    });
  }
}
