import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as core from '@actions/core';
import { createMockGithubAPI, mockedOctokit } from '../mocks/api-mocks.js';
import { IssueUpdater } from '@/IssueUpdater.js';
import { IssueData } from '@/types.js';
import { IssueUpdaterInterface } from '../mocks/types.js';
import { CheckerError } from '@/CheckerError.js';
import { constants } from '../constants/constants.js';
import { createTestBotComment } from '../fixtures/comments.js';
import { testDependencies, testIssue } from '../fixtures/issues.js';

const { CHECKER_SIGNATURE, CURRENT_ISSUE_TYPE } = constants;

describe('IssueUpdater', () => {
  let mockApi: ReturnType<typeof createMockGithubAPI>;
  let updater: IssueUpdater;

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = createMockGithubAPI();
    updater = new IssueUpdater(mockedOctokit, testIssue);
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

      throw new Error(`Promise resolved without throwing a CheckerError.`);
    } catch (error: unknown) {
      expect(error instanceof CheckerError, 'Error instanceof CheckerError = false').toBe(true);

      const checkerError = error as CheckerError;
      expect(checkerError.originalError).toBeDefined();

      return {
        error: checkerError,
        originalError: checkerError.originalError as T,
      };
    }
  }

  describe('getIssueInfo', () => {
    it('should return a dependency tag', () => {
      const thisIssue = (updater as unknown as IssueUpdaterInterface).issue;

      const result = (updater as unknown as IssueUpdaterInterface).getIssueInfo(thisIssue);

      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        issue_number: testIssue.number,
      });
    });
  });

  describe('updateIssue', () => {
    it('should result in a successful update', async () => {
      (updater as unknown as IssueUpdaterInterface).handleDependencyUpdate = vi.fn().mockResolvedValue(undefined);

      await updater.updateIssue();

      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining(`Updating Pull Request #${testIssue.number} with 0 dependencies. and 0 dependents.`)
      );
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining(`Updating Pull Request #${testIssue.number} successfully finished.`)
      );
    });

    it('should result in a failed update', async () => {
      (updater as unknown as IssueUpdaterInterface).handleDependencyUpdate = vi
        .fn()
        .mockRejectedValue(new Error('Mock Error'));

      const { error, originalError } = await getCheckerError<CheckerError>(updater.updateIssue());

      expect(error.message).toBe(`Error updating ${CURRENT_ISSUE_TYPE} #${testIssue.number}.`);
      expect(originalError.message).toBe(`Mock Error`);

      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining(`Updating Pull Request #${testIssue.number} with 0 dependencies. and 0 dependents.`)
      );
      expect(core.info).not.toHaveBeenCalledWith(
        expect.stringContaining(`Updating Pull Request #${testIssue.number} successfully finished.`)
      );
    });
  });

  describe('handleDependencyUpdate', () => {
    let mockUpdater: IssueUpdaterInterface;

    beforeEach(() => {
      // Default mocks
      mockUpdater = updater as unknown as IssueUpdaterInterface;
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

      updater.dependencies = testDependencies;
      await (updater as unknown as IssueUpdaterInterface).handleDependencyUpdate();

      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('The dependencies/dependents have been changed.'));
    });

    it('should log changes', async () => {
      updater.dependencies = testDependencies;
      await (updater as unknown as IssueUpdaterInterface).handleDependencyUpdate();

      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('The dependencies/dependents have been changed.'));
    });

    it('should log all resolved', async () => {
      await (updater as unknown as IssueUpdaterInterface).handleDependencyUpdate();

      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('All dependencies/dependents have been resolved.')
      );
    });
  });

  describe('findLastBotComment', () => {
    let thisIssue: IssueData;

    beforeEach(() => {
      thisIssue = (updater as unknown as IssueUpdaterInterface).issue;
    });

    it('should return no bot-comment', async () => {
      mockApi.mockListComments('owner', 'repo', testIssue.number, {
        code: 200,
        data: [],
      });

      const result = await (updater as unknown as IssueUpdaterInterface).findLastBotComment(thisIssue);

      expect(result).toBe(undefined);
    });

    it('should return a new bot-comment', async () => {
      mockApi.mockListComments('owner', 'repo', testIssue.number, {
        code: 200,
        data: [createTestBotComment()],
      });

      const result = await (updater as unknown as IssueUpdaterInterface).findLastBotComment(thisIssue);

      expect(result).toStrictEqual(createTestBotComment());
    });

    it('should throw an error', async () => {
      mockApi.mockListComments('owner', 'repo', testIssue.number, {
        code: 500,
        data: [],
      });

      const { error, originalError } = await getCheckerError<CheckerError>(
        (updater as unknown as IssueUpdaterInterface).findLastBotComment(thisIssue)
      );

      expect(error.message).toBe(`Failed to fetch comments for ${CURRENT_ISSUE_TYPE} #${testIssue.number}`);
      // Assert for the constructor's name because instanceOf is unreliable in this environment.
      expect(originalError.constructor.name).toBe('RequestError');
    });
  });

  describe('createCommentBody', () => {
    it('should generate comment body for no dependencies', () => {
      const result = (updater as unknown as IssueUpdaterInterface).createCommentBody();

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
      updater[property] = testDependencies;
      const result = (updater as unknown as IssueUpdaterInterface).createCommentBody();

      expect(result).toContain(CHECKER_SIGNATURE);
      expect(result).toContain(expectedText);
      expect(result).toContain(`PR #${testDependencies[0].number}`);
    });
  });

  describe('createDependenciesMessage', () => {
    it('should generate a resolved message', () => {
      const result = (updater as unknown as IssueUpdaterInterface).createDependenciesMessage();
      expect(result).toContain('All Dependencies Resolved.');
    });

    it('should generate a dependencies list', () => {
      updater.dependencies = testDependencies;
      const result = (updater as unknown as IssueUpdaterInterface).createDependenciesMessage();

      expect(result).toContain('Blocking Dependencies Found:');
      testDependencies.forEach((dependency) => {
        const issueType = 'pull_request' in dependency ? 'PR' : 'Issue';
        expect(result).toContain(`[${issueType} #${dependency.number}](${dependency.html_url}) – ${dependency.title}`);
      });
    });
  });

  describe('createDependentsMessage', () => {
    it('should generate a resolved message', () => {
      const result = (updater as unknown as IssueUpdaterInterface).createDependentsMessage();
      expect(result).toContain('All Dependents Resolved.');
    });

    it('should generate a dependents list', () => {
      updater.dependents = testDependencies;
      const result = (updater as unknown as IssueUpdaterInterface).createDependentsMessage();

      expect(result).toContain('Blocked Dependents Found:');
      testDependencies.forEach((dependency) => {
        const issueType = 'pull_request' in dependency ? 'PR' : 'Issue';
        expect(result).toContain(`[${issueType} #${dependency.number}](${dependency.html_url}) – ${dependency.title}`);
      });
    });
  });

  describe('postComment', () => {
    it('should successfully post a comment', async () => {
      mockApi.mockIssuePostRequest('owner', 'repo', testIssue.number, 200);

      await (updater as unknown as IssueUpdaterInterface).postComment('Mock Comment');

      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining(`Posting a comment to ${CURRENT_ISSUE_TYPE} #${testIssue.number}...`)
      );
    });

    it('should throw an error', async () => {
      mockApi.mockIssuePostRequest('owner', 'repo', testIssue.number, 500);

      const { error, originalError } = await getCheckerError<CheckerError>(
        (updater as unknown as IssueUpdaterInterface).postComment('Mock Comment')
      );

      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining(`Posting a comment to ${CURRENT_ISSUE_TYPE} #${testIssue.number}...`)
      );
      expect(error.message).toBe(`Failed to post a comment on ${CURRENT_ISSUE_TYPE} #${testIssue.number}.`);
      // Assert for the constructor's name because instanceOf is unreliable in this environment.
      expect(originalError.constructor.name).toBe('RequestError');
    });
  });

  describe('addLabels', () => {
    it('should successfully add labels', async () => {
      const labels = ['blocked'];

      mockApi.mockIssuePostRequest('owner', 'repo', testIssue.number, 200);

      await (updater as unknown as IssueUpdaterInterface).addLabels(labels);

      expect(core.info).toHaveBeenCalledWith(expect.stringContaining(`Adding labels: ${labels.join(', ')}`));
    });

    it('should throw an error', async () => {
      const testUpdater = new IssueUpdater(mockedOctokit, testIssue);
      const labels = ['blocked'];

      mockApi.mockIssuePostRequest('owner', 'repo', testIssue.number, 500);

      await expect(
        (testUpdater as unknown as { addLabels: (labels: string[]) => Promise<void> }).addLabels(labels)
      ).rejects.toThrow(`Failed to add ${labels.length} label(s)`);
    });
  });

  describe('removeLabels', () => {
    it('should successfully remove labels', async () => {
      const labels = ['blocked'];

      mockApi.mockIssueDeleteRequest('owner', 'repo', testIssue.number, 200);

      await (updater as unknown as IssueUpdaterInterface).removeLabels(labels);

      expect(core.info).toHaveBeenCalledWith(expect.stringContaining(`Removing labels: ${labels.join(', ')}`));
    });

    it('should throw an error', async () => {
      const testUpdater = new IssueUpdater(mockedOctokit, testIssue);
      const labels = ['blocked'];

      mockApi.mockIssueDeleteRequest('owner', 'repo', testIssue.number, 500);

      await expect(
        (testUpdater as unknown as { removeLabels: (labels: string[]) => Promise<void> }).removeLabels(labels)
      ).rejects.toThrow(`Failed to remove 1 label(s): ${labels.join(', ')}`);
    });

    it('should not throw if removing a non-existing label', async () => {
      const testUpdater = new IssueUpdater(mockedOctokit, testIssue);
      const labels = ['blocked'];

      mockApi.mockIssueDeleteRequest('owner', 'repo', testIssue.number, 404);

      await expect(
        (testUpdater as unknown as { removeLabels: (labels: string[]) => Promise<void> }).removeLabels(labels)
      ).resolves.not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    describe('with issues event type', () => {
      it('should use correct type in messages', () => {
        const { pull_request: _, ...issueWithoutPR } = testIssue;

        const result = (
          new IssueUpdater(mockedOctokit, issueWithoutPR) as unknown as IssueUpdaterInterface
        ).createDependenciesMessage();

        expect(result).toContain('This Issue has no blocking dependencies.');
      });
    });
  });
});
