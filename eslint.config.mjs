import { defineConfig, globalIgnores } from 'eslint/config';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

// List of config files that should use JavaScript rules
const configFiles = ['eslint.config.mjs', 'jest.config.ts', 'jest.setup.ts'];

export default defineConfig([
  globalIgnores(['**/dist/', '**/node_modules/']),

  // JavaScript configuration (applies to all .js and .mjs files)
  {
    files: ['**/*.js', '**/*.mjs'],
    ignores: configFiles, // Exclude config files from JS rules
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'module',
      ecmaVersion: 2020,
    },
  },

  // TypeScript configuration (applies to .ts files except config files)
  {
    files: ['**/*.ts', '!**/*.test.ts'],
    ignores: configFiles, // Exclude config files from TS rules
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': 'off',
      'no-empty-function': 'off',
      'no-unused-vars': 'off',
    },
  },

  // Configuration for config files (use basic JavaScript rules)
  {
    files: configFiles,
    languageOptions: {
      globals: {
        ...globals.node,
      },
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    rules: {
      // Basic rules for config files
      'no-console': 'off',
    },
  },

  // 6. Prettier Configuration: MUST BE LAST!
  // Uses 'prettier' config to DISABLE conflicting formatting rules.
  ...compat.extends('prettier'),
    },
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.test.json',
        tsconfigRootDir: __dirname,
        sourceType: 'module',
        ecmaVersion: 2020,
      },
    },
    rules: {
      // You can customize test-specific rules here
      '@typescript-eslint/no-empty-function': 'off',
      'no-empty-function': 'off',
    },
  },

  // Apply shared rules from extends
  ...compat.extends('eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'),
]);
