import { defineConfig, globalIgnores } from 'eslint/config';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import vitest from '@vitest/eslint-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('eslint').ConfigWithExtendsArray} */
const configuration = [
  // 1. Global Ignores
  globalIgnores(['**/dist/', '**/node_modules/']),

  // 2. TypeScript files
  {
    files: ['**/*.ts', '!vitest.config.ts'],
    ignores: ['eslint.config.mjs'], // Must be ignored to prevent linting errors.
    plugins: { '@typescript-eslint': typescriptEslint },
    languageOptions: {
      globals: { ...globals.node },
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    rules: {
      ...typescriptEslint.configs['recommended'].rules,
      ...typescriptEslint.configs['recommended-type-checked'].rules,
      'no-console': 'off',
      'no-empty-function': 'off',
      'no-unused-vars': 'off',
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
    },
  },

  // 3A. JavaScript files
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
      ecmaVersion: 2020,
    }
  },

  // 3B. ESLint config file
  {
    files: ['eslint.config.mjs'],
    rules: {
      'no-console': 'off',
    }
  },

  // 4. Test files
  {
    files: ['test/**/*.ts', 'vitest.config.ts'],
    plugins: {
      '@typescript-eslint': typescriptEslint,
      vitest: vitest,
    },
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.test.json',
        tsconfigRootDir: __dirname,
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    settings: {
      vitest: {
        typecheck: true,
      },
    },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/max-nested-describe': ['warn', { max: 3 }],
      '@typescript-eslint/no-unused-vars': ['warn', { args: 'all', argsIgnorePattern: '^_' }],
    },
  },

  // 5. Prettier config (must be last)
  prettierConfig,
];

export default defineConfig(configuration);
