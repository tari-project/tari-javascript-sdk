/** @type {import('jest').Config} */
module.exports = {
  displayName: 'E2E Tests',
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Root directory
  rootDir: '.',
  
  // Test files - only E2E tests
  testMatch: [
    '<rootDir>/packages/*/src/**/*e2e*.test.ts',
    '<rootDir>/tests/e2e/**/*.test.ts',
  ],
  
  // No coverage for E2E tests (focuses on behavior, not coverage)
  collectCoverage: false,
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Transform configuration
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: false,
      tsconfig: {
        target: 'ES2022',
        module: 'CommonJS',
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
      },
    }],
  },
  
  // Module resolution (NO mocking for E2E tests - everything real)
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Package mappings only
    '^@tari-project/tarijs-core$': '<rootDir>/packages/core/src/index.ts',
    '^@tari-project/tarijs-wallet$': '<rootDir>/packages/wallet/src/index.ts',
    '^@tari-project/tarijs-build$': '<rootDir>/packages/build/src/index.ts',
    // Handle polyfill modules
    '^@tari/core/memory/using-polyfill$': '<rootDir>/packages/core/src/memory/using-polyfill.ts',
    '^@tari/core/memory/disposable$': '<rootDir>/packages/core/src/memory/disposable.ts',
    '^@tari/core/memory/resource-base$': '<rootDir>/packages/core/src/memory/resource-base.ts',
    '^@tari/core/memory/secure-buffer$': '<rootDir>/packages/core/src/memory/secure-buffer.ts',
    '^@tari/core/memory/memory-utils$': '<rootDir>/packages/core/src/memory/memory-utils.ts',
    '^@tari/core/memory/crypto-helpers$': '<rootDir>/packages/core/src/memory/crypto-helpers.ts',
    '^@tari/core/memory/pressure-monitor$': '<rootDir>/packages/core/src/memory/pressure-monitor.ts',
    '^@tari/core/memory/gc-coordinator$': '<rootDir>/packages/core/src/memory/gc-coordinator.ts',
    '^@tari/core/memory/heap-stats$': '<rootDir>/packages/core/src/memory/heap-stats.ts',
  },
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
    '<rootDir>/tests/setup/e2e-setup.ts'
  ],
  
  // Test timeout (very long for E2E)
  testTimeout: 300000, // 5 minutes
  
  // Performance
  verbose: true,
  errorOnDeprecated: true,
  
  // Cache
  cacheDirectory: '<rootDir>/node_modules/.cache/jest-e2e',
  
  // Don't interfere with state
  clearMocks: false,
  restoreMocks: false,
  
  // Run tests serially for network operations
  maxWorkers: 1,
  
  // Test environment variables
  testEnvironmentOptions: {
    env: {
      JEST_E2E_MODE: 'true',
      NODE_ENV: 'test',
      TARI_NETWORK: 'testnet',
    },
  },
  
  // Retry flaky network tests
  retryTimes: 2,
  
  // Skip if no network access
  setupFiles: ['<rootDir>/tests/setup/network-check.ts'],
};
