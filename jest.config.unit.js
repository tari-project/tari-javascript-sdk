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
  
  // Module file extensions - updated for Jest 30
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'mts', 'cts'],
  
  // Transform configuration for Jest 30 and ts-jest 30.x
  transform: {
    '^.+\\.(ts|tsx|mts|cts)$': ['ts-jest', {
      useESM: false,
      tsconfig: {
        target: 'ES2023',
        module: 'CommonJS',
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        strict: true,
        strictNullChecks: true,
        exactOptionalPropertyTypes: true,
        noUncheckedIndexedAccess: true,
      },
    }],
  },
  
  // Module resolution (always use mocks for unit tests)
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Always mock native FFI for unit tests - use the mock in the __mocks__ directory
    '^\\.\\./native$': '<rootDir>/packages/core/src/ffi/__mocks__/native.ts',
    '^../native\\.js$': '<rootDir>/packages/core/src/ffi/__mocks__/native.ts',
    '^mock-native-module$': '<rootDir>/packages/core/src/ffi/__mocks__/native.ts',
    '^@tari-project/tarijs-core/native$': '<rootDir>/packages/core/src/ffi/__mocks__/native.ts',
    '^@tari-project/tarijs-core/ffi/__mocks__/native$': '<rootDir>/packages/core/src/ffi/__mocks__/native.ts',
    // Mock FFI loader to prevent real binary loading in unit tests
    '^@tari-project/tarijs-core/ffi/loader$': '<rootDir>/tests/mocks/ffi-loader-mock.ts',
    '^\\.\\./loader$': '<rootDir>/tests/mocks/ffi-loader-mock.ts',
    '^\\./loader$': '<rootDir>/tests/mocks/ffi-loader-mock.ts',
    // Package mappings
    '^@tari-project/tarijs-core$': '<rootDir>/packages/core/src/index.ts',
    '^@tari-project/tarijs-wallet$': '<rootDir>/packages/wallet/src/index.ts',
    '^@tari-project/tarijs-build$': '<rootDir>/packages/build/src/index.ts',
    // Mock missing polyfill modules  
    '^@tari/core/memory/using-polyfill$': '<rootDir>/packages/core/src/memory/using-polyfill.ts',
    '^@tari/core/memory/disposable$': '<rootDir>/packages/core/src/memory/disposable.ts',
    '^@tari/core/memory/resource-base$': '<rootDir>/packages/core/src/memory/resource-base.ts',
    '^@tari/core/memory/secure-buffer$': '<rootDir>/packages/core/src/memory/secure-buffer.ts',
    '^@tari/core/memory/memory-utils$': '<rootDir>/packages/core/src/memory/memory-utils.ts',
    '^@tari/core/memory/crypto-helpers$': '<rootDir>/packages/core/src/memory/crypto-helpers.ts',
    '^@tari/core/memory/pressure-monitor$': '<rootDir>/packages/core/src/memory/pressure-monitor.ts',
    '^@tari/core/memory/gc-coordinator$': '<rootDir>/packages/core/src/memory/gc-coordinator.ts',
    '^@tari/core/memory/heap-stats$': '<rootDir>/packages/core/src/memory/heap-stats.ts',
    // Additional core memory mappings for inheritance chain fixes
    '^@tari-project/tarijs-core/memory/(.*)$': '<rootDir>/packages/core/src/memory/$1',
    '^@core/memory/(.*)$': '<rootDir>/packages/core/src/memory/$1',
    // Core memory component imports
    '^@tari-project/tarijs-core/MemoryPressureMonitor$': '<rootDir>/packages/core/src/memory/pressure-monitor.ts',
    '^@tari-project/tarijs-core/GCCoordinator$': '<rootDir>/packages/core/src/memory/gc-coordinator.ts',
    '^@tari-project/tarijs-core/HeapStatsCollector$': '<rootDir>/packages/core/src/memory/heap-stats.ts',
    '^@tari-project/tarijs-core/utils/typed-event-emitter$': '<rootDir>/packages/core/src/utils/typed-event-emitter.ts',
    '^@tari/core/performance/call-batcher$': '<rootDir>/packages/core/src/performance/call-batcher.ts',
    '^@tari/core/performance/batch-executor$': '<rootDir>/packages/core/src/performance/batch-executor.ts',
    '^@tari/core/performance/batch-queue$': '<rootDir>/packages/core/src/performance/batch-queue.ts',
  },
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
    '<rootDir>/tests/setup/unit-setup.ts'
  ],
  
  // Test timeout - reduced since mocks should be fast
  testTimeout: 3000,
  
  // Performance
  verbose: false,
  errorOnDeprecated: true,
  
  // Optimize for speed
  maxWorkers: '50%',
  detectOpenHandles: true,
  forceExit: true,
  
  // Cache
  cacheDirectory: '<rootDir>/node_modules/.cache/jest-unit',
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
};
