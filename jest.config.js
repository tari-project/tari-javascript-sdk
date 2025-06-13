/** @type {import('jest').Config} */
module.exports = {
  // Use TypeScript preset
  preset: 'ts-jest',
  
  // Test environment
  testEnvironment: 'node',
  
  // Root directory
  rootDir: '.',
  
  // Projects for workspace packages
  projects: [
    '<rootDir>/packages/core',
    '<rootDir>/packages/wallet',
    '<rootDir>/packages/build',
  ],
  
  // Global settings
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/src/**/*.test.ts',
    '!packages/*/src/**/*.spec.ts',
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  
  // Coverage directory
  coverageDirectory: '<rootDir>/coverage',
  
  // Coverage providers
  coverageProvider: 'v8',
  
  // Test match patterns
  testMatch: [
    '<rootDir>/packages/*/src/**/*.test.ts',
    '<rootDir>/packages/*/src/**/*.spec.ts',
    '<rootDir>/packages/*/tests/**/*.test.ts',
    '<rootDir>/packages/*/tests/**/*.spec.ts',
  ],
  
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

  // Transform ignore patterns
  transformIgnorePatterns: [
  'node_modules/(?!(.*\\.node$))',
  ],

  // Module resolution
  moduleNameMapper: {
    // Handle .js extensions in TypeScript imports
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Mock native modules for unit tests
    '\\.node$': '<rootDir>/tests/mocks/native-module.js',
    // Package mappings
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
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  
  // Verbose output
  verbose: true,
  
  // Error handling
  errorOnDeprecated: true,
  
  // Cache directory
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',
};
