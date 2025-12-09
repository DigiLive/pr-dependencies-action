import { vi } from 'vitest';
import { Octokit } from '@octokit/rest';

/**
 * A mock implementation of DependencyChecker.evaluate().
 *
 * @returns {Promise<void>} A promise that resolves to undefined.
 */
export const mockEvaluate = vi.fn().mockResolvedValue(undefined);

/**
 * A mock implementation of the DependencyChecker class.
 */
export class MockDependencyChecker {
  // noinspection JSUnusedGlobalSymbols - Used for mocking the DependencyChecker.evaluate() method at the unit test of main.ts.
  evaluate = mockEvaluate;
  constructor(_octokit: Octokit) {}
}

/**
 * Mocks the DependencyChecker class.
 */
vi.mock('@/DependencyChecker', () => ({
  DependencyChecker: MockDependencyChecker,
}));
