import { defineConfig, globalIgnores } from 'eslint/config';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import prettierConfig from 'eslint-config-prettier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  // 1. Base JavaScript rules (Applies to all files first).
  js.configs.recommended,

  // 2. Global Ignores.
  globalIgnores(['**/dist/', '**/node_modules/']),

  // 3. JavaScript files.
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
      ecmaVersion: 2020,
    },
  },

  // 4. TypeScript files (Applies recommended rules, type-checked).
  {
    files: ['**/*.ts'],
    ignores: ['eslint.config.mjs'],
    plugins: { '@typescript-eslint': typescriptEslint },
    languageOptions: {
      globals: { ...globals.node },
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: __dirname,
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    rules: {
      // Apply ALL recommended rules for a complete TS setup.
      ...typescriptEslint.configs['recommended'].rules,
      ...typescriptEslint.configs['recommended-type-checked'].rules,

      // Custom overrides.
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],

      // Disable base JS rules to let TS rules handle them (critical for TS files)
      'no-console': 'off',
      'no-empty-function': 'off',
      'no-unused-vars': 'off',
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error', // Add the TS equivalent
    },
  },

  // 5. TypeScript Test files.
  {
    files: ['test/**/*.test.ts'],
    plugins: {
      '@typescript-eslint': typescriptEslint,
      vitest: {},
    },
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest, // Vitest uses similar globals to Jest
      },
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.test.json'],
        tsconfigRootDir: __dirname,
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    rules: {
      'vitest/consistent-test-it': ['error', { fn: 'it' }],
      'vitest/no-identical-title': 'error',
      'vitest/valid-expect': 'error',
      'vitest/no-focused-tests': 'warn',
      'vitest/no-conditional-tests': 'warn',
      'vitest/no-conditional-in-test': 'warn',
      'vitest/no-conditional-expect': 'error',
      'vitest/no-skipped-tests': 'warn',
    },
  },

  // 6. Configuration files.
  {
    files: ['*.config.{js,ts}'],
    rules: {
      'import/no-default-export': 'off', // Allow default exports in config files
    },
  },

  // 7. ESLint Configuration Overrides.
  {
    files: ['eslint.config.mjs'],
    languageOptions: {
      globals: { ...globals.node },
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    rules: {
      'no-console': 'off',
    },
  },

  // 8. Prettier Configuration: MUST BE LAST!
  // Uses 'prettier' config to DISABLE conflicting formatting rules.
  prettierConfig,
]);
