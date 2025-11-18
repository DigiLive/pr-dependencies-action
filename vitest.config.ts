import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// noinspection JSUnusedGlobalSymbols - Used by Vitest.
export default defineConfig({
  test: {
    setupFiles: './test/vitest.setup.ts',
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'test/**',
        '**/*.d.ts',
        '**/types.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});