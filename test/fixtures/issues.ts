import { IssueData } from '@/types.js';
import { createTestBotComment } from './comments.js';

/**
 * Represents a list of dependencies/dependents.
 *
 * @type IssueData[]
 */
export const testDependencies: IssueData[] = [
  {
    html_url: 'https://github.com/owner/repo/pull/888',
    number: 888,
    pull_request: {},
    title: 'Dependency Pull Request',
  } as IssueData,
];

/**
 * Represents a test issue.
 *
 * @type {IssueData}
 */
export const testIssue: IssueData = {
  body: createTestBotComment().body,
  html_url: 'https://github.com/owner/repo/issues/123',
  number: 999,
  pull_request: {},
  repository_url: 'https://api.github.com/repos/owner/repo',
  title: 'Mock Issue',
} as IssueData;
