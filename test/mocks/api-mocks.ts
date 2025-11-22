import nock from 'nock';
import { Octokit as OctoKitCore, Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { throttlingConfig } from '@/config.js';
import { ThrottledOctokit } from '@/types.js';
import { MockGitHubAPI, MockIssueResponse, MockListCommentsResponse, MockPRResponse } from './types.js';

const throttledOctokit: ThrottledOctokit = OctoKitCore.plugin(throttling);
const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';
const myToken = process.env.GITHUB_TOKEN;

/**
 * Default HTTP headers for mocking GitHub API responses in tests.
 *
 * These headers simulate a typical GitHub API response.
 */
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-GitHub-Request-Id': 'mock-request-id',
  'X-RateLimit-Limit': '5000',
  'X-RateLimit-Remaining': '4999',
  'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
};

/**
 * Creates a mock GitHub API client for testing purposes.
 *
 * This function returns a mock GitHub API client that can be used to mock API responses in tests.
 * The mock client is configured with the default HTTP headers and a throttling configuration that matches the
 * production GitHub API.
 *
 * @returns {MockGitHubAPI} A mock GitHub API client with the following methods:
 * - `mockGetPR`: Mocks the GitHub API endpoint to get a pull request.
 * - `mockGetIssue`: Mocks the GitHub API endpoint to get an issue.
 * - `cleanup`: Cleans up all active nock interceptors and restores the original HTTP behavior.
 * - `done`: Verifies that all expected HTTP requests were made and cleans up the nock scope.
 */
export const createMockGithubAPI = (): MockGitHubAPI => {
  const scope = nock(apiUrl).defaultReplyHeaders(DEFAULT_HEADERS);

  nock.disableNetConnect();

  return {
    /**
     * Mocks the GitHub API endpoint to get a pull request.
     *
     * @param {string} owner - Repository owner (username or organization).
     * @param {string} repo - Repository name.
     * @param {number} pull_number - Pull request number.
     * @param {MockPRResponse} response - Mock response data to return.
     */
    mockGetPR: (owner: string, repo: string, pull_number: number, response: MockPRResponse) => {
      response.data = {
        ...response.data,
        number: pull_number,
      };

      return scope.get(`/repos/${owner}/${repo}/pulls/${pull_number}`).reply(response.code, response.data);
    },

    /**
     * Mocks the GitHub API endpoint to get an issue.
     *
     * GitHub's REST API considers every pull request an issue, but not every issue is a pull request.
     * You can identify pull requests by the `pull_request` key.
     *
     * @param {string} owner - Repository owner (username or organization).
     * @param {string} repo - Repository name.
     * @param {number} issue_number - Issue number to fetch.
     * @param {MockIssueResponse} response - Mock response data to return.
     */
    mockGetIssue: (owner: string, repo: string, issue_number: number, response: MockIssueResponse) => {
      response.data = {
        ...response.data,
        number: issue_number,
      };
      return scope.get(`/repos/${owner}/${repo}/issues/${issue_number}`).reply(response.code, response.data);
    },

    /**
     * Mocks the GitHub API endpoint to list comments on an issue.
     *
     * @param {string} owner - Repository owner (username or organization).
     * @param {string} repo - Repository name.
     * @param {number} issue_number - Issue number to list comments for.
     * @param {MockListCommentsResponse} response - Mock response data to return.
     */
    mockListComments: (
      owner: string,
      repo: string,
      issue_number: number,
      response: MockListCommentsResponse
    ): nock.Scope => {
      return scope.get(`/repos/${owner}/${repo}/issues/${issue_number}/comments`).reply(response.code, response.data);
    },

    /**
     * Mocks the GitHub API Post endpoints for an issue.
     *
     * @param {string} owner - Repository owner (username or organization).
     * @param {string} repo - Repository name.
     * @param {number} issue_number - Issue number to post (to).
     * @param {number} response - The HTTP status code to simulate (e.g., 201 for created, 404 for not found)
     */
    mockIssuePostRequest: (owner: string, repo: string, issue_number: number, response: number) => {
      return scope.post(url => url.includes(`/repos/${owner}/${repo}/issues/${issue_number}`)).reply(response);
    },

    /**
     * Mocks the GitHub API Delete endpoints for an issue.
     *
     * @param {string} owner - Repository owner (username or organization).
     * @param {string} repo - Repository name.
     * @param {number} issue_number - Issue number to delete (from).
     * @param {number} response - The HTTP status code to simulate (e.g., 204 for deleted, 404 for not found)
     */
    mockIssueDeleteRequest: (owner: string, repo: string, issue_number: number, response: number) => {
      return scope.delete(url => url.includes(`/repos/${owner}/${repo}/issues/${issue_number}`)).reply(response);
    },

    /**
     * Cleans up all active nock interceptors and restores the original HTTP behavior.
     * This should be called after tests are completed to ensure clean test isolation.
     *
     * @example
     * afterEach(() => {
     *   mockGithubAPI.cleanup();
     * });
     */
    cleanup: () => {
      nock.cleanAll();
      nock.enableNetConnect();
      nock.restore();
    },

    /**
     * Verifies that all expected HTTP requests were made and cleans up the nock scope.
     * This should be called at the end of each test case to ensure test isolation.
     *
     * - Verifies all expected requests were made (fails the test if any are missing).
     * - Removes the request expectations to prevent them from affecting other tests.
     *
     * @throws {Error} If any expected requests were not made.
     * @example
     * it('should make expected API calls', async () => {
     *   // Test code that makes API calls
     *   mockGithubAPI.done(); // Verify expectations
     * });
     */
    done: () => {
      scope.done();
    },
  };
};

/**
 * Creates a throttled Octokit instance for GitHub API interactions.
 *
 * The instance is configured with:
 * - Authentication using GITHUB_TOKEN from environment variables.
 * - Base URL from GITHUB_API_URL or defaults to 'https://api.github.com'.
 * - Built-in request throttling and retry logic.
 * */
export const mockedOctokit: Octokit = new throttledOctokit({
  auth: myToken,
  baseUrl: apiUrl,
  throttle: throttlingConfig,
});
