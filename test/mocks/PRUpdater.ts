import * as core from '@actions/core';
import { IssueData, PullRequestData } from '@/types.js';

/**
 * A mock implementation of the PRUpdater class for testing purposes.
 *
 * This class simulates the behavior of updating a pull request with dependency information without making actual
 * API calls.
 */
export class MockPRUpdater {
  /**
   * Simulates updating a pull request with dependency information.
   *
   * @param {PullRequestData} pullRequest - The pull request to be updated.
   * @param {IssueData[]} dependencies - Array of dependency issues to be processed.
   * @returns {void} Outputs a notice message with the number of dependencies.
   *
   * @example
   * const updater = new MockPRUpdater();
   * updater.updatePR(pullRequest, dependencies);
   */
  // noinspection JSUnusedGlobalSymbols - Used in tests
  updatePR(pullRequest: PullRequestData, dependencies: IssueData[]): void {
    core.notice(`MOCK: PR #${pullRequest.number} updated with ${dependencies.length} dependencies.`);
  }
}

// noinspection JSUnusedGlobalSymbols - Used in tests via vi.mock()
export { MockPRUpdater as PRUpdater };
