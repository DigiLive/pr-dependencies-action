import * as core from '@actions/core';
import * as github from '@actions/github';
import { PRUpdater } from './PRUpdater.js';
import { getDependencyTags } from './dependency-extractor.js';
import { DependencyTag, IssueData, PullRequestData } from './types.js';
import { Octokit } from '@octokit/rest';

/**
 * A class that checks and manages pull request dependencies.
 *
 * This class is responsible for:
 * - Extracting dependency information from pull request bodies.
 * - Validating if all dependencies are resolved.
 * - Updating pull request status based on dependency resolution.
 * - Providing detailed logging and output for GitHub Actions.
 *
 * @example
 * const checker = new PRDependencyChecker(octokit);
 * await checker.evaluate();
 */
export class PRDependencyChecker {
  private readonly octokit: Octokit;
  private indent: number = 0;

  /**
   * Creates a new instance of the PRDependencyChecker class.
   *
   * This constructor accepts an Octokit instance as a parameter.
   * The instance is used to interact with the GitHub API.
   *
   * @param {Octokit} octokit - the Octokit instance to use.
   */
  constructor(octokit: Octokit) {
    this.octokit = octokit;
  }

  /**
   * Evaluates the pull request to check for dependencies.
   *
   * If the pull request body is empty, the function will stop and log a warning.
   * Otherwise, it will extract the dependencies from the body and check if any of them are open.
   * If there are any open dependencies, it will update the pull request with a comment and block the merge.
   * If there are no open dependencies, it will log a success message and set the has-dependencies output to false.
   *
   * @returns {Promise<void>} A promise that resolves when the evaluation is complete.
   */
  async evaluate(): Promise<void> {
    try {
      core.info('Checking for dependencies...');

      const pullRequest = await this.fetchPullRequest();

      if (!pullRequest.body) {
        core.warning(`Stopping: Pull Request #${pullRequest.number} has an empty body.`);
        return;
      }

      this.indent++;
      core.info(`${this.getIndent()}Extracting dependencies from the PR body...`);
      const dependencies = await this.analyzeDependencies(pullRequest.body);

      if (dependencies.length > 0) {
        const prUpdater = new PRUpdater(this.octokit, github.context);
        let result = `The following dependencies need to be resolved before Pull Request #${pullRequest.number} can be merged:\n\n`;

        for (const dependency of dependencies) {
          result += `  #${dependency.number} - ${dependency.title}\n`;
        }

        await prUpdater.updatePR(dependencies);
        core.setFailed(result.trimEnd());
        core.setOutput('has-dependencies', true);
      } else {
        core.notice('All dependencies have been resolved!');
        core.setOutput('has-dependencies', false);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      core.setFailed(`Dependency check failed: ${errorMessage}`);
    }finally {
      this.indent--;
    }
  }

  /**
   * Returns a string consisting of two spaces, repeated this.indent times.
   * Used to indent log messages to show the call stack.
   *
   * @returns {string} A string of indentation characters.
   */
  private getIndent(): string {
    return '  '.repeat(this.indent);
  }

  /**
   * Fetches the pull request associated with the current GitHub context.
   *
   * This function attempts to fetch the pull request using the octokit client.
   * If the fetch is successful, it will return the pull request data as a Promise.
   *
   * @returns {Promise<PullRequestData>} A promise that resolves with the pull request data.
   * @throws {Error} If the pull request cannot be fetched.
   */
  private async fetchPullRequest(): Promise<PullRequestData> {
    this.indent++;
    core.info(`${this.getIndent()}Fetching Pull Request...`);

    try {
      const { data } = await this.octokit.rest.pulls.get({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        pull_number: github.context.issue.number,
      });
      return data as PullRequestData;
    } catch {
      throw Error(`Failed to fetch Pull Request #${github.context.issue.number}.`);
    } finally {
      this.indent--;
    }
  }

  /**
   * Fetches the pull request/issue associated with the given dependency tag.
   *
   * This function attempts to fetch the pull request/issue using the octokit client.
   * If the fetch is successful, it will return the pull request/issue data as a Promise.
   *
   * @param {DependencyTag} tag - The tag of the dependency to fetch.
   * @returns {Promise<IssueData>} A promise that resolves with the pull request/issue data.
   * @throws {Error} If the fetch failed.
   */
  private async fetchDependency(tag: DependencyTag): Promise<IssueData> {
    this.indent++;
    core.debug(`Fetching PR/Issue #${tag.number}`);

    try {
      const response = await this.octokit.rest.issues.get({
        owner: tag.owner,
        repo: tag.repo,
        issue_number: tag.number,
      });

      return response.data as IssueData;
    } catch {
      throw new Error(`Pull Request/Issue #${tag.number} not found.`);
    } finally {
      this.indent--;
    }
  }

  /**
   * Analyzes the given text for dependencies.
   *
   * This function first extracts all dependency tags from the given text.
   * It then iterates over the tags and attempts to fetch the associated pull request/issue.
   *
   * If the pull request/issue is not closed, it will be added to the list of dependencies.
   *
   * @param {string} text - The text to analyze for dependencies.
   * @returns {Promise<IssueData[]>} A promise that resolves with the list of dependencies.
   */
  private async analyzeDependencies(text: string): Promise<IssueData[]> {
    const tags = getDependencyTags(text);
    const dependencies: IssueData[] = [];

    core.info(`${this.getIndent()}Analyzing ${tags.length} dependencies...`);
    this.indent++;

    try {
      for (const tag of tags) {
        try {
          const dependency = await this.fetchDependency(tag);

          core.debug(`Pull Request/Issue #${tag.number} is ${dependency.state}.`);

          if (dependency && dependency.state !== 'closed') {
            dependencies.push(dependency);
          }
        } catch {
          core.warning(`Error while fetching Pull Request/Issue #${tag.number}. You'll need to verify it manually.`);
        }
      }

      return dependencies;
    } finally {
      this.indent -= 2;
    }
  }
}
