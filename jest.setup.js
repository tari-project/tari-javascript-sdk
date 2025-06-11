/**
 * Jest setup file for global test configuration
 */

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
