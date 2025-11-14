import { Endpoints } from '@octokit/types';
import { Octokit as OctoKitCore } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';

export interface DependencyTag {
  owner: string;
  repo: string;
  number: number;
}

/**
 * The exact TypeScript type for the Pull Request object returned by octokit.rest.pulls.get().
 */
export type PullRequestData = Endpoints['GET /repos/{owner}/{repo}/pulls/{pull_number}']['response']['data'];

/**
 * The exact TypeScript type for the Issue object returned by octokit.rest.issues.get().
 *
 * GitHub's REST API considers every pull request an issue, but not every issue is a pull request.
 * For this reason, "Issues" endpoints may return both issues and pull requests in the response.
 * You can identify pull requests by the pull_request key.
 * Be aware that the id of a pull request returned from "Issues" endpoints will be an issue id.
 * To find out the pull request id, use the "List pull requests" endpoint.
 */
export type IssueData = Endpoints['GET /repos/{owner}/{repo}/issues/{issue_number}']['response']['data'];

export type PullRequestFromIssueData = IssueData & {
  // When it's a PR, the pull_request property is guaranteed to be an object.
  // We use this to narrow the type.
  pull_request: NonNullable<IssueData['pull_request']>;
};

/**
 * Represents an OctoKit instance with throttling capabilities.
 *
 * This type combines the base OctoKitCore with the throttling plugin's type,
 * providing rate limiting and retry functionality for GitHub API requests.
 */
export type ThrottledOctokit = typeof OctoKitCore & ReturnType<typeof throttling>;

/**
 * Type Guard: Checks if an IssueData object is actually a Pull Request.
 *
 * @param {IssueData} issue The object returned from octokit.rest.issues.get().
 * @returns True if the item has the necessary pull_request properties defined.
 */
export function isPullRequest(issue: IssueData): issue is PullRequestFromIssueData {
  return issue.pull_request !== null && issue.pull_request !== undefined;
}
