import * as core from '@actions/core';
import * as github from '@actions/github';
import { DependencyTag } from './types.js';
import { getIssueTypes, getKeyPhrases } from './config.js';

/**
 * Returns the hostname of the GitHub API server.
 *
 * If `GITHUB_SERVER_URL` is set, it will use that as the base URL.
 * Otherwise, it defaults to 'https://github.com'.
 *
 * @returns {string} The hostname of the GitHub API server.
 */
const getHostName = (): string => new URL(process.env.GITHUB_SERVER_URL || 'https://github.com').hostname;

/**
 * Returns an object containing regex patterns for extracting dependency tags from a string.
 *
 * The returned object contains the following properties:
 * - `quickLink`: A pattern for matching GitHub quick links in the format of `#123`.
 * - `partialLink`: A pattern for matching GitHub partial links in the format of `owner/repo#123`.
 * - `partialUrl`: A pattern for matching GitHub partial URLs in the format of `owner/repo/issues/123`.
 * - `fullUrl`: A pattern for matching GitHub full URLs in the format of `https://github.com/owner/repo/issues/123`.
 * - `markdown`: A pattern for matching Markdown links in the format of `[text](url)`.
 *
 * @returns {Record<string, RegExp>} An object containing the regex patterns.
 */
const getRegexPatterns = (): Record<string, RegExp> =>
  ({
    quickLink: /(?:^|\s|\D)(#\d+)(?=\s|#|$)(?<!\S[\w-]+\/[\w-]+#\d+)/g,
    partialLink: /(?:^|\s)([\w-]+\/[\w-]+#\d+)(?=\s|#|$)/g,
    partialUrl: new RegExp(`(?:^|\\s)([\\w-]+/[\\w-]+/(?:${getIssueTypes()})/\\d+)(?=\\s|$)`, 'g'),
    fullUrl: new RegExp(
      `(?:^|\\s)(https?:\\/\\/${getHostName()}\\/[\\w-]+\\/[\\w-]+\\/(?:${getIssueTypes()})\\/\\d+)(?=\\s|$)`,
      'g'
    ),
    markdown: /\[.*?]\((.*?)\)/g,
  }) as const;

/**
 * Extracts dependency tags from a given string.
 *
 * This function takes a string and searches for dependency tags using various regex patterns.
 * It returns an array of DependencyTag objects containing the extracted owner, repo, and number.
 *
 * If the input string is empty, it returns an empty array.
 *
 * @param {string} body - The string to search for dependency tags.
 * @returns {DependencyTag[]} An array of DependencyTag objects.
 */
export function getDependencyTags(body: string): DependencyTag[] {
  if (!body) return [];

  // Process other types of matches. Markdown links are processed first to avoid false positives.
  const dependencyUrls = [
    ...extractDependencyUrls(body, getRegexPatterns().markdown),
    ...extractDependencyUrls(body, getRegexPatterns().quickLink),
    ...extractDependencyUrls(body, getRegexPatterns().partialLink),
    ...extractDependencyUrls(body, getRegexPatterns().partialUrl),
    ...extractDependencyUrls(body, getRegexPatterns().fullUrl),
  ];

  return compileDependencyTags(dependencyUrls);
}

/**
 * Takes an array of dependency URLs and returns an array of DependencyTag objects.
 *
 * The function takes each dependency URL and attempts to extract the owner, repo, and number from it.
 * If the URL is invalid, it logs a warning and skips it.
 *
 * @param {string[]} dependencyUrls - An array of dependency URLs.
 * @returns {DependencyTag[]} An array of DependencyTag objects.
 */
function compileDependencyTags(dependencyUrls: string[]): DependencyTag[] {
  core.debug(`Compiling ${dependencyUrls.length} dependency URLs...`);

  const allTags = dependencyUrls.flatMap((url) => {
    try {
      const match = url.match(
        new RegExp(
          `^(?:https?:\\/\\/[^/]+\\/)?([^/]+)\\/([^/#]+)(?:\\/(?:${getIssueTypes()})\\/|#)(\\d+)|#?(\\d+)$`,
          'i'
        )
      );

      if (match) {
        if (match[4]) {
          return [
            {
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              number: parseInt(match[4], 10),
            },
          ];
        }

        return [
          {
            owner: match[1],
            repo: match[2],
            number: parseInt(match[3], 10),
          },
        ];
      }

      core.warning(`  Skipping invalid dependency URL format: ${url}`);
      return [];
    } catch (error) {
      core.warning(`  Error processing dependency URL '${url}': ${(error as Error).message}`);
      return [];
    }
  });

  // Remove duplicates
  const uniqueTags = new Map<string, DependencyTag>();
  for (const tag of allTags) {
    const key = `${tag.owner}/${tag.repo}#${tag.number}`;
    if (!uniqueTags.has(key)) {
      uniqueTags.set(key, tag);
    }
  }

  core.debug(`  Found ${uniqueTags.size} unique dependency tags.`);

  return Array.from(uniqueTags.values());
}

/**
 * Extracts dependency URLs from a given string.
 *
 * The function processes the input string line by line, looking for lines that start with a key phrase and then
 * extracting URLs behind it until a blank line is encountered or the end of the string is reached.
 *
 * The extracted URLs are returned as an array of strings.
 *
 * @param {string} text - The string to search for dependency URLs.
 * @param {RegExp} pattern - The URL regex pattern to match against the input string.
 * @returns {string[]} An array of dependency URLs.
 */
function extractDependencyUrls(text: string, pattern: RegExp): string[] {
  const keyPhraseRegex = new RegExp(`^(?:${getKeyPhrases()}):`, 'i');
  const dependencyUrls: string[] = [];

  core.debug(`Extracting dependency URLs from text: ${text.substring(0, 50)}...`);

  let insideDependencyBlock = false;

  const textLines: string[] = text.split('\n');

  for (let line of textLines) {
    line = line.trim();

    if (line == '') {
      insideDependencyBlock = false;
      continue;
    }

    line.match(keyPhraseRegex);
    if (keyPhraseRegex.test(line)) {
      insideDependencyBlock = true;
    }

    if (insideDependencyBlock) {
      let match;

      pattern.lastIndex = 0;
      while ((match = pattern.exec(line)) !== null) {
        dependencyUrls.push(match[1]);
      }
    }
  }

  core.debug(`  Extracted ${dependencyUrls.length} dependency URLs.`);

  return dependencyUrls;
}
