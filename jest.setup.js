/**
 * Jest setup file for global test configuration - updated for Jest 30
 */
const { setupBigIntSerialization } = require('./tests/utils/bigint-serializer');

// Setup BigInt serialization for all tests
setupBigIntSerialization();

// Global test utilities with Jest 30 improvements
global.testUtils = {
  // Helper to create mock wallet config
  createMockConfig: () => ({
    network: 'testnet',
    storagePath: '/tmp/test-wallet',
    logLevel: 'info',
  }),
  
  // Helper to generate random test data
  randomString: (length = 10) => {
    return Math.random().toString(36).substring(2, length + 2);
  },
  
  // Helper to wait for async operations
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Helper to create mock FFI wallet config
  createMockFFIConfig: () => ({
    network: 'testnet',
    storagePath: '/tmp/test-wallet-ffi',
    logPath: '/tmp/test-wallet.log',
    logLevel: 2,
    passphrase: undefined,
    seedWords: undefined,
    numRollingLogFiles: 5,
    rollingLogFileSize: 10485760,
  }),
  
  // Helper to simulate resource leaks for testing
  simulateResourceLeak: () => {
    const resources = [];
    for (let i = 0; i < 100; i++) {
      resources.push({ id: i, data: Buffer.alloc(1024) });
    }
    return resources;
  },
  
  // Helper to force garbage collection in tests
  forceGC: () => {
    if (global.gc) {
      global.gc();
    }
  },
  
  // Helper to create disposable test resources with Jest 30 'using' support
  createDisposableResource: (type = 'test') => {
    let disposed = false;
    const resource = {
      type,
      dispose: () => { disposed = true; },
      [Symbol.dispose]: () => { disposed = true; },
      isDisposed: () => disposed,
    };
    
    // Jest 30 automatic cleanup with 'using' keyword
    return resource;
  },
  
  // Jest 30 spy helper with automatic cleanup using 'using' keyword
  createAutoCleanupSpy: (object, methodName) => {
    const spy = jest.spyOn(object, methodName);
    return {
      spy,
      [Symbol.dispose]: () => spy.mockRestore(),
    };
  },
  
  // Test array validation helper using Jest 30's expect.arrayOf
  expectArrayOf: (expectedItemMatcher) => {
    return expect.arrayOf ? expect.arrayOf(expectedItemMatcher) : expect.any(Array);
  },
};

// Mock console methods in tests to reduce noise
const originalConsole = global.console;

// Jest 30 improved spy management with automatic cleanup
const createConsoleMock = () => {
  const mocks = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
  
  return {
    ...originalConsole,
    ...mocks,
    [Symbol.dispose]: () => {
      Object.values(mocks).forEach(mock => mock.mockRestore());
    },
  };
};

global.console = createConsoleMock();

// Restore console after each test
afterEach(() => {
  jest.clearAllMocks();
  
  // Clean up resource manager instances to prevent test interference
  try {
    const { ResourceManager } = require('./packages/wallet/src/lifecycle/resource-manager');
    if (ResourceManager && typeof ResourceManager.resetInstance === 'function') {
      ResourceManager.resetInstance();
    }
  } catch (error) {
    // Ignore if resource manager not available
  }
  
  // Clean up recovery state manager instances
  try {
    const { resetDefaultRecoveryStateManager } = require('./packages/wallet/src/restore/recovery-state');
    if (typeof resetDefaultRecoveryStateManager === 'function') {
      resetDefaultRecoveryStateManager();
    }
  } catch (error) {
    // Ignore if recovery state manager not available
  }
});

// Clean up any test resources
afterAll(() => {
  global.console = originalConsole;
});
