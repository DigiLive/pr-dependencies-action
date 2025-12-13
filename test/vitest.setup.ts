import type * as CoreModule from '@actions/core';
import { mockContext } from './mocks/@actions/github.js';

// Set default environment variables if not running in GitHub Actions
process.env.GITHUB_SERVER_URL ||= 'https://github.com';
process.env.GITHUB_API_URL ||= 'https://api.github.com';
process.env.GITHUB_TOKEN ||= 'test_token';
process.env.ACTIONS_STEP_DEBUG ||= 'false';

// Set global mocks.

/**
 * Mocks the @actions/core module for testing purposes.
 *
 * This mock loads the custom mock implementation from './mocks/@actions/core.js'
 *
 * @see https://vitest.dev/api/vi.html#vi-mock
 */
vi.mock('@actions/core', async () => {
  // 1. SAFELY retrieve the REAL module's exports using vi.importActual()
  const actualCore = await vi.importActual<typeof CoreModule>('@actions/core');

  // 2. Load the external factory function you just created
  const mockModule = await import('./mocks/@actions/core.js');

  // 3. Execute the factory function, passing the real module to it.
  // This breaks the circular dependency and returns the final mock object.
  return mockModule.createMockCore(actualCore);
});

/**
 * Mocks the @actions/github module for testing purposes.
 *
 * This mock provides a simplified GitHub context with:
 * - Repository information (owner/repo)
 * - Basic issue context (with number set to NaN by default)
 *
 * The mock context is imported from './mocks/@actions/github.js' and provides consistent test data across all test
 * files. Individual tests can override these values as needed.
 *
 * @see https://github.com/actions/toolkit/tree/main/packages/github#context
 */
vi.mock('@actions/github', () => ({
  context: mockContext,
}));
