/** @type {import('jest').Config} */
module.exports = {
  displayName: '@tari-project/tarijs-core',
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Test files
  testMatch: [
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.spec.ts',
  ],
  
  // Coverage
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/__mocks__/**',
  ],
  
  // TypeScript configuration
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: false,
      tsconfig: './tsconfig.json',
    }],
  },
  

  
  // Setup
  setupFilesAfterEnv: ['<rootDir>/../../jest.setup.js'],
  
  // Mock configuration for FFI testing
  moduleNameMapper: {
    '^../native\\.js$': '<rootDir>/src/ffi/__mocks__/native.ts',
  },
  
  // Test timeout for FFI operations
  testTimeout: 10000,
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
