import * as core from '@actions/core';
import * as github from '@actions/github';
import { IssueUpdater } from './IssueUpdater.js';
import { getDependencyTags, getDependentsTags } from './tag-extractor.js';
import { APIIssue, APIPullRequest, DependencyTag } from './types.js';
import { Octokit } from '@octokit/rest';
import { CheckerError } from './CheckerError.js';
import { Issue, PullRequest } from '@octokit/webhooks-types';

/**
 * A class that checks and manages dependencies/dependents of the issue defined in the GitHub context.
 *
 * This class is responsible for:
 * - Extracting dependency relationships from issue bodies.
 * - Validating if they are resolved.
 * - Updating the issue status based on relationship's resolution.
 * - Providing detailed logging and output for GitHub Actions.
 *
 * Note:<br>
 * GitHub's REST API considers every pull request an issue, but not every issue is a pull request.
 * For this reason, "Issues" endpoints may return both issues and pull requests in the response.
 * You can identify pull requests by the pull_request key.
 *
 * Be aware that the id of a pull request returned from "Issues" endpoints will be an issue id.
 * To find out the pull request id, use the "List pull requests" endpoint.
 *
 * @example
 * const checker = new DependencyChecker(octokit);
 * await checker.evaluate();
 */
export class DependencyChecker {
  private readonly octokit: Octokit;
  private readonly issueType: string;
  private readonly issue: Issue | PullRequest;

  /**
   * Initializes a new instance.
   *
   * @param {Octokit} octokit - an Octokit instance.
   */
  constructor(octokit: Octokit) {
    this.validateContext();

    this.octokit = octokit;
    this.issueType = github.context.eventName === 'pull_request' ? 'Pull Request' : 'Issue';
    this.issue = (
      github.context.eventName === 'pull_request' ? github.context.payload.pull_request : github.context.payload.issue
    ) as Issue | PullRequest;
  }

  /**
   * Evaluates the issue to check for dependencies.
   *
   * If the issue's body is empty, the function will stop and log a warning.
   * Otherwise, it will extract the dependencies from the body and check if any of their states have been changed.
   *
   * On changes, the issue is commented with its current dependencies/dependents and labeled according to their states.
   *
   * @returns {Promise<void>} A promise that resolves when the evaluation is complete.
   */
  async evaluate(): Promise<void> {
    try {
      core.info(`Evaluating dependency relationships of ${this.issueType} #${this.issue.number}.`);

      this.validateContext();

      const parentUpdater = new IssueUpdater(this.octokit, this.issue);
      const summary = core.summary.addHeading('Dependency Check Summary');

      await this.withGroup('Getting Dependencies...', async () => {
        const dependencies = await this.getDependencies(this.issue.body ?? '');

        parentUpdater.dependencies = dependencies.filter((issue) => {
          if (issue.number === this.issue.number) {
            core.warning(`Skipping dependency #${this.issue.number} that matches current ${this.issueType}.`);
            return false;
          }
          return true;
        });
      });

      await this.withGroup('Getting Dependents...', async () => {
        const lastBotComment = await parentUpdater.findLastBotComment(this.issue);
        const dependents = await this.getDependents(lastBotComment?.body ?? '');

        parentUpdater.dependents = dependents.filter((issue) => {
          if (issue.number === this.issue.number) {
            core.warning(`Skipping dependent #${this.issue.number} that matches current ${this.issueType}.`);
            return false;
          }
          return true;
        });
      });

      await this.withGroup(`Updating current ${this.issueType}...`, async () => {
        await parentUpdater.updateIssue();
      });

      summary.addHeading('Unresolved Dependencies', 2);
      if (parentUpdater.dependencies.length > 0) {
        summary.addList(parentUpdater.dependencies.map((issue) => `#${issue.number}`));
        summary.addRaw('Please resolve the above dependencies, if any');
        core.info(`Evaluating dependencies of current ${this.issueType}.`);

        for (const dependency of parentUpdater.dependencies) {
          let dependencyUpdater = new IssueUpdater(this.octokit, dependency);

          await this.withGroup('Getting Dependencies...', async () => {
            dependencyUpdater.dependencies = await this.getDependencies(dependency.body ?? '');
          });

          await this.withGroup('Getting Dependents...', async () => {
            const lastBotComment = await dependencyUpdater.findLastBotComment(dependency);
            const dependents = await this.getDependents(lastBotComment?.body ?? '');

            dependencyUpdater.dependents = lastBotComment ? dependents : [this.issue as APIIssue, ...dependents];
          });

          await this.withGroup(`Updating dependency #${dependency.number}...`, async () => {
            await dependencyUpdater.updateIssue();
          });
        }

        core.setFailed(
          `Dependencies must be resolved before ${this.issueType === 'Pull Request' ? 'merging' : 'closing'} #${this.issue.number}.`
        );
        core.setOutput('has-dependencies', true);
      } else {
        summary.addRaw('None');
        core.notice(
          `All dependencies are resolved. Ready to ${this.issueType === 'Pull Request' ? 'merge' : 'close'} ${this.issueType} #${this.issue.number}.`
        );
        core.setOutput('has-dependencies', false);
      }

      summary.addHeading('Blocked Dependents', 2);
      if (parentUpdater.dependents.length > 0) {
        summary.addList(parentUpdater.dependents.map((issue) => `#${issue.number}`));
        core.info(`Evaluating dependents of current ${this.issueType}.`);

        for (const dependent of parentUpdater.dependents) {
          const dependentUpdater = new IssueUpdater(this.octokit, dependent);

          await this.withGroup('Getting Dependencies...', async () => {
            dependentUpdater.dependencies = await this.getDependencies(dependent.body ?? '');
          });

          await this.withGroup('Getting Dependents...', async () => {
            const lastBotComment = await dependentUpdater.findLastBotComment(dependent);

            dependentUpdater.dependents = await this.getDependents(lastBotComment?.body ?? '');
          });

          await this.withGroup(`Updating dependent #${dependent.number}...`, async () => {
            await dependentUpdater.updateIssue();
          });
        }
      } else {
        summary.addRaw('None');
        core.notice(`${this.issueType} #${this.issue.number} does not block a dependent.`);
      }

      await summary.write();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      core.setFailed(`Dependency check failed: ${errorMessage}`);
    }
  }

