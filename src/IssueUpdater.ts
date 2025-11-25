import * as core from '@actions/core';
import * as github from '@actions/github';
import { isPullRequest, IssueData } from './types.js';
import { Octokit } from '@octokit/rest';
import { BLOCKED_LABEL, BLOCKING_LABEL } from './config.js';
import { CheckerError } from './CheckerError.js';

/**
 * Handles pull request and issue updates by commenting and labeling.
 *
 * Note:<br>
 * GitHub's REST API considers every pull request an issue, but not every issue is a pull request.
 * For this reason, "Issues" endpoints may return both issues and pull requests in the response.
 * You can identify pull requests by the pull_request key.
 *
 * Be aware that the id of a pull request returned from "Issues" endpoints will be an issue id.
 * To find out the pull request id, use the "List pull requests" endpoint.
 */
class IssueUpdater {
  private static readonly SIGNATURE = '<!-- dependency-checker-action -->';
  public dependencies: IssueData[] = [];
  public dependents: IssueData[] = [];
  private readonly octokit: Octokit;
  private readonly context: typeof github.context;
  private readonly issueType: string;
  private lastBotComment: { body?: string } | undefined;

  /**
   * Initializes a new instance.
   *
   * @param {Octokit} octokit - an Octokit instance.
   * @param {typeof github.context} context - the GitHub context for the action.
   *
   * @throws {Error} If the context is missing required information.
   */
  constructor(octokit: Octokit, context: typeof github.context) {
    this.validateContext();

    this.octokit = octokit;
    this.context = context;
    this.issueType = github.context.eventName === 'pull_request' ? 'Pull Request' : 'Issue';
  }

