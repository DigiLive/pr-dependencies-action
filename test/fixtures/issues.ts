import { APIIssue, GitHubIssue } from '../../src/types.js';
import { createTestBotComment } from './comments.js';

/**
 * Represents a list of dependencies/dependents.
 *
 * @type APIIssue[]
 */
export const testDependencies: APIIssue[] = [
  {
    html_url: 'https://github.com/owner/repo/pull/888',
    number: 888,
    pull_request: {},
    title: 'Dependency Pull Request',
  } as APIIssue,
];

/**
 * Represents a test issue.
 */
export const testIssue: GitHubIssue = {
  body: createTestBotComment().body,
  html_url: 'https://github.com/owner/repo/issues/123',
  number: 999,
  pull_request: {},
  repository_url: 'https://api.github.com/repos/owner/repo',
  title: 'Mock Issue',
} as APIIssue;