  /**
   * Fetches the issue associated with the given dependency tag.
   *
   * This function attempts to fetch the issue using the octokit client.
   * If the fetch is successful, it will return the issue data as a Promise.
   *
   * @param {DependencyTag} tag - The tag of the issue to fetch.
   * @returns {Promise<(APIIssue | APIPullRequest)>} A promise that resolves with the issue data.
   * @throws {Error} If the fetch failed.
   */
  private async fetchIssue(tag: DependencyTag): Promise<APIIssue | APIPullRequest> {
    core.debug(`Fetching issue #${tag.issue_number}`);

    try {
      const response = await this.octokit.rest.issues.get(tag);

      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      core.debug(`Failed to fetch issue #${tag.issue_number}: ${errorMessage}`);

      throw new CheckerError(`Failed to fetch issue #${tag.issue_number}`, error);
    }
  }

  /**
   * Analyzes the given commentBody for dependencies.
   *
   * This function first extracts all dependency tags from the given commentBody.
   * It then iterates over the tags and attempts to fetch the associated issue.
   *
   * If the issue is not closed, it will be added to the list of dependencies.
   *
   * @param {string} commentBody - The commentBody to analyze for dependencies.
   * @returns {Promise<(APIIssue | APIPullRequest)[]>} A promise that resolves with the list of dependencies.
   */
  private async getDependencies(commentBody: string): Promise<(APIIssue | APIPullRequest)[]> {
    const dependencies: (APIIssue | APIPullRequest)[] = [];
    const tags = getDependencyTags(commentBody);

    core.info(`Analyzing ${tags.length} dependencies.`);

    for (const tag of tags) {
      try {
        const dependency = await this.fetchIssue(tag);

        core.debug(`Dependency #${tag.issue_number} is ${dependency.state}.`);

        if (dependency && dependency.state !== 'closed') {
          dependencies.push(dependency);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        core.debug(`Failed to fetch dependency #${tag.issue_number}: ${errorMessage}`);
        core.warning(`Failed to fetch dependency #${tag.issue_number}. You'll need to verify it manually.`);
      }
    }

    return dependencies;
  }

  /**
   * Analyzes the given commentBody for dependents.
   *
   * This function first extracts all dependent tags from the given commentBody.
   * It then iterates over the tags and attempts to fetch the associated issue.
   *
   * If the issue is not closed, it will be added to the list of dependents.
   *
   * @param {string} commentBody - The commentBody to analyze for dependents.
   * @returns {Promise<(APIIssue | APIPullRequest)[]>} A promise that resolves with the list of dependents.
   */
  private async getDependents(commentBody: string): Promise<(APIIssue | APIPullRequest)[]> {
    const dependents: (APIIssue | APIPullRequest)[] = [];
    const tags = getDependentsTags(commentBody);

    core.info(`Analyzing ${tags.length} dependents.`);

    for (const tag of tags) {
      try {
        const dependent = await this.fetchIssue(tag);

        core.debug(`Dependent #${tag.issue_number} is ${dependent.state}.`);

        if (dependent && dependent.state !== 'closed') {
          dependents.push(dependent);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        core.debug(`Failed to fetch dependent #${tag.issue_number}: ${errorMessage}`);
        core.warning(`Failed to fetch dependent #${tag.issue_number}. You'll need to verify it manually.`);
      }
    }

    return dependents;
  }

  /**
   * Validates that required parameters of the GitHub context are present.
   *
   * @private
   * @throws {Error} If required parameters are missing.
   */
  private validateContext() {
    if (!['pull_request', 'issues'].includes(github.context.eventName)) {
      throw new CheckerError(
        `Event name '${github.context.eventName}' is not supported. Expected 'pull_request' or 'issues'.`
      );
    }

    if (!github.context.payload.pull_request && !github.context.payload.issue) {
      throw new CheckerError("Payload not found. Expected 'pull_request' or 'issue'.");
    }
  }

  /**
   * Executes a given function within a GitHub Actions core group.
   *
   * @template T - The type of the return value of the function.
   * @param {string} name - The name of the group.
   * @param {() => Promise<T>} fn - The function to execute within the group.
   * @returns {Promise<T>} - The result of the function.
   */
  private async withGroup<T>(name: string, fn: () => Promise<T>): Promise<T> {
    core.startGroup(name);
    try {
      return await fn();
    } finally {
      core.endGroup();
    }
  }
}