  /**
   * Updates an issue with dependency and dependent information.
   *
   * Adds a comment when the issue's dependencies/dependents have been changed or resolved.
   * While dependencies/dependents are still open, the issue is labeled as blocked.
   *
   * @returns {Promise<void>} - a promise that resolves when the update is complete.
   */
  async updateIssue(): Promise<void> {
    const { number: issue_number } = this.context.issue;

    core.info(
      `Updating ${this.issueType} #${issue_number} with ${this.dependencies?.length || 0} dependencies. and ${this.dependents?.length || 0} dependants.`
    );

    try {
      await this.handleDependencyUpdate();

      core.info(`Updating ${this.issueType} #${issue_number} successfully finished.`);
    } catch (error) {
      if (!(error instanceof CheckerError)) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        core.debug(`Unexpected error: ${errorMessage}`);
      }

      throw new CheckerError(`Error updating ${this.issueType} #${issue_number}.`, error);
    }
  }

  /**
   * Handles the dependency update for an issue.
   *
   * If the comment has not changed, it will not update the issue.
   * If the dependencies have changed, it will add a new comment and block the issue.
   * If all dependencies have been resolved, it will add a new comment (if needed) and unblock the issue.
   *
   * @returns {Promise<void>} - A promise that resolves when the update is complete.
   */
  private async handleDependencyUpdate(): Promise<void> {
    const hasDependencies = this.dependencies?.length > 0;
    const hasDependents = this.dependents?.length > 0;
    const lastBotComment = await this.findLastBotComment();
    const newComment = this.createCommentBody();
    const commentChanged = !lastBotComment || lastBotComment.body !== newComment;
    const labelsToAdd = [...(hasDependencies ? [BLOCKED_LABEL] : []), ...(hasDependents ? [BLOCKING_LABEL] : [])];
    const labelsToRemove = [...(hasDependencies ? [] : [BLOCKED_LABEL]), ...(hasDependents ? [] : [BLOCKING_LABEL])];

    if (!commentChanged) {
      core.info('  The dependencies/dependents have not been changed.');
      return;
    }

    if (hasDependencies || hasDependents) {
      core.info('  The dependencies/dependents have been changed. Adding a comment...');
      await this.postComment(newComment);
      await this.addLabels(labelsToAdd);
      await this.removeLabels(labelsToRemove);
      return;
    }

    core.info(`  All dependencies/dependents have been resolved.${lastBotComment ? ' Adding a comment...' : ''}`);
    if (lastBotComment) await this.postComment(newComment);
    await this.removeLabels(labelsToRemove);
  }

  /**
   * Finds the last bot comment on an issue.
   *
   * The function searches through the comments of the issue in reverse order, looking for a comment
   * created by the 'github-actions[bot]' user that contains the action's signature.
   * If such a comment is found, it is returned. Otherwise, the function returns undefined.
   *
   * Note: <br>
   * The function will only search through the comments if the last bot comment is not already cached or if the refresh
   * parameter is true.
   *
   * @param {boolean} refresh - Whether to refresh the last bot comment.
   * @returns {Promise<{body?: string} | undefined>} - a promise that resolves with the last bot comment.
   */
  private async findLastBotComment(refresh: boolean = false): Promise<{ body?: string } | undefined> {
    if (this.lastBotComment && !refresh) {
      return this.lastBotComment;
    }

    const { owner, repo } = this.context.repo;
    const { number: issue_number } = this.context.issue;

    try {
      const { data: comments } = await this.octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number,
      });

      this.lastBotComment = comments
        .slice()
        .reverse()
        .find(
          (comment) => comment.user?.login === 'github-actions[bot]' && comment.body?.includes(IssueUpdater.SIGNATURE)
        );

      return this.lastBotComment;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      core.debug(`Failed to fetch comments for ${this.issueType} #${issue_number}: ${errorMessage}`);

      throw new CheckerError(`Failed to fetch comments for ${this.issueType} #${issue_number}`, error);
    }
  }

  /**
   * Generates a comment body based on the issue's dependencies and dependents.
   *
   * @returns {string} - the comment body.
   */
  private createCommentBody(): string {
    let comment = `${IssueUpdater.SIGNATURE}\n`;

    comment += `${this.createDependenciesMessage()}\n---\n${this.createDependentsMessage()}`;

    comment += '\n---\n*This is an automated message. Please resolve the above dependencies and dependents, if any.*';
    comment += '\n<!-- DO NOT EDIT THIS COMMENT! IT WILL BREAK THE DEPENDENCY CHECKER. -->';

    core.debug(`Generated comment body: ${comment.substring(0, 50)}...`);

    return comment;
  }

  /**
   * Generates a comment string that describes the dependencies of the issue.
   *
   * If there are no dependencies, a success message is returned.
   * Otherwise, a message is generated with a list of the blocking dependencies.
   *
   * @returns {string} - a comment string describing the dependencies of the issue.
   */
  private createDependenciesMessage(): string {
    let comment = '';

    if (!this.dependencies.length) {
      comment += `## ✅ All Dependencies Resolved.\n\nThis ${this.issueType} has no blocking dependencies.`;
    } else {
      comment += '## ⚠️ Blocking Dependencies Found:\n\n';
      comment += `This ${this.issueType} should not be ${this.issueType === 'Pull Request' ? 'merged' : 'resolved'}`;
      comment += ' until the following dependencies are resolved:\n\n';

      this.dependencies.forEach((dependency) => {
        const dependencyType = isPullRequest(dependency) ? 'PR' : 'Issue';
        comment += `- [${dependencyType} #${dependency.number}](${dependency.html_url}) – ${dependency.title}\n`;
      });
    }

    return comment;
  }

  /**
   * Generates a comment string that describes the dependents of the issue.
   *
   * If there are no dependents, a success message is returned.
   * Otherwise, a message is generated with a list of the blocked dependents.
   *
   * @returns {string} - a comment string describing the dependents of the issue.
   */
  private createDependentsMessage(): string {
    let comment = '';

    if (!this.dependents.length) {
      comment += `## ✅ All Dependents Resolved.\n\nThis ${this.issueType} blocks no dependents.`;
    } else {
      comment += '## ⚠️ Blocked Dependents Found:\n\n';
      comment += `This ${this.issueType} should be ${this.issueType === 'Pull Request' ? 'merged' : 'resolved'}`;
      comment += ' to unblock the following dependents:\n\n';

      this.dependents.forEach((dependency) => {
        const dependencyType = isPullRequest(dependency) ? 'PR' : 'Issue';
        comment += `- [${dependencyType} #${dependency.number}](${dependency.html_url}) – ${dependency.title}\n`;
      });
    }

    return comment;
  }

  /**
   * Post a comment to the issue with the given body.
   *
   * @param {string} comment - the body of the comment.
   * @throws {Error} - if posting the comment failed.
   */
  private async postComment(comment: string) {
    const { owner, repo } = this.context.repo;
    const { number: issue_number } = this.context.issue;

    core.info(`  Posting a comment to ${this.issueType} #${issue_number}...`);

    try {
      await this.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number,
        body: comment,
      });
      core.debug('Successfully posted a comment.');
    } catch (error) {
      const errorInstance = error instanceof Error;
      const errorMessage = errorInstance ? error.message : String(error);

      core.debug(`Failed to post a comment on ${this.issueType} #${issue_number}: ${errorMessage}`);
      throw new CheckerError(`Failed to post a comment on ${this.issueType} #${issue_number}.`, error);
    }
  }

  /**
   * Adds labels to the issue, creating it if it does not exist.
   *
   * @param {string[]} labels - the labels to add.
   * @throws {Error} - if adding the labels failed.
   */
  private async addLabels(labels: string[]) {
    if (!labels.length) {
      return;
    }

    const { owner, repo } = this.context.repo;
    const { number: issue_number } = this.context.issue;

    core.info(`  Adding labels: ${labels.join(', ')}...`);

    try {
      await this.octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number,
        labels: labels,
      });

      core.debug(`Label adding completed for ${this.issueType} #${issue_number}.`);
    } catch (error) {
      const errorInstance = error instanceof Error;
      const errorMessage = errorInstance ? error.message : String(error);

      core.debug(`Failed to add labels: ${errorMessage}`);
      throw new CheckerError(`Failed to add ${labels.length} label(s)`, error);
    }
  }

  /**
   * Removes labels from the issue.
   *
   * @param {string[]} labels - the label to remove.
   * @throws {Error} - if removing the label failed.
   */
  private async removeLabels(labels: string[]) {
    if (!labels.length) {
      return;
    }

    const { owner, repo } = this.context.repo;
    const { number: issue_number } = this.context.issue;
    const labelErrors = [];

    core.info(`  Removing labels: ${labels.join(', ')}...`);

    for (const label of labels) {
      try {
        await this.octokit.rest.issues.removeLabel({
          owner,
          repo,
          issue_number,
          name: label,
        });
      } catch (error) {
        const errorInstance = error instanceof Error;

        if (errorInstance && 'status' in error && error.status === 404) {
          core.debug(`Label '${label}' was not present on ${this.issueType} #${issue_number}.`);
          continue;
        }

        labelErrors.push({ label: label, error: error });
      }
    }

    if (labelErrors.length > 0) {
      for (const labelError of labelErrors) {
        const errorMessage = labelError.error instanceof Error ? labelError.error.message : String(labelError.error);
        core.debug(`Failed to remove label ${labelError.label}: ${errorMessage}`);
      }

      const erroredLabels = labelErrors.map((e) => e.label).join(', ');

      throw new CheckerError(
        `Failed to remove ${labelErrors.length} label(s): ${erroredLabels}`,
        new AggregateError(labelErrors.map((labelError) => labelError.error))
      );
    }

    core.debug(`Label removing completed for ${this.issueType} #${issue_number}.`);
  }

  /**
   * Validates that required parameters are present.
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

export { IssueUpdater };
