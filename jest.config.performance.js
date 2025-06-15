/** @type {import('jest').Config} */
module.exports = {
  displayName: 'Performance Tests',
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Root directory
  rootDir: '.',
  
  // Test files - only performance benchmarks
  testMatch: [
    '<rootDir>/tests/performance/**/*.test.ts',
    '<rootDir>/packages/*/src/**/*performance*.test.ts',
    '<rootDir>/packages/*/src/**/*benchmark*.test.ts',
  ],
  
  // No coverage for performance tests
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
  
  // Module resolution (real FFI but controlled environment)
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Package mappings
    '^@tari-project/tarijs-core$': '<rootDir>/packages/core/src/index.ts',
    '^@tari-project/tarijs-wallet$': '<rootDir>/packages/wallet/src/index.ts',
    '^@tari-project/tarijs-build$': '<rootDir>/packages/build/src/index.ts',
  },
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
    '<rootDir>/tests/performance/performance-setup.ts'
  ],
  
  // Performance test timeout (extended for benchmarks)
  testTimeout: 600000, // 10 minutes
  
  // Performance settings
  verbose: true,
  errorOnDeprecated: true,
  
  // Cache
  cacheDirectory: '<rootDir>/node_modules/.cache/jest-performance',
  
  // Run performance tests serially to avoid interference
  maxWorkers: 1,
  
  // Force garbage collection between tests
  forceExit: true,
  
  // Performance test environment variables
  testEnvironmentOptions: {
    env: {
      JEST_PERFORMANCE_MODE: 'true',
      NODE_ENV: 'performance',
      // Memory and performance monitoring
      NODE_OPTIONS: '--expose-gc --max-old-space-size=4096',
    },
  },
  
  // Custom reporters for performance metrics
  reporters: [
    'default',
    ['<rootDir>/tests/performance/benchmark-reporter.js', { 
      outputFile: './benchmark-results.json',
      enableTrends: true,
      enableMemoryTracking: true 
    }]
  ],
  
  // Global setup for performance monitoring
  globalSetup: '<rootDir>/tests/performance/global-setup.ts',
  globalTeardown: '<rootDir>/tests/performance/global-teardown.ts',
};
