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
    '^@tari-project/tarijs-core$': '<rootDir>/packages/core/src',
    '^@tari-project/tarijs-wallet$': '<rootDir>/packages/wallet/src',
    '^@tari-project/tarijs-build$': '<rootDir>/packages/build/src',
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
