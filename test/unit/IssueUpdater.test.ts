import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { createMockGithubAPI, mockedOctokit } from '../mocks/api-mocks.js';
import { IssueUpdater } from '@/IssueUpdater.js';
import { IssueData } from '@/types.js';
import { IssueComment, MockIssueUpdater } from '../mocks/types.js';
import { CheckerError } from '@/CheckerError.js';

describe('IssueUpdater', () => {
  const CURRENT_ISSUE_TYPE = github.context.eventName === 'pull_request' ? 'Pull Request' : 'Issue';
  const CURRENT_IS_PR = github.context.eventName === 'pull_request';
  const CHECKER_SIGNATURE = '<!-- dependency-checker-action -->';

  /**
   * The object representing a bot-comment.
   */
  const getBotComment = (): IssueComment => ({
    user: { login: 'github-actions[bot]' },
    body: `${CHECKER_SIGNATURE}
## ⚠️ Blocking Dependencies Found

This ${CURRENT_ISSUE_TYPE} should not be ${CURRENT_IS_PR ? 'merged' : 'resolved'} until the following dependencies are resolved:

- [PR #123](https://github.com/owner/repo/pull/123): Fix critical bug
- [Issue #456](https://github.com/owner/repo/issues/456): Add new feature

---
*This is an automated message. Please resolve the above dependencies, if any.*
<!-- DO NOT EDIT THIS COMMENT! IT WILL BREAK THE DEPENDENCY CHECKER. -->`,
  });

  /**
   * Represents a list of dependencies/dependents.
   */
  const newDeps: IssueData[] = [
    {
      number: 888,
      title: 'Dependency Pull Request',
      html_url: 'https://github.com/owner/repo/pull/888',
      pull_request: {},
    } as IssueData,
  ];

  let mockApi: ReturnType<typeof createMockGithubAPI>;
  let updater: IssueUpdater;

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = createMockGithubAPI();
    updater = new IssueUpdater(mockedOctokit, github.context);
  });

  afterEach(() => {
    mockApi.done();
  });

  /**
   * Returns a CheckerError and its original error if the promise rejects.
   *
   * @template T - The type of the original error (defaults to Error)
   * @param {Promise<unknown>} promise - the promise to wait for.
   * @returns {Promise<{error: CheckerError, originalError: T}>} Object containing the caught CheckerError and its original error
   */
  async function getCheckerError<T = Error>(
    promise: Promise<unknown>
  ): Promise<{ error: CheckerError; originalError: T }> {
    try {
      await promise;
      throw new Error('Expected promise to reject');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(CheckerError);
      const checkerError = error as CheckerError;
      expect(checkerError.originalError).toBeDefined();
      return {
        error: checkerError,
        originalError: checkerError.originalError as T,
      };
    }
  }

  describe('updateIssue', () => {
    it('should result in a successful update', async () => {
      (updater as unknown as MockIssueUpdater).handleDependencyUpdate = vi.fn().mockResolvedValue(undefined);

      await updater.updateIssue();

      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining(
          `Updating Pull Request #${github.context.issue.number} with 0 dependencies. and 0 dependants.`
        )
      );
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining(`Updating Pull Request #${github.context.issue.number} successfully finished.`)
      );
    });

    it('should result in a failed update', async () => {
      (updater as unknown as MockIssueUpdater).handleDependencyUpdate = vi
        .fn()
        .mockRejectedValue(new Error('Mock Error'));

      const { error, originalError } = await getCheckerError<CheckerError>(updater.updateIssue());

      expect(error.message).toBe(`Error updating ${CURRENT_ISSUE_TYPE} #${github.context.issue.number}.`);
      expect(originalError.message).toBe(`Mock Error`);

      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining(
          `Updating Pull Request #${github.context.issue.number} with 0 dependencies. and 0 dependants.`
        )
      );
      expect(core.info).not.toHaveBeenCalledWith(
        expect.stringContaining(`Updating Pull Request #${github.context.issue.number} successfully finished.`)
      );
    });
  });

  describe('handleDependencyUpdate', () => {
    let mockUpdater: MockIssueUpdater;

    beforeEach(() => {
      // Default mocks
      mockUpdater = updater as unknown as MockIssueUpdater;
      mockUpdater.findLastBotComment = vi.fn().mockResolvedValue(undefined);
      mockUpdater.createCommentBody = vi.fn().mockResolvedValue(undefined);
      mockUpdater.postComment = vi.fn().mockResolvedValue(undefined);
      mockUpdater.addLabels = vi.fn().mockResolvedValue(undefined);
      mockUpdater.removeLabels = vi.fn().mockResolvedValue(undefined);
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    it('should log no changes', async () => {
      mockUpdater.findLastBotComment = vi.fn().mockResolvedValue('Mock Comment');
      mockUpdater.createCommentBody = vi.fn().mockResolvedValue('Mock Comment');

      updater.dependencies = newDeps;
      await (updater as unknown as MockIssueUpdater).handleDependencyUpdate();

      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('The dependencies/dependents have been changed.'));
    });

    it('should log changes', async () => {
      updater.dependencies = newDeps;
      await (updater as unknown as MockIssueUpdater).handleDependencyUpdate();

      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('The dependencies/dependents have been changed.'));
    });

    it('should log all resolved', async () => {
      await (updater as unknown as MockIssueUpdater).handleDependencyUpdate();

      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('All dependencies/dependents have been resolved.')
      );
    });
  });

  describe('findLastBotComment', () => {
    it('should return no bot-comment', async () => {
      mockApi.mockListComments('test-owner', 'test-repo', github.context.issue.number, {
        code: 200,
        data: [],
      });

      const result = await (updater as unknown as MockIssueUpdater).findLastBotComment();

      expect(result).toBe(undefined);
    });

    it('should return a new bot-comment', async () => {
      mockApi.mockListComments('test-owner', 'test-repo', github.context.issue.number, {
        code: 200,
        data: [getBotComment()],
      });

      const result = await (updater as unknown as MockIssueUpdater).findLastBotComment();

      expect(result).toStrictEqual(getBotComment());
    });

    it('should return a cached bot-comment', async () => {
      mockApi.mockListComments('test-owner', 'test-repo', github.context.issue.number, {
        code: 200,
        data: [getBotComment()],
      });

      const firstResult = await (updater as unknown as MockIssueUpdater).findLastBotComment(true);
      const secondResult = await (updater as unknown as MockIssueUpdater).findLastBotComment();

      expect(secondResult).toStrictEqual(firstResult);
    });

    it('should throw an error', async () => {
      mockApi.mockListComments('test-owner', 'test-repo', github.context.issue.number, {
        code: 500,
        data: [],
      });

      const { error, originalError } = await getCheckerError<CheckerError>(
        (updater as unknown as MockIssueUpdater).findLastBotComment()
      );

      expect(error.message).toBe(`Failed to fetch comments for ${CURRENT_ISSUE_TYPE} #${github.context.issue.number}`);
      // Assert for the constructor's name because instanceOf is unreliable in this environment.
      expect(originalError.constructor.name).toBe('RequestError');
    });
  });

  describe('createCommentBody', () => {
    it('should generate comment body for no dependencies', () => {
      const result = (updater as unknown as MockIssueUpdater).createCommentBody();

      expect(result).toContain('✅ All Dependencies Resolved');
      expect(result).toContain('✅ All Dependents Resolved');
    });

    const testCases = [
      {
        name: 'dependencies',
        property: 'dependencies' as const,
        expectedText: '⚠️ Blocking Dependencies Found',
      },
      {
        name: 'dependents',
        property: 'dependents' as const,
        expectedText: '⚠️ Blocked Dependents Found',
      },
    ];

    test.each(testCases)('should generate comment body with $name', ({ property, expectedText }) => {
      updater[property] = newDeps;
      const result = (updater as unknown as MockIssueUpdater).createCommentBody();

      expect(result).toContain(CHECKER_SIGNATURE);
      expect(result).toContain(expectedText);
      expect(result).toContain(`PR #${newDeps[0].number}`);
    });
  });

  describe('createDependenciesMessage', () => {
    it('should generate a resolved message', () => {
      const result = (updater as unknown as MockIssueUpdater).createDependenciesMessage();
      expect(result).toContain('All Dependencies Resolved.');
    });

    it('should generate a dependencies list', () => {
      updater.dependencies = newDeps;
      const result = (updater as unknown as MockIssueUpdater).createDependenciesMessage();

      expect(result).toContain('Blocking Dependencies Found:');
      newDeps.forEach((dependency) => {
        const issueType = 'pull_request' in dependency ? 'PR' : 'Issue';
        expect(result).toContain(`[${issueType} #${dependency.number}](${dependency.html_url}) – ${dependency.title}`);
      });
    });
  });

  describe('createDependentsMessage', () => {
    it('should generate a resolved message', () => {
      const result = (updater as unknown as MockIssueUpdater).createDependentsMessage();
      expect(result).toContain('All Dependents Resolved.');
    });

    it('should generate a dependents list', () => {
      updater.dependents = newDeps;
      const result = (updater as unknown as MockIssueUpdater).createDependentsMessage();

      expect(result).toContain('Blocked Dependents Found:');
      newDeps.forEach((dependency) => {
        const issueType = 'pull_request' in dependency ? 'PR' : 'Issue';
        expect(result).toContain(`[${issueType} #${dependency.number}](${dependency.html_url}) – ${dependency.title}`);
      });
    });
  });

  describe('postComment', () => {
    it('should successfully post a comment', () => {
      // TODO: implement case
    });

    it('should throw an error', () => {
      // TODO: implement case
    });
  });

  describe('addLabels', () => {
    it('should successfully add labels', () => {
      // TODO: implement case
    });

    it('should throw an error', async () => {
      const testUpdater = new IssueUpdater(mockedOctokit, github.context);
      const labels = ['blocked'];

      mockApi.mockIssuePostRequest('test-owner', 'test-repo', github.context.issue.number, 500);

      await expect(
        (testUpdater as unknown as { addLabels: (labels: string[]) => Promise<void> }).addLabels(labels)
      ).rejects.toThrow('Failed to add 1 label(s)');
    });
  });

  describe('removeLabels', () => {
    it('should successfully remove labels', () => {
      // TODO: implement case
    });

    it('should throw an error', async () => {
      const testUpdater = new IssueUpdater(mockedOctokit, github.context);
      const labels = ['blocked'];

      mockApi.mockIssueDeleteRequest('test-owner', 'test-repo', github.context.issue.number, 500);

      await expect(
        (testUpdater as unknown as { removeLabels: (labels: string[]) => Promise<void> }).removeLabels(labels)
      ).rejects.toThrow(`Failed to remove 1 label(s): ${labels.join(', ')}`);
    });

    it('should not throw if removing a non-existing label', async () => {
      const testUpdater = new IssueUpdater(mockedOctokit, github.context);
      const labels = ['blocked'];

      mockApi.mockIssueDeleteRequest('test-owner', 'test-repo', github.context.issue.number, 404);

      await expect(
        (testUpdater as unknown as { removeLabels: (labels: string[]) => Promise<void> }).removeLabels(labels)
      ).resolves.not.toThrow();
    });
  });

  describe('validateContext', () => {
    const originalEventName = github.context.eventName;

    afterEach(() => {
      // Restore original event name after each test
      github.context.eventName = originalEventName;
    });

    it('should not throw an error', () => {

      expect(() => {
        (updater as unknown as { validateContext: () => void }).validateContext();
      }).not.toThrow();
    });

    it('should throw an error', () => {
      const eventName = 'push';
      github.context.eventName = eventName;

      expect(() => {
        (updater as unknown as { validateContext: () => void }).validateContext();
      }).toThrow(`Event name '${eventName}' is not supported. Expected 'pull_request' or 'issues'.`);
    });
  });

  describe('Edge Cases', () => {
    const originalEventName = github.context.eventName;

    describe('with issues event type', () => {
      beforeEach(() => {
        github.context.eventName = 'issues';
        vi.clearAllMocks();
      });

      afterEach(() => {
        github.context.eventName = originalEventName;
      });

      it('should use correct type in messages', () => {
        const result = (
          new IssueUpdater(mockedOctokit, github.context) as unknown as MockIssueUpdater
        ).createDependenciesMessage();

        expect(result).toContain('This Issue has no blocking dependencies.');
      });
    });
  });
});
