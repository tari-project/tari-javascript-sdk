/** @type {import('jest').Config} */
module.exports = {
  displayName: 'Integration Tests',
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Root directory
  rootDir: '.',
  
  // Test files - only integration tests
  testMatch: [
    '<rootDir>/packages/*/src/**/*integration*.test.ts',
    '<rootDir>/packages/*/tests/**/*.test.ts',
    '<rootDir>/tests/integration/**/*.test.ts',
  ],
  
  // Coverage settings (lower for integration)
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/src/**/*.test.ts',
    '!packages/*/src/**/*.spec.ts',
    '!packages/*/src/**/__mocks__/**',
  ],
  
  // Coverage thresholds (lower for integration tests)
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  
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
    '\\.node$': '<rootDir>/scripts/node-transform.js',
  },
  
  // Module resolution (NO mocking for integration tests - use real FFI)
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
  },
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
    '<rootDir>/tests/setup/integration-setup.ts'
  ],
  
  // Test timeout (longer for integration)
  testTimeout: 60000,
  
  // Performance
  verbose: true,
  errorOnDeprecated: true,
  
  // Cache
  cacheDirectory: '<rootDir>/node_modules/.cache/jest-integration',
  
  // Don't clear mocks - let integration tests control state
  clearMocks: false,
  restoreMocks: false,
  
  // Run tests serially for resource management
  maxWorkers: 1,
  
  // Test environment variables
  testEnvironmentOptions: {
    env: {
      JEST_INTEGRATION_MODE: 'true',
      NODE_ENV: 'test',
    },
  },
};
