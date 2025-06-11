/** @type {import('jest').Config} */
module.exports = {
  displayName: '@tari-project/tarijs-wallet',
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Test files
  testMatch: [
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.spec.ts',
  ],
  
  // Coverage
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  
  // TypeScript configuration
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: false,
      tsconfig: './tsconfig.json',
    }],
  },
  
  // Module resolution
  moduleNameMapper: {
    '^@tari-project/tarijs-core$': '<rootDir>/../core/src',
  },
  
  // Setup
  setupFilesAfterEnv: ['<rootDir>/../../jest.setup.js'],
};
