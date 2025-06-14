const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');
const globals = require('globals');

module.exports = [
  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'build/**',
      '*.tsbuildinfo',
      'coverage/**',
      'docs/build/**',
      'examples/tauri-wallet-app/src-tauri/target/**',
      'native/target/**'
    ]
  },

  // Core ESLint recommended config
  eslint.configs.recommended,

  // TypeScript ESLint configurations
  ...tseslint.configs.recommended,

  // Base configuration for all TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022
      },
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: true,
        tsconfigRootDir: __dirname
      }
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin
    },
    rules: {
      // TypeScript specific overrides
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_'
      }],
      'no-unused-vars': 'off', // Disable base rule in favor of TypeScript version
      
      // General rules
      'no-console': 'warn',
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error'
    }
  },

  // Configuration for test files
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'warn', // More lenient in tests
      '@typescript-eslint/no-non-null-assertion': 'warn'
    }
  },

  // Configuration for build scripts and tooling
  {
    files: ['scripts/**/*.ts', 'packages/build/**/*.ts', 'tools/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-console': 'off'
    }
  },

  // Configuration for example applications
  {
    files: ['examples/**/*.ts', 'examples/**/*.tsx'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      'no-console': 'warn' // Allow console in examples but warn
    }
  },

  // Prettier integration (must come last to override formatting rules)
  prettier
];
