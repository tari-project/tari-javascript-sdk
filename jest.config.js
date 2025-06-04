module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  projects: [
    {
      displayName: '@tari-project/core',
      testMatch: ['<rootDir>/packages/@tari/core/**/*.test.ts'],
      moduleNameMapper: {
        '^@tari-project/core$': '<rootDir>/packages/@tari/core/src',
      },
    },
    {
      displayName: '@tari-project/wallet',
      testMatch: ['<rootDir>/packages/@tari/wallet/**/*.test.ts'],
      moduleNameMapper: {
        '^@tari-project/core$': '<rootDir>/packages/@tari/core/src',
        '^@tari-project/wallet$': '<rootDir>/packages/@tari/wallet/src',
      },
    },
    {
      displayName: '@tari-project/full',
      testMatch: ['<rootDir>/packages/@tari/full/**/*.test.ts'],
      moduleNameMapper: {
        '^@tari-project/core$': '<rootDir>/packages/@tari/core/src',
        '^@tari-project/wallet$': '<rootDir>/packages/@tari/wallet/src',
        '^@tari-project/full$': '<rootDir>/packages/@tari/full/src',
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
