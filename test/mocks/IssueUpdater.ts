import * as core from '@actions/core';
import { IssueData } from '@/types.js';
import * as github from '@actions/github';

/**
 * A mock implementation of the IssueUpdater class for testing purposes.
 *
 * This class simulates the behavior of updating a pull request with dependency information without making actual
 * API calls.
 */
export class MockIssueUpdater {
  /**
   * Simulates updating a pull request with dependency information.
   *
   * @param {IssueData[]} dependencies - Array of dependency issues to be processed.
   * @returns {void} Outputs a notice message with the number of dependencies.
   *
   * @example
   * const updater = new MockIssueUpdater();
   * updater.updateIssue(dependencies);
   */
  // noinspection JSUnusedGlobalSymbols - Used in tests.
  updateIssue(dependencies: IssueData[]): void {
    core.info(`Updating Pull Request #999 with ${dependencies?.length || 0} dependencies.`);
  }
}

// noinspection JSUnusedGlobalSymbols - Used in tests via vi.mock()
export { MockIssueUpdater as IssueUpdater };
