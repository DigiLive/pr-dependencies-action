import { vi } from 'vitest';
import { Octokit } from '@octokit/rest';

/**
 * A mock function for {@link PRDependencyChecker.evaluate}.
 *
 * This mock function is used in tests to mock {@link PRDependencyChecker.evaluate}'s behavior.
 */
export const mockEvaluate = vi.fn();

/**
 * A mock class for {@link PRDependencyChecker}.
 *
 * This mock class is used in tests to mock {@link PRDependencyChecker}'s behavior.
 */
export class MockPRDependencyChecker {
  // noinspection JSUnusedGlobalSymbols - Used in tests.
  /**
   * Mock function for {@link PRDependencyChecker.evaluate}.
   *
   * This mock function is used in tests to mock {@link PRDependencyChecker.evaluate}'s behavior.
   */
  evaluate = mockEvaluate;

  constructor(_octokit: Octokit) {}
}

/**
 * A mock function for {@link PRDependencyChecker}.
 *
 * This mock function is used in tests to mock {@link PRDependencyChecker}'s behavior.
 * @returns {MockPRDependencyChecker} A mock instance of {@link PRDependencyChecker}.
 */
export const mockPRDependencyChecker = vi.fn((): MockPRDependencyChecker => new MockPRDependencyChecker(new Octokit()));
