import * as core from '@actions/core';
import * as github from '@actions/github';
import { PRUpdater } from './pr-updater';
import { DependencyTag, IssueData, PullRequestData } from './types';

const customDomains = core.getInput('custom-domains')?.split(/(\s+)/) ?? [];

const keyPhrases = 'depends on|blocked by';
const issueTypes = 'issues|pull';
const domainsList = ['github.com'].concat(customDomains); // add others from parameter
const domainsString = combineDomains(domainsList);

const quickLinkRegex = new RegExp(`(${keyPhrases}):? #(\\d+)`, 'gmi');
const partialLinkRegex = new RegExp(`(${keyPhrases}):? ([-_\\w]+)\\/([-._a-z0-9]+)(#)(\\d+)`, 'gmi');
const partialUrlRegex = new RegExp(`(${keyPhrases}):? ([-_\\w]+)\\/([-._a-z0-9]+)\\/(${issueTypes})\\/(\\d+)`, 'gmi');
const fullUrlRegex = new RegExp(
  `(${keyPhrases}):? https?:\\/\\/(?:${domainsString})\\/([-_\\w]+)\\/([-._a-z0-9]+)\\/(${issueTypes})\\/(\\d+)`,
  'gmi'
);
const markdownRegex = new RegExp(
  `(${keyPhrases}):? \\[.*]\\(https?:\\/\\/(?:${domainsString})\\/([-_\\w]+)\\/([-._a-z0-9]+)\\/(${issueTypes})\\/(\\d+)\\)`,
  'gmi'
);

/**
 * Combines an array of domains into a single string that can be used in a regex.
 *
 * Escapes all '.' characters in each domain and joins them with '|'.
 *
 * @param {string[]} domains - the array of domains to combine
 * @returns {string} the combined and escaped domains string
 */
function combineDomains(domains: string[]): string {
  return domains.map((domain) => domain.replace(/\./g, '\\.')).join('|');
}

/**
 * Extracts repository and issue/PR details from a regex match.
 *
 * @param {RegExpMatchArray | RegExpExecArray} match - the match object from a regex.
 * @returns {DependencyTag} - an object with owner, repo, and pull number.
 */
function getTagFromMatch(match: RegExpMatchArray | RegExpExecArray): DependencyTag {
  return {
    owner: match[2],
    repo: match[3],
    number: parseInt(match[5], 10),
  };
}

/**
 * Extracts all dependencies from a given body of text.
 *
 * @param {string} body - the body of text to extract dependencies from.
 * @returns {DependencyTag[]} - an array of PR or Issue dependencies.
 */
function getDependencyTags(body: string): DependencyTag[] {
  const allMatches: DependencyTag[] = [];
  const quickLinkMatches = [...body.matchAll(quickLinkRegex)];

  if (quickLinkMatches.length !== 0) {
    quickLinkMatches.forEach((match) => {
      core.info(`  Found number-referenced dependency in '${match}'`);
      allMatches.push({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        number: parseInt(match[2], 10),
      });
    });
  }

  const extractableMatches = [...body.matchAll(partialLinkRegex)]
    .concat([...body.matchAll(partialUrlRegex)])
    .concat([...body.matchAll(fullUrlRegex)])
    .concat([...body.matchAll(markdownRegex)]);

  if (extractableMatches.length !== 0) {
    extractableMatches.forEach((match) => {
      core.info(`  Found number-referenced dependency in '${match}'`);
      allMatches.push(getTagFromMatch(match));
    });
  }

  return allMatches;
}

/**
 * Evaluates a pull request and checks for any unresolved dependencies.
 *
 * Marks the action as failed if there are unresolved dependencies or if an error occurs.
 *
 * @throws {Error} If an unexpected error occurs.
 */
async function evaluate() {
  try {
    core.info('Checking for dependencies...');

    const myToken = process.env.GITHUB_TOKEN;

    if (!myToken) {
      throw new Error('GITHUB_TOKEN is not set in the environment variables!');
    }

    const octokit = github.getOctokit(myToken);

    // Get the current PR data and parse its body.
    const { data: pullRequest } = (await octokit.rest.pulls.get({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: github.context.issue.number,
    })) as { data: PullRequestData };

    if (!pullRequest.body) {
      core.info('\n  Stopping: Empty PR Body.');
      return;
    }

    core.info('\n  Extracting dependencies from the PR body...');
    const tags = getDependencyTags(pullRequest.body);

    // Process each found dependency.
    core.info('\n  Analyzing dependencies...');
    const dependencies: IssueData[] = [];

    for (const tag of tags) {
      core.info(`    Fetching PR/Issue #${tag.number}`);

      const response = await octokit.rest.issues
        .get({
          owner: tag.owner,
          repo: tag.repo,
          issue_number: tag.number,
        })
        .catch((error) => {
          // Note: The error message should be generic since it could be an Issue or a PR
          core.error(`      Error fetching the PR/Issue: ${error}`);
          return undefined;
        });

      if (response === undefined) {
        core.info("      The PR/Issue not found. You'll need to verify it manually.");
        continue;
      }

      const dependency = response.data as IssueData;

      if (dependency.state !== 'closed') {
        core.info('      The PR/Issue is still open.');
        dependencies.push(dependency);
      } else {
        core.info('      The PR/Issue has been closed.');
      }
    }

    if (dependencies.length !== 0) {
      let msg = `The following PR/Issues need to be resolved before PR #${pullRequest.number} can be merged:`;

      for (const pr of dependencies) {
        msg += `\n#${pr.number} - ${pr.title}`;
      }

      const prUpdater = new PRUpdater(octokit, github.context);
      await prUpdater.updatePR(pullRequest, dependencies);

      core.setOutput('has-dependencies', true);
      core.setFailed(msg);
    } else {
      core.setOutput('has-dependencies', false);
      core.info('\nAll dependencies have been resolved!');
    }
  } catch (error) {
    core.setFailed((error as Error).message);
    throw error;
  }
}

export { evaluate, getDependencyTags };
