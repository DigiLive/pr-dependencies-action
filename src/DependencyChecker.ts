import * as core from '@actions/core';
import * as github from '@actions/github';
import { IssueUpdater } from './IssueUpdater.js';
import { getDependencyTags, getDependentsTags } from './tag-extractor.js';
import { DependencyTag, IssueData } from './types.js';
import { Octokit } from '@octokit/rest';
import { CheckerError } from '@/CheckerError.js';

//TODO: Make sure dependencies and dependents to have circular or duplicate references.
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
 * const checker = new PRDependencyChecker(octokit);
 * await checker.evaluate();
 */
export class DependencyChecker {
  private readonly octokit: Octokit;
  private readonly issueType: string;
  private readonly issue: IssueData;
  private indent: number = 0;

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
    ) as IssueData;
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
      core.info(`Evaluating dependency relationships of ${this.issueType} #${this.issue.number}...`);
      this.indent++;

      this.validateContext();

      const parentUpdater = new IssueUpdater(this.octokit, this.issue);

      core.info(`${this.getIndent()}Getting dependents...`);
      let lastBotComment = await parentUpdater.findLastBotComment(this.issue);
      const parentDependents = await this.getDependents(lastBotComment?.body ?? '');

      parentUpdater.dependents = parentDependents;

      core.info(`${this.getIndent()}Getting dependencies...`);
      const parentDependencies = await this.getDependencies(this.issue.body ?? '');
      parentUpdater.dependencies = parentDependencies;

      await parentUpdater.updateIssue();

      const dependenciesResult = `- Unresolved Dependencies: ${parentDependencies.length} (${parentDependencies.map(issue => `#${issue.number}`).join(' ').trim() || 'none'})`;
      const dependentsResult = `- Blocked Dependents: ${parentDependents.length} (${parentDependents.map(issue => `#${issue.number}`).join(' ').trim() || 'none'})`;

      if (parentDependencies.length > 0) {
        core.info(`Evaluating dependencies of ${this.issueType} #${this.issue.number}...`);

        for (const dependency of parentDependencies) {
          let dependencyUpdater = new IssueUpdater(this.octokit, dependency);

          lastBotComment = await dependencyUpdater.findLastBotComment(dependency);
          const childDependents = await this.getDependents(lastBotComment?.body ?? '');
          const childDependencies = await this.getDependencies(dependency.body ?? '');

          dependencyUpdater.dependencies = childDependencies;
          dependencyUpdater.dependents = childDependents;

          await dependencyUpdater.updateIssue();
        }

        core.setFailed(
          `\nSummary:\n${dependenciesResult}\n${dependentsResult}\n\nPlease resolve the above dependencies before ${this.issueType === 'Pull Request' ? 'merging' : 'closing'}.`
        );
        core.setOutput('has-dependencies', true);
      } else {
        core.notice(`\nSummary:\n${dependenciesResult}\n${dependentsResult}\n\nAll dependencies are resolved. Ready to ${this.issueType === 'Pull Request' ? 'merge!' : 'close!'}`);
        core.setOutput('has-dependencies', false);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      core.setFailed(`Dependency check failed: ${errorMessage}`);
    } finally {
      this.indent = 0;
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
   * Fetches the issue associated with the given dependency tag.
   *
   * This function attempts to fetch the issue using the octokit client.
   * If the fetch is successful, it will return the issue data as a Promise.
   *
   * @param {DependencyTag} tag - The tag of the issue to fetch.
   * @returns {Promise<IssueData>} A promise that resolves with the issue data.
   * @throws {Error} If the fetch failed.
   */
  private async fetchIssue(tag: DependencyTag): Promise<IssueData> {
    core.debug(`Fetching issue #${tag.issue_number}`);

    try {
      const response = await this.octokit.rest.issues.get(tag);

      return response.data as IssueData;
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
   * @returns {Promise<IssueData[]>} A promise that resolves with the list of dependencies.
   */
  private async getDependencies(commentBody: string): Promise<IssueData[]> {
    const tags = getDependencyTags(commentBody);
    const dependencies: IssueData[] = [];

    core.info(`${this.getIndent()}Analyzing ${tags.length} dependencies...`);
    this.indent++;

    try {
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
    } finally {
      this.indent--;
    }
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
   * @returns {Promise<IssueData[]>} A promise that resolves with the list of dependents.
   */
  private async getDependents(commentBody: string): Promise<IssueData[]> {
    const tags = getDependentsTags(commentBody);
    const dependents: IssueData[] = [];

    core.info(`${this.getIndent()}Analyzing ${tags.length} dependents...`);
    this.indent++;

    try {
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
    } finally {
      this.indent--;
    }
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
  }
}
