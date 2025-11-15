import * as core from '@actions/core';
import { ThrottlingOptions } from '@octokit/plugin-throttling';
import { RequestOptions } from '@octokit/types';
import { Octokit } from '@octokit/core';


/**
 * The key phrases used to identify dependency declarations.
 *
 * Note:
 * The input's name currently can not contain hyphens (-) because of a bug in core.getInput().
 * @see https://github.com/actions/toolkit/issues/2034
 *
 * @default 'depends on|blocked by'
 */
const KEY_PHRASES: string = core.getInput('phrases') || 'depends on|blocked by';

/**
 * The label to be applied to the pull request when there are still open dependencies.
 *
 * @default 'blocked'
 */
export const PR_LABEL: string = core.getInput('label') || 'blocked';

/**
 * Configuration options for request throttling when making API calls to GitHub.
 *
 * This configuration helps prevent hitting GitHub API rate limits by:
 * - Limiting the number of concurrent requests
 * - Adding a minimum delay between requests
 * - Implementing exponential backoff for retries
 *
 * @see {@link https://github.com/octokit/plugin-throttling.js#options} for more details.
 */
export const throttlingConfig: ThrottlingOptions = {
  onRateLimit: (retryAfter: number, options: RequestOptions, octokit: Octokit, retryCount: number) => {
    core.warning(
      `Primary rate limit hit. Retrying ${options.method} ${options.url} after ${retryAfter} seconds (Attempt ${retryCount + 1}).`
    );
    // Return 'true' to retry the request; we'll stop after 3 attempts.
    return retryCount < 3;
  },

  onSecondaryRateLimit: (retryAfter: number, options: RequestOptions, octokit: Octokit, retryCount: number) => {
    core.warning(
      `Secondary rate limit hit. Retrying ${options.method} ${options.url} after ${retryAfter} seconds (Attempt ${retryCount + 1}).`
    );
    // Return 'true' to retry the request; we'll stop after 3 attempts.
    return retryCount < 3;
  },
};

/**
 * Gets a regex-compatible string of key phrases used to identify dependency declarations.
 *
 * @returns {string} A regex string containing the configured key phrases separated by pipes.
 * @example 'depends on|blocked by'
 */
export const getKeyPhrases = createMemoizedRegexString(KEY_PHRASES);

/**
 * Gets a regex-compatible string for matching GitHub issue and pull request types.
 *
 * @returns {string} A regex string that matches either 'issues' or 'pull'.
 * @example 'issues|pull'
 */
export const getIssueTypes: () => string = createMemoizedRegexString('issues|pull');

/**
 * Creates a memoized function that escapes all special regex characters except the pipe (|) from the given string.
 *
 * The function will return the same cached string every time it is called, unless the input string is changed.
 *
 * @param {string} input - The string to escape and cache.
 * @returns {() => string} - A memoized function that returns the cached string.
 */
function createMemoizedRegexString(input: string): () => string {
  let cached: string | null = null;

  return () => {
    if (!cached) {
      // Escape all special regex characters except the pipe (|)
      cached = input.replace(/[.*+?^${}()|[\]\\]/g, (match) => (match === '|' ? '|' : `\\${match}`));
    }
    return cached;
  };
}
