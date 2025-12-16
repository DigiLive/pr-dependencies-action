import * as core from '@actions/core';
import * as github from '@actions/github';
import { APIIssue, APIPullRequest, DependencyTag, GitHubIssue, isPullRequest } from './types.js';
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
  public dependencies: (APIIssue | APIPullRequest)[] = [];
  public dependents: (APIIssue | APIPullRequest)[] = [];
  private readonly octokit: Octokit;
  private readonly issue: GitHubIssue;
  private readonly issueType: string;

  /**
   * Initializes a new instance.
   *
   * @param {Octokit} octokit - An Octokit instance.
   * @param {GitHubIssue} issue - The issue to update.
   *
   * @throws {CheckerError} If the GitHub context is invalid.
   */
  constructor(octokit: Octokit, issue: GitHubIssue) {
    this.octokit = octokit;
    this.issue = issue;
    this.issueType = isPullRequest(issue) ? 'Pull Request' : 'Issue';
  }

  /**
   * Updates the issue with dependency and dependent information.
   *
   * Adds a comment when the issue's dependencies/dependents have been changed or resolved.
   * While dependencies/dependents are still open, the issue is labeled as blocked.
   *
   * @returns {Promise<void>} - a promise that resolves when the update is complete.
   * @throws {CheckerError} - when an unexpected error occurs during the update process.
   */
  async updateIssue(): Promise<void> {
    core.info(
      `Updating ${this.issueType} #${this.issue.number} with ${this.dependencies.length} dependencies. and ${this.dependents.length} dependents.`
    );

    try {
      await this.handleDependencyUpdate();

      core.info(`Updating ${this.issueType} #${this.issue.number} successfully finished.`);
    } catch (error) {
      if (!(error instanceof CheckerError)) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        core.debug(`Unexpected error: ${errorMessage}`);
      }

      throw new CheckerError(`Error updating ${this.issueType} #${this.issue.number}.`, error);
    }
  }

  /**
   * Finds the last bot comment on a given issue.
   *
   * The function searches through the comments of the issue in reverse order, looking for a comment
   * created by the 'github-actions[bot]' user that contains this class's signature.
   * If such a comment is found, it is returned. Otherwise, the function returns undefined.
   *
   * @param {GitHubIssue} issue The issue to find the last bot comment for.
   * @returns {Promise<{body?: string} | undefined>} - a promise that resolves with the last bot comment.
   * @throws {Error} - when an unexpected error occurs while retrieving the issue's comments.
   */
  async findLastBotComment(issue: GitHubIssue): Promise<{ body?: string } | undefined> {
    try {
      const { data: comments } = await this.octokit.rest.issues.listComments(this.getIssueInfo(issue));

      return comments
        .slice()
        .reverse()
        .find(
          (comment) => comment.user?.login === 'github-actions[bot]' && comment.body?.includes(IssueUpdater.SIGNATURE)
        );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      core.debug(`Failed to fetch comments for ${this.issueType} #${issue.number}: ${errorMessage}`);

      throw new CheckerError(`Failed to fetch comments for ${this.issueType} #${issue.number}`, error);
    }
  }

  /**
   * Extracts repository and issue number from a given issue.
   *
   * @param {GitHubIssue} issue - The issue to extract information from.
   * @returns {DependencyTag} An object containing repository and issue information.
   */
  private getIssueInfo(issue: GitHubIssue): DependencyTag {
    if ('repository' in issue) {
      return {
        owner: issue.repository!.owner.login,
        repo: issue.repository!.name,
        issue_number: issue.number,
      };
    }

    return {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: issue.number,
    };
  }

  /**
   * Handles the dependency update for the issue.
   *
   * If the comment has not changed, it will not update the issue.
   * If the dependencies have changed, it will add a new comment and block the issue.
   * If all dependencies have been resolved, it will add a new comment (if needed) and unblock the issue.
   *
   * @returns {Promise<void>} - A promise that resolves when the update is complete.
   */
  private async handleDependencyUpdate(): Promise<void> {
    const hasDependencies = this.dependencies.length > 0;
    const hasDependents = this.dependents.length > 0;
    const lastBotComment = await this.findLastBotComment(this.issue);
    const newComment = this.createCommentBody();
    const commentChanged = !lastBotComment || lastBotComment.body !== newComment;
    const currentLabels = 'labels' in this.issue ? this.issue.labels?.map(label =>
      typeof label === 'string' ? label : label.name
    ) || [] : [];
    const labelsToAdd = [
      ...(hasDependencies && !currentLabels.includes(BLOCKED_LABEL) ? [BLOCKED_LABEL] : []),
      ...(hasDependents && !currentLabels.includes(BLOCKING_LABEL) ? [BLOCKING_LABEL] : [])
    ];
    const labelsToRemove = [
      ...(!hasDependencies && currentLabels.includes(BLOCKED_LABEL) ? [BLOCKED_LABEL] : []),
      ...(!hasDependents && currentLabels.includes(BLOCKING_LABEL) ? [BLOCKING_LABEL] : [])
    ];

    if (!commentChanged) {
      core.info('  The dependencies/dependents have not been changed.');
      return;
    }

    if (hasDependencies || hasDependents) {
      core.info('  The dependencies/dependents have been changed.');
      await this.postComment(newComment);
      await this.addLabels(labelsToAdd);
      await this.removeLabels(labelsToRemove);
      return;
    }

    core.info('  All dependencies/dependents have been resolved.');
    if (lastBotComment) await this.postComment(newComment);
    await this.removeLabels(labelsToRemove);
  }

  /**
   * Generates a comment body based on the issue's dependencies and dependents.
   *
   * @returns {string} - the comment body.
   */
  private createCommentBody(): string {
    let comment = `${IssueUpdater.SIGNATURE}\n`;

    comment += `${this.createDependenciesMessage()}\n${this.createDependentsMessage()}\n`;

    comment += '\n<sub>*This is an automated message. Please resolve the above dependencies and dependents, if any.*</sub>\n';
    comment += '<!-- DO NOT EDIT THIS COMMENT! IT WILL BREAK THE DEPENDENCY CHECKER. -->';

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
      comment += `## ✅ No Blocked Dependents.\n\nThis ${this.issueType} is not blocking any dependent.`;
    } else {
      comment += '## ⚠️ Blocked Dependents Found\n\n';
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
    core.info(`  Posting a comment to ${this.issueType} #${this.issue.number}...`);

    try {
      await this.octokit.rest.issues.createComment({
        ...this.getIssueInfo(this.issue),
        body: comment,
      });

      core.debug('Successfully posted a comment.');
    } catch (error) {
      const errorInstance = error instanceof Error;
      const errorMessage = errorInstance ? error.message : String(error);

      core.debug(`Failed to post a comment on ${this.issueType} #${this.issue.number}: ${errorMessage}`);
      throw new CheckerError(`Failed to post a comment on ${this.issueType} #${this.issue.number}.`, error);
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

    core.info(`  Adding labels: ${labels.join(', ')}...`);

    try {
      await this.octokit.rest.issues.addLabels({
        ...this.getIssueInfo(this.issue),
        labels: labels,
      });

      core.debug(`Label adding completed for ${this.issueType} #${this.issue.number}.`);
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

    const labelErrors = [];

    core.info(`  Removing labels: ${labels.join(', ')}...`);

    for (const label of labels) {
      try {
        await this.octokit.rest.issues.removeLabel({
          ...this.getIssueInfo(this.issue),
          name: label,
        });
      } catch (error) {
        const errorInstance = error instanceof Error;

        if (errorInstance && 'status' in error && error.status === 404) {
          core.debug(`Label '${label}' was not present on ${this.issueType} #${this.issue.number}.`);
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

    core.debug(`Label removing completed for ${this.issueType} #${this.issue.number}.`);
  }
}

export { IssueUpdater };
