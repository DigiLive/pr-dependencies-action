import * as core from '@actions/core';
import * as github from '@actions/github';
import { isPullRequest, IssueData } from './types.js';
import { Octokit } from '@octokit/rest';
import { PR_LABEL } from './config.js';

/**
 * Handles pull request updates by commenting and labeling.
 */
class PRUpdater {
  private readonly octokit: Octokit;
  private readonly context: typeof github.context;

  /**
   * Initializes a new PRUpdater instance.
   *
   * @param {Octokit} octokit - an Octokit instance.
   * @param {typeof github.context} context - the GitHub context for the action.
   *
   * @throws {Error} If the context is missing required information.
   */
  constructor(octokit: Octokit, context: typeof github.context) {
    this.octokit = octokit;
    this.context = context;

    this.validateContext();
  }

  /**
   * Updates a pull request with dependency information.
   *
   * Adds a comment when the Pull Request's dependencies have been changed.
   * While dependencies are still open, the Pull Request is labeled as blocked.
   *
   * @param {IssueData[]} dependencies - an array of dependencies.
   * @returns {Promise<void>} - a promise that resolves when the update is complete.
   */
  async updatePR(dependencies: IssueData[]): Promise<void> {
    const { owner, repo } = this.context.repo;
    const { number: issue_number } = this.context.issue;

    core.info(`Updating Pull Request #${issue_number} with ${dependencies?.length || 0} dependencies`);

    try {
      const hasDependencies = dependencies?.length > 0;
      const newComment = this.createCommentBody(dependencies);

      // Get Pull Request comments.
      const { data: comments } = await this.octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number,
      });

      // Find the most recent comment of this action.
      const lastBotComment = [...comments]
        .reverse()
        .find(
          (comment) =>
            comment.user?.login === 'github-actions[bot]' && comment.body?.includes('<!-- pr-dependencies-action -->')
        );

      // Only add a new comment if there isn't already an identical one
      if (!lastBotComment || lastBotComment.body !== newComment) {
        core.info('  The dependencies have been changed. Adding a comment...');

        if (hasDependencies) {
          await this.createComment(newComment);
          await this.addBlockedLabel();
        } else {
          core.notice('All dependencies have been resolved.');

          // Only add a comment if there was a previous blocking comment
          if (lastBotComment) {
            await this.createComment(newComment);
          }
          await this.removeBlockedLabel();
        }
      } else {
        core.info('  The dependencies have not been changed.');

        if (hasDependencies) {
          await this.addBlockedLabel();
        } else {
          await this.removeBlockedLabel();
        }
      }

      core.info(`Updating Pull Request #${issue_number} successfully finished.`);
    } catch (error) {
      core.error('Error updating Pull Request.');
      throw error;
    }
  }

  /**
   * Creates a comment-body based on the given dependencies.
   *
   * If there are no dependencies, a body with a success message is returned.
   * Otherwise, a body is generated with a list of the blocking dependencies.
   *
   * @param {IssueData[]} dependencies - an array of dependencies.
   * @returns {string} - a comment-body.
   */
  private createCommentBody(dependencies: IssueData[]): string {
    const signature = '<!-- pr-dependencies-action -->';

    let comment = `${signature}\n`;

    if (!dependencies?.length) {
      comment += '## ✅ All Dependencies Resolved\n\nThis Pull Request has no blocking dependencies.';
    } else {
      comment += '## ⚠️ Blocking Dependencies Found\n\n';
      comment += 'This Pull Request cannot be merged until the following dependencies are resolved:\n\n';

      dependencies.forEach((dependency) => {
        const dependencyType = isPullRequest(dependency) ? 'PR' : 'Issue';
        comment += `- [${dependencyType} #${dependency.number}](${dependency.html_url}) – ${dependency.title}\n`;
      });
    }

    comment += '\n---\n*This is an automated message. Please resolve the above dependencies, if any.*';
    comment += '\n<!-- DO NOT EDIT THIS COMMENT! IT WILL BREAK THE DEPENDENCY CHECKER. -->';

    core.debug(`Generated comment body: ${comment.substring(0, 50)}...`);
    return comment;
  }

  /**
   * Creates a comment on the Pull Request with the given body.
   *
   * @param {string} comment - the body of the comment.
   * @throws {Error} - if the comment cannot be created.
   */
  private async createComment(comment: string) {
    const { owner, repo } = this.context.repo;
    const { number: issue_number } = this.context.issue;

    core.info('  Creating a comment on Pull Request...');

    try {
      await this.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number,
        body: comment,
      });
      core.debug('Successfully created a comment on Pull Request.');
    } catch (error) {
      core.error(`Failed to create comment on Pull Request #${issue_number}: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Adds the 'blocked' label to the Pull Request, creating it if it does not exist.
   *
   * @throws {Error} - if adding the label failed.
   */
  private async addBlockedLabel() {
    const { owner, repo } = this.context.repo;
    const { number: issue_number } = this.context.issue;

    core.info(`  Adding ${PR_LABEL} label...`);

    try {
      await this.octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number,
        labels: [PR_LABEL],
      });

      core.debug(`Label operation completed for Pull Request #${issue_number}.`);
    } catch (error) {
      core.error(`Error adding ${PR_LABEL} label.`);
      throw error;
    }
  }

  /**
   * Removes the 'blocked' label from the Pull Request.
   *
   * @throws {Error} - if removing the label failed.
   */
  private async removeBlockedLabel() {
    const { owner, repo } = this.context.repo;
    const { number: issue_number } = this.context.issue;

    core.info(`  Removing ${PR_LABEL} label...`);

    try {
      await this.octokit.rest.issues.removeLabel({
        owner,
        repo,
        issue_number,
        name: PR_LABEL,
      });

      core.debug(`Label operation completed for Pull Request #${issue_number}`);
    } catch (error) {
      core.error(`Error removing ${PR_LABEL} label.`);
      throw error;
    }
  }

  /**
   * Validates that required parameters are present.
   *
   * @private
   * @throws {Error} If required parameters are missing.
   */
  private validateContext() {
    const { repo, issue } = this.context;

    if (!repo?.owner || !repo?.repo || !issue?.number) {
      throw new Error('Missing required GitHub context information');
    }
  }
}

export { PRUpdater };
