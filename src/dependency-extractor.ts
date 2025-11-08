import * as core from '@actions/core';
import * as github from '@actions/github';
import { DependencyTag } from './types';
import { getDomains, getKeyPhrases, getIssueTypes } from './config';

/**
 * Pre-compiled regex patterns for different types of dependency references.
 *
 * @type {Record<string, RegExp>}
 * @property {RegExp} quickLink - Matches simple issue references like "#123".
 * @property {RegExp} partialLink - Matches `owner/repo#123` format.
 * @property {RegExp} partialUrl - Matches `owner/repo/issues/123` format without a domain.
 * @property {RegExp} fullUrl - Matches full GitHub URLs.
 * @property {RegExp} markdown - Matches Markdown style links like [text](url).
 */
const REGEX_PATTERNS: Record<string, RegExp> = {
  quickLink: /(?:^|\s|\D)#(\d+)(?=\s|#|$)(?<!\S[\w-]+\/[\w-]+#\d+)/g,
  partialLink: /(?:^|\s)([\w-]+\/[\w-]+#\d+)(?=\s|#|$)/g,
  partialUrl: new RegExp(`(?:^|\\s)([\\w-]+/[\\w-]+/(?:${getIssueTypes()})/\\d+)(?=\\s|$)`, 'g'),

  fullUrl: new RegExp(
    `(?:^|\\s)(https?:\\/\\/(?:${getDomains()})\\/[\\w-]+\\/[\\w-]+\\/(?:${getIssueTypes()})\\/\\d+)(?=\\s|$)`,
    'g'
  ),
  markdown: /\[.*?]\((.*?)\)/g,
} as const;

export function getDependencyTags(body: string): DependencyTag[] {
  if (!body) return [];

  // Process other types of matches
  const dependencyUrls = [
    ...extractDependencyUrls(body, REGEX_PATTERNS.markdown),
    ...extractDependencyUrls(body, REGEX_PATTERNS.quickLink),
    ...extractDependencyUrls(body, REGEX_PATTERNS.partialLink),
    ...extractDependencyUrls(body, REGEX_PATTERNS.partialUrl),
    ...extractDependencyUrls(body, REGEX_PATTERNS.fullUrl),
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
        new RegExp(`^(?:https?://[^/]+/)?([^/]+)/([^/#]+)(?:/(?:${getIssueTypes()})/|#)(\\d+)$`, 'i')
      );

      if (match) {
        return [
          {
            owner: match[1],
            repo: match[2],
            number: parseInt(match[3], 10),
          },
        ];
      }

      const number = parseInt(url, 10);
      if (!isNaN(number)) {
        return [{ ...github.context.repo, number }];
      }

      core.warning(`Skipping invalid dependency URL format: ${url}`);
      return [];
    } catch (error) {
      core.warning(`Error processing dependency URL '${url}': ${(error as Error).message}`);
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

  core.debug(`Found ${uniqueTags.size} unique dependency tags.`);

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
 * @param {RegExp} pattern - The url regex pattern to match against the input string.
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

  core.debug(`Extracted ${dependencyUrls.length} dependency URLs.`);

  return dependencyUrls;
}
