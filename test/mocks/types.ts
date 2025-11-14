import { IssueData, PullRequestData } from '@/types.js';

/**
 * Represents a mocked response for a GitHub Pull Request API call.
 * Used in tests to simulate GitHub API responses when fetching PR data.
 *
 * @property {number} code - The HTTP status code to simulate (e.g., 200 for success, 404 for not found)
 * @property {Partial<PullRequestData>} [data] - Partial PR data that will be merged with default values in tests
 *
 * @see https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request
 */
export interface MockPRResponse {
  code: number;
  data?: Partial<PullRequestData>;
}

/**
 * Represents a mocked response for a GitHub Issue API call.
 * Used in tests to simulate GitHub API responses when fetching issue data.
 *
 * @property {number} code - The HTTP status code to simulate (e.g., 200 for success, 404 for not found)
 * @property {Partial<IssueData>} [data] - Partial issue data that will be merged with default values in tests
 *
 * @see https://docs.github.com/en/rest/issues/issues#get-an-issue
 */
export interface MockIssueResponse {
  code: number;
  data?: Partial<IssueData>;
}

/**
 * Defines the interface for a mock GitHub API client used in tests.
 * This type provides methods to mock GitHub API responses and manage the mock server state.
 *
 * @property {Function} mockGetPR - Mocks a GitHub API call to fetch a pull request
 * @property {Function} mockGetIssue - Mocks a GitHub API call to fetch an issue
 * @property {Function} cleanup - Cleans up any active mocks and restores the original implementation
 * @property {Function} done - Finalizes the mock setup and verifies all expected calls were made
 *
 * @see https://github.com/nock/nock for more information on HTTP mocking
 */
export type MockGitHubAPI = {
  mockGetPR: (owner: string, repo: string, pull_number: number, response: MockPRResponse) => void;
  mockGetIssue: (owner: string, repo: string, issue_number: number, response: MockIssueResponse) => void;
  cleanup: () => void;
  done: () => void;
};
