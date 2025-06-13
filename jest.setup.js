/**
 * Jest setup file for global test configuration
 */
const { setupBigIntSerialization } = require('./tests/utils/bigint-serializer');

// Setup BigInt serialization for all tests
setupBigIntSerialization();

// Increase timeout for FFI operations (when implemented)
jest.setTimeout(30000);

// Global test utilities
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
  
  // Helper to create disposable test resources
  createDisposableResource: (type = 'test') => {
    let disposed = false;
    return {
      type,
      dispose: () => { disposed = true; },
      [Symbol.dispose]: () => { disposed = true; },
      isDisposed: () => disposed,
    };
  },
};

// Mock console methods in tests to reduce noise
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Restore console after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Clean up any test resources
afterAll(() => {
  global.console = originalConsole;
});
