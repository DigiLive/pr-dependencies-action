import { IssueData, PullRequestData } from '@/types.js';
import nock from 'nock';
import { Octokit } from '@octokit/rest';
import * as github from '@actions/github';

/**
 * Represents a mocked response for a GitHub Pull pulls API Get call.
 * Used in tests to simulate GitHub API responses when fetching PR data.
 *
 * @property {number} code - The HTTP status code to simulate (e.g., 200 for success, 404 for not found).
 * @property {Partial<PullRequestData>} [data] - Partial PR data that will be merged with default values in tests.
 *
 * @see https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request
 */
export interface MockPRResponse {
  code: number;
  data?: Partial<PullRequestData>;
}

/**
 * Represents a mocked response for a GitHub issues API Get call.
 * Used in tests to simulate GitHub API responses when fetching issue data.
 *
 * @property {number} code - The HTTP status code to simulate (e.g., 200 for success, 404 for not found).
 * @property {Partial<IssueData>} [data] - Partial issue data that will be merged with default values in tests.
 *
 * @see https://docs.github.com/en/rest/issues/issues#get-an-issue
 */
export interface MockIssueResponse {
  code: number;
  data?: Partial<IssueData>;
}

/**
 * Represents a GitHub Issue comment.
 *
 * @see https://docs.github.com/en/rest/issues/comments#list-issue-comments
 *
 * @property {string} [body] - The content of the comment.
 * @property {Object} user - The user who created the comment.
 * @property {string} user.login - The username of the comment author.
 */
export interface IssueComment {
  body?: string;
  user: {
    login: string;
  };
}

/**
 * Represents a mocked response for a GitHub issue/comments API Get call.
 *
 * @see https://docs.github.com/en/rest/issues/comments#list-issue-comments
 *
 * @property {number} code - The HTTP status code to simulate (e.g., 200 for success, 404 for not found).
 * @property {IssueComment[]} data - An array of mock issue comments.
 */
export type MockListCommentsResponse = {
  code: number;
  data?: IssueComment[];
};

/**
 * Defines the interface for a mock GitHub API client used in tests.
 * This type provides methods to mock GitHub API responses and manage the mock server state.
 *
 * @property {Function} mockGetPR - Mocks a GitHub API Get call to fetch a pull request.
 * @property {Function} mockGetIssue - Mocks a GitHub API Get call to fetch an issue.
 * @property {Function} mockListComments - Mocks a GitHub Get API call to fetch issue comments.
 * @property {Function} mockIssuePostRequest - Mocks a GitHub Post API calls for issues.
 * @property {Function} mockIssueDeleteRequest - Mocks a GitHub Delete API calls for issues.
 * @property {Function} cleanup - Cleans up any active mocks and restores the original implementation.
 * @property {Function} done - Finalizes the mock setup and verifies all expected calls were made.
 *
 * @see https://github.com/nock/nock for more information on HTTP mocking.
 */
export type MockGitHubAPI = {
  mockGetPR: (owner: string, repo: string, pull_number: number, response: MockPRResponse) => nock.Scope;
  mockGetIssue: (owner: string, repo: string, issue_number: number, response: MockIssueResponse) => nock.Scope;
  mockListComments: (owner: string, repo: string, issue_number: number, response: MockListCommentsResponse) => nock.Scope;
  mockIssuePostRequest: (owner: string, repo: string, issue_number: number, response: number) => nock.Scope;
  mockIssueDeleteRequest: (owner: string, repo: string, issue_number: number, response: number) => nock.Scope;
  cleanup: () => void;
  done: () => void;
};

export interface MockPRDependencyChecker {
  fetchPullRequest(id: string): Promise<PullRequestData>;
}

export interface MockIssueUpdater {
  // Static Properties
  readonly SIGNATURE: string;

  // Public Properties
  dependencies: IssueData[];
  dependents: IssueData[];

  // Private Properties
  readonly context: typeof github.context;
  readonly issueType: string;
  readonly octokit: Octokit;
  lastBotComment: { body?: string } | undefined;

  // Public Methods
  addLabels(labels: string[]): Promise<void>;
  removeLabels(labels: string[]): Promise<void>;
  updateIssue(): Promise<void>;

  // Private Methods
  createCommentBody(): string;
  createDependenciesMessage(): string;
  createDependentsMessage(): string;
  findLastBotComment(refresh?: boolean): Promise<{ body?: string } | undefined>;
  handleDependencyUpdate(): Promise<void>;
  postComment(comment: string): Promise<void>;
  validateContext(): void;
}