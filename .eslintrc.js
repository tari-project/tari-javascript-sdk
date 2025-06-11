module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./tsconfig.json', './packages/*/tsconfig.json'],
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    '@typescript-eslint/recommended-requiring-type-checking',
    'airbnb-base',
    'prettier',
  ],
  rules: {
    // TypeScript specific overrides
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
    
    // Import rules
    'import/extensions': ['error', 'ignorePackages', {
      'ts': 'never',
      'js': 'never'
    }],
    'import/prefer-default-export': 'off',
    'import/no-default-export': 'error',
    
    // General rules
    'no-console': 'warn',
    'no-debugger': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    
    // Airbnb overrides for our patterns
    'class-methods-use-this': 'off',
    'no-underscore-dangle': 'off',
    'max-classes-per-file': 'off',
    'lines-between-class-members': ['error', 'always', { 
      exceptAfterSingleLine: true 
    }],
  },
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: ['./tsconfig.json', './packages/*/tsconfig.json'],
      },
    },
  },
  env: {
    node: true,
    es2022: true,
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      env: {
        jest: true,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'import/no-extraneous-dependencies': 'off',
      },
    },
    {
      files: ['scripts/**/*.ts', 'packages/build/**/*.ts'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
};
