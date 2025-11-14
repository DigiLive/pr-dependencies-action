/**
 * Mock GitHub context for testing GitHub Actions.
 *
 * Provides a simplified implementation of the GitHub context with:
 *
 * @property {Object} repo - Repository information
 * @property {string} repo.owner - Repository owner (default: 'test-owner')
 * @property {string} repo.repo - Repository name (default: 'test-repo')
 * @property {Object} issue - Issue context
 * @property {number} issue.number - Issue/PR number (default: NaN)
 *
 * @example
 * // In tests, you can override values as needed:
 * mockContext.issue.number = 42;
 *
 * @see https://docs.github.com/en/actions/learn-github-actions/contexts#github-context
 */
export const mockContext = {
  eventName: 'pull_request_target',
  repo: {
    owner: 'test-owner',
    repo: 'test-repo',
  },
  issue: {
    number: 999
  }
};