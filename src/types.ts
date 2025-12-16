import { Endpoints } from '@octokit/types';
import { Octokit as OctoKitCore } from '@octokit/rest';
import { Issue, PullRequest } from '@octokit/webhooks-types';
import { throttling } from '@octokit/plugin-throttling';

export interface DependencyTag {
  owner: string;
  repo: string;
  issue_number: number;
  [key: string]: unknown;
}

/**
 * The exact TypeScript type for the Pull Request object returned by octokit.rest.pulls.get().
 */
export type APIPullRequest = Endpoints['GET /repos/{owner}/{repo}/pulls/{pull_number}']['response']['data'];

/**
 * The exact TypeScript type for the Issue object returned by octokit.rest.issues.get().
 *
 * GitHub's REST API considers every pull request an issue, but not every issue is a pull request.
 * For this reason, "Issues" endpoints may return both issues and pull requests in the response.
 * You can identify pull requests by the pull_request key.
 * Be aware that the id of a pull request returned from "Issues" endpoints will be an issue id.
 * To find out the pull request id, use the "List pull requests" endpoint.
 */
export type APIIssue = Endpoints['GET /repos/{owner}/{repo}/issues/{issue_number}']['response']['data'];

/**
 * Represents a GitHub issue or pull request that can come from either:
 * - Webhook events (@octokit/webhooks-types)
 * - API responses (@octokit/types)
 *
 * This type combines the common properties from both sources while maintaining
 * type safety for the union of all possible issue/PR types.
 */
export type GitHubIssue = (Issue | APIIssue| PullRequest  | APIPullRequest) & {
  number: number;
  title: string;
  state?: string;
  html_url: string;
  user: { login: string } | null;
  pull_request?: unknown;
  repository?: { owner: { login: string }; name: string };
};

/**
 * Represents an OctoKit instance with throttling capabilities.
 *
 * This type combines the base OctoKitCore with the throttling plugin's type,
 * providing rate limiting and retry functionality for GitHub API requests.
 */
export type ThrottledOctokit = typeof OctoKitCore & ReturnType<typeof throttling>;

/**
 * Type guard that checks if a GitHub issue is actually a pull request.
 * Works with both webhook and API issue types.
 *
 * @param {GitHubIssue} issue - The GitHub issue to check
 * @returns {boolean} True if the issue is a pull request, false otherwise
 */
export function isPullRequest(issue: GitHubIssue): issue is PullRequest | APIPullRequest {
  return 'pull_request' in issue || 'merged_at' in issue;
}
