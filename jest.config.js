module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  projects: [
    {
      displayName: '@tari/core',
      testMatch: ['<rootDir>/packages/@tari/core/**/*.test.ts'],
      moduleNameMapper: {
        '^@tari/core$': '<rootDir>/packages/@tari/core/src',
      },
    },
    {
      displayName: '@tari/wallet',
      testMatch: ['<rootDir>/packages/@tari/wallet/**/*.test.ts'],
      moduleNameMapper: {
        '^@tari/core$': '<rootDir>/packages/@tari/core/src',
        '^@tari/wallet$': '<rootDir>/packages/@tari/wallet/src',
      },
    },
    {
      displayName: '@tari/full',
      testMatch: ['<rootDir>/packages/@tari/full/**/*.test.ts'],
      moduleNameMapper: {
        '^@tari/core$': '<rootDir>/packages/@tari/core/src',
        '^@tari/wallet$': '<rootDir>/packages/@tari/wallet/src',
        '^@tari/full$': '<rootDir>/packages/@tari/full/src',
      },
    },
  ],
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/src/**/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 90,
      statements: 90,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
