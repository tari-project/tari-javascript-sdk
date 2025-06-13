/** @type {import('jest').Config} */
module.exports = {
  displayName: 'Unit Tests',
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Root directory
  rootDir: '.',
  
  // Test files - only unit tests
  testMatch: [
    '<rootDir>/packages/*/src/**/*.test.ts',
    '<rootDir>/packages/*/src/**/*.spec.ts',
    '!<rootDir>/packages/*/src/**/*integration*.test.ts',
    '!<rootDir>/packages/*/src/**/*e2e*.test.ts',
  ],
  
  // Coverage settings
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/src/**/*.test.ts',
    '!packages/*/src/**/*.spec.ts',
    '!packages/*/src/**/__mocks__/**',
    '!packages/*/src/**/__tests__/**',
    '!packages/*/src/**/__integration__/**',
    '!packages/*/src/**/__e2e__/**',
    '!packages/*/src/**/__benchmarks__/**',
  ],
  
  // Coverage thresholds (higher for unit tests)
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
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
  
  // Module resolution (always use mocks for unit tests)
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Always mock native FFI for unit tests
    '^../native\\.js$': '<rootDir>/packages/core/src/ffi/__mocks__/native.ts',
    '^@tari-project/tarijs-core/native$': '<rootDir>/packages/core/src/ffi/__mocks__/native.ts',
    // Package mappings
    '^@tari-project/tarijs-core$': '<rootDir>/packages/core/src',
    '^@tari-project/tarijs-wallet$': '<rootDir>/packages/wallet/src',
    '^@tari-project/tarijs-build$': '<rootDir>/packages/build/src',
  },
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
    '<rootDir>/tests/setup/unit-setup.ts'
  ],
  
  // Test timeout
  testTimeout: 10000,
  
  // Performance
  verbose: false,
  errorOnDeprecated: true,
  
  // Cache
  cacheDirectory: '<rootDir>/node_modules/.cache/jest-unit',
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
};
