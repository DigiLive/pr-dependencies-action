import * as core from '@actions/core';
import * as github from '@actions/github';
import { isPullRequest, IssueData, PullRequestData } from './types.js';
import { Octokit } from '@octokit/rest';

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
   * Adds a comment when the PR's dependencies have been changed.
   * While dependencies are still open, the PR is labeled as blocked.
   *
   * @param {PullRequestData} pullRequest - the pull request to update.
   * @param {IssueData[]} dependencies - an array of dependencies.
   * @returns {Promise<void>} - a promise that resolves when the update is complete.
   */
  async updatePR(pullRequest: PullRequestData, dependencies: IssueData[]): Promise<void> {
    const { owner, repo } = this.context.repo;
    const { number: issue_number } = this.context.issue;

    core.info(`Updating PR #${issue_number} with ${dependencies?.length || 0} dependencies`);

    try {
      const hasDependencies = dependencies?.length > 0;
      const newComment = this.createCommentBody(dependencies);

      // Get PR comments.
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
        if (hasDependencies) {
          await this.createComment(newComment);
          await this.addBlockedLabel();
        } else {
          // Only add a comment if there was a previous blocking comment
          if (lastBotComment) {
            await this.createComment(newComment);
          }
          await this.removeBlockedLabel();
        }
      } else if (hasDependencies) {
        await this.addBlockedLabel();
      } else {
        await this.removeBlockedLabel();
      }
    } catch (error) {
      core.error(`  Error updating PR: ${(error as Error).message}`);
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
  createCommentBody(dependencies: IssueData[]): string {
    const signature = '<!-- pr-dependencies-action -->';

    let comment = `${signature}\n`;

    if (!dependencies?.length) {
      comment += '## ✅ All Dependencies Resolved\n\nThis PR has no blocking dependencies.';
    } else {
      comment += '## ⚠️ Blocking Dependencies Found\n\n';
      comment += 'This PR cannot be merged until the following dependencies are resolved:\n\n';

      dependencies.forEach((dependency) => {
        const dependencyType = isPullRequest(dependency) ? 'PR' : 'Issue';
        comment += `- [${dependencyType} #${dependency.number}](${dependency.html_url}): ${dependency.title}\n`;
      });
    }

    comment += '\n---\n*This is an automated message. Please resolve the above dependencies, if any.*';
    comment += '\n<!-- DO NOT EDIT THIS COMMENT! IT WILL BREAK THE DEPENDENCY CHECKER. -->';

    core.debug(`Generated comment body: ${comment.substring(0, 50)}...`);
    return comment;
  }

  /**
   * Creates a comment on the PR with the given body.
   *
   * @param {string} comment - the body of the comment.
   * @throws {Error} - if the comment cannot be created.
   */
  async createComment(comment: string) {
    const { owner, repo } = this.context.repo;
    const { number: issue_number } = this.context.issue;

    core.info('  Creating PR comment...');

    try {
      await this.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number,
        body: comment,
      });
      core.debug('    Successfully created PR comment');
    } catch (error) {
      core.error(`    Failed to create comment on PR #${issue_number}: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Adds the 'blocked' label to the PR, creating it if it does not exist.
   *
   * @throws {Error} - if adding the label failed.
   */
  async addBlockedLabel() {
    const { owner, repo } = this.context.repo;
    const { number: issue_number } = this.context.issue;

    core.info('  Adding blocked label...');

    try {
      await this.octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number,
        labels: ['blocked'],
      });

      core.debug(`Label operation completed for PR #${issue_number}`);
    } catch (error) {
      core.error(`    Error adding 'blocked' label: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Removes the 'blocked' label from the PR.
   *
   * @throws {Error} - if removing the label failed.
   */
  async removeBlockedLabel() {
    const { owner, repo } = this.context.repo;
    const { number: issue_number } = this.context.issue;

    core.info('  Removing blocked label...');

    try {
      await this.octokit.rest.issues.removeLabel({
        owner,
        repo,
        issue_number,
        name: 'blocked',
      });

      core.debug(`    Label operation completed for PR #${issue_number}`);
    } catch (error) {
      core.error(`    Error removing 'blocked' label: ${(error as Error).message}`);
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
