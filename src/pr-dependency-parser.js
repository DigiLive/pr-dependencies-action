const core = require('@actions/core');
const github = require('@actions/github');

const customDomains = core.getInput('custom-domains')?.split(/(\s+)/) ?? [];

const keyPhrases = 'depends on|blocked by';
const issueTypes = 'issues|pull';
const domainsList = ['github.com'].concat(customDomains); // add others from parameter
const domainsString = combineDomains(domainsList);

const quickLinkRegex = new RegExp(`(${keyPhrases}):? #(\\d+)`, 'gmi');
const partialLinkRegex = new RegExp(`(${keyPhrases}):? ([-_\\w]+)\\/([-._a-z0-9]+)(#)(\\d+)`, 'gmi');
const partialUrlRegex = new RegExp(`(${keyPhrases}):? ([-_\\w]+)\\/([-._a-z0-9]+)\\/(${issueTypes})\\/(\\d+)`, 'gmi');
const fullUrlRegex = new RegExp(`(${keyPhrases}):? https?:\\/\\/(?:${domainsString})\\/([-_\\w]+)\\/([-._a-z0-9]+)\\/(${issueTypes})\\/(\\d+)`,
    'gmi');
const markdownRegex = new RegExp(`(${keyPhrases}):? \[.*]\(https?:\/\/(?:${domainsString})\/([-_\w]+)\/([-._a-z0-9]+)\/(${issueTypes})\/(\d+)\)`,
    'gmi');

/**
 * Combines an array of domains into a single string that can be used in a regex.
 *
 * Escapes all '.' characters in each domain and joins them with '|'.
 *
 * @param {string[]} domains - the array of domains to combine
 * @returns {string} the combined and escaped domains string
 */
function combineDomains(domains) {
  return domains.map(domain => domain.replace(/\./g, '\\.')).join('|');
}

/**
 * Extracts repository and issue/PR details from a regex match.
 *
 * @param {RegExpMatchArray | RegExpExecArray} match - the match object from a regex.
 * @returns {object} - an object with owner, repo, and pull number.
 */
function extractFromMatch(match) {
  return {
    owner: match[2],
    repo: match[3],
    pull_number: parseInt(match[5], 10),
  };
}

/**
 * Extracts all dependencies from a given body of text.
 *
 * @param {string} body - the body of text to extract dependencies from
 * @returns {object[]} - an array of objects with owner, repo, and pull number properties
 */
function getAllDependencies(body) {
  const allMatches = [];
  const quickLinkMatches = [...body.matchAll(quickLinkRegex)];

  if (quickLinkMatches.length !== 0) {
    quickLinkMatches.forEach(match => {
      core.info(`  Found number-referenced dependency in '${match}'`);
      allMatches.push({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        pull_number: parseInt(match[2], 10),
      });
    });
  }

  const extractableMatches = [...body.matchAll(partialLinkRegex)].concat([...body.matchAll(partialUrlRegex)]).
      concat([...body.matchAll(fullUrlRegex)]).
      concat([...body.matchAll(markdownRegex)]);

  if (extractableMatches.length !== 0) {
    extractableMatches.forEach(match => {
      core.info(`  Found number-referenced dependency in '${match}'`);
      allMatches.push(extractFromMatch(match));
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
    core.info('Initializing...');
    const myToken = process.env.GITHUB_TOKEN;
    /** @type {import('@octokit/rest').Octokit} */
    const octokit = github.getOctokit(myToken);

    const {data: pullRequest} = await octokit.rest.pulls.get({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: github.context.issue.number,
    });

    if (!pullRequest.body) {
      core.info('Empty PR Body.  Skipping');
      return;
    }

    core.info('\nReading PR body...');
    const dependencies = getAllDependencies(pullRequest.body);

    core.info('\nAnalyzing lines...');
    const dependencyIssues = [];

    for (let d of dependencies) {
      core.info(`  Fetching '${JSON.stringify(d)}'`);
      let isPr = true;
      let response = await octokit.rest.pulls.get(d).catch(error => core.error(error));

      if (response === undefined) {
        isPr = false;
        d = {
          owner: d.owner,
          repo: d.repo,
          issue_number: d.pull_number,
        };

        core.info(`  Fetching '${JSON.stringify(d)}'`);
        response = await octokit.rest.issues.get(d).catch(error => core.error(error));

        if (response === undefined) {
          core.info('    Could not locate this dependency.  Will need to verify manually.');
          continue;
        }
      }

      if (isPr) {
        const {data: pr} = response;

        if (!pr) continue;

        if (!pr.merged && !pr.closed_at) {
          core.info('    The PR is still open.');
          dependencyIssues.push(pr);
        } else {
          core.info('    The PR has been closed.');
        }
      } else {
        const {data: issue} = response;

        if (!issue) continue;

        if (!issue.closed_at) {
          core.info('    The issue is still open.');
          dependencyIssues.push(issue);
        } else {
          core.info('    The issue has been closed.');
        }
      }
    }

    if (dependencyIssues.length !== 0) {
      let msg = '\nThe following issues need to be resolved before this PR can be merged:\n';

      for (const pr of dependencyIssues) {
        msg += `\n#${pr.number} - ${pr.title}`;
      }

      core.setOutput('has-dependencies', true);
      core.setFailed(msg);
    } else {
      core.setOutput('has-dependencies', false);
      core.info('\nAll dependencies have been resolved!');
    }
  } catch (error) {
    core.setFailed(error.message);
    throw error;
  }
}

module.exports = {
  evaluate: evaluate,
  getAllDependencies: getAllDependencies,
};