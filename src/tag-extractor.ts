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
 * Returns an object containing regex patterns and handlers for extracting dependency tags from a string.
 *
 * The returned object contains the following properties:
 * - `intraRepo`: For matching GitHub's intra-repo shorthands. `#123`.
 * - `crossRepo`: For matching GitHub's cross-repo shorthands. `owner/repo#123`.
 * - `path`: For matching GitHub path shorthands in the format of `owner/repo/issues/123`.
 * - `url`: For matching GitHub URLs in the format of `https://github.com/owner/repo/issues/123`.
 *
 * @returns {Record<string, {regex: RegExp; handler: (match: RegExpMatchArray) => DependencyTag}>} An object containing the regex patterns and their handlers.
 */
const getRegexPatterns = (): Record<
  string,
  { regex: RegExp; handler: (match: RegExpMatchArray) => DependencyTag }
> => ({
  intraRepo: {
    regex: /(?<=^|\s|\()#(\d+)(?=\b)/g,
    handler: (match: RegExpMatchArray) =>
      ({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: parseInt(match[1], 10),
      }) as DependencyTag,
  },
  crossRepo: {
    regex: /(?<=^|\s|\()([\w.-]+)\/([\w.-]+)#(\d+)(?=\b)/g,
    handler: (match: RegExpMatchArray) =>
      ({
        owner: match[1],
        repo: match[2],
        issue_number: parseInt(match[3], 10),
      }) as DependencyTag,
  },
  path: {
    regex: new RegExp(`(?<=^|\\s|\\()([\\w.-]+)\\/([\\w.-]+)\\/(${getIssueTypes()})\\/(\\d+)(?=\\b)`, 'g'),
    handler: (match: RegExpMatchArray) =>
      ({
        owner: match[1],
        repo: match[2],
        issue_number: parseInt(match[4], 10),
      }) as DependencyTag,
  },
  url: {
    regex: new RegExp(
      `(?<=^|\\s|\\()https?:\\/\\/${getHostName()}\\/([\\w.-]+)\\/([\\w.-]+)\\/(${getIssueTypes()})\\/(\\d+)(?=\\b)`,
      'g'
    ),
    handler: (match: RegExpMatchArray) =>
      ({
        owner: match[1],
        repo: match[2],
        issue_number: parseInt(match[4], 10),
      }) as DependencyTag,
  },
});

/**
 * Extracts dependent tags from a comment body string.
 *
 * The dependents are assumed to be of the current repository.
 *
 * @param {string} commentBody - The comment body string to extract dependent tags from.
 * @returns {DependencyTag[]} An array of dependent tags.
 */
export function getDependentsTags(commentBody: string): DependencyTag[] {
  const tags: DependencyTag[] = [];

  const blockMatch = commentBody.match(/the following dependents:\n([\s\S]*?)(?=\n---\n|$)/i);
  const block = blockMatch?.[0] ?? '';
  const pattern = /- \[(?:PR|Issue) #(\d+)]\([^)]+\/(\d+)\)/g;

  let match;

  core.debug(`Extracting tags from comment: ${block.substring(0, 50)}...`);

  while ((match = pattern.exec(block)) !== null) {
    const issue_number = parseInt(match[1], 10);

    tags.push({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: issue_number,
    });
  }

  const uniqueTags = [...new Map(tags.map((tag) => [`${tag.owner}/${tag.repo}#${tag.issue_number}`, tag])).values()];

  core.debug(`Found ${uniqueTags.length} unique dependent tags.`);

  return uniqueTags;
}

/**
 * Extracts dependency tags from a comment body string.
 *
 * This function takes a string and searches for dependency-block and extracts tags from it by using various regex
 * patterns.
 * It returns an array of DependencyTag objects containing the extracted owner, repo, and number.
 *
 * If the input string is empty, it returns an empty array.
 *
 * @param {string} commentBody - The string to search for dependency tags.
 * @returns {DependencyTag[]} An array of DependencyTag objects.
 */
export function getDependencyTags(commentBody: string): DependencyTag[] {
  const tags: DependencyTag[] = [];

  const block = extractDependencyBlock(commentBody);
  const patterns = Object.values(getRegexPatterns());

  core.debug(`Extracting tags from comment: ${block.substring(0, 50)}...`);

  for (const { regex, handler } of patterns) {
    for (const match of block.matchAll(regex)) {
      tags.push({ ...handler(match) });
    }
  }

  const uniqueTags = [...new Map(tags.map((tag) => [`${tag.owner}/${tag.repo}#${tag.issue_number}`, tag])).values()];

  core.debug(`Found ${uniqueTags.length} unique dependency tags.`);

  return uniqueTags;
}

/**
 * Extracts the dependency block from a given comment body string.
 *
 * This function takes a comment body string and searches for the dependency block,
 * which is the text between key phrases such as "Depends on:".
 * It returns the extracted dependency block as a string.
 *
 * @param {string} commentBody - The comment body string to search for the dependency block.
 * @returns {string} The extracted dependency block as a string.
 */
function extractDependencyBlock(commentBody: string): string {
  if (!commentBody) return '';

  const keyPhraseRegex = new RegExp(`^(?:${getKeyPhrases()}):`, 'i');
  let dependencyBlock = '';

  core.debug(`Extracting dependency block from text: ${commentBody.substring(0, 50)}...`);

  let insideDependencyBlock = false;
  const textLines: string[] = commentBody.split('\n');

  for (let line of textLines) {
    line = line.trim();

    if (line === '') {
      insideDependencyBlock = false;
      continue;
    }

    if (keyPhraseRegex.test(line)) {
      insideDependencyBlock = true;
    }

    if (insideDependencyBlock) {
      dependencyBlock += line + '\n';
    }
  }

  core.debug(`Dependency Block Extracted.`);

  return dependencyBlock;
}
