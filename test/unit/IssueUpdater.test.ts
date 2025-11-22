import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { createMockGithubAPI, mockedOctokit } from '../mocks/api-mocks.js';
import { IssueUpdater } from '@/IssueUpdater.js';
import { IssueData } from '@/types.js';
import { IssueComment, MockIssueUpdater } from '../mocks/types.js';

describe('IssueUpdater', () => {
  const IS_PR = github.context.eventName === 'pull_request';
  const CHECKER_SIGNATURE = '<!-- dependency-checker-action -->';

  /**
   * The object representing a Pull Request's body with dependencies.
   */
  const getBodyWithDependencies = (isPR: boolean): IssueComment => ({
    user: { login: 'github-actions[bot]' },
    body: `${CHECKER_SIGNATURE}
## ⚠️ Blocking Dependencies Found

This ${isPR ? 'Pull Request' : 'Issue'} should not be ${isPR ? 'merged' : 'resolved'} until the following dependencies are resolved:

- [PR #123](https://github.com/owner/repo/pull/123): Fix critical bug
- [Issue #456](https://github.com/owner/repo/issues/456): Add new feature

---
*This is an automated message. Please resolve the above dependencies, if any.*
<!-- DO NOT EDIT THIS COMMENT! IT WILL BREAK THE DEPENDENCY CHECKER. -->`,
  });

  /**
   * Represents a list of dependencies.
   */
  const newDependencies: IssueData[] = [
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

  describe('createCommentBody', () => {
    it('should generate correct comment body for no dependencies', () => {
      const result = (updater as unknown as MockIssueUpdater).createCommentBody([]);

      expect(result).toContain('✅ All Dependencies Resolved');
      expect(result).toContain('no blocking dependencies');
    });

    it('should generate correct comment body with dependencies', () => {
      const result = (updater as unknown as MockIssueUpdater).createCommentBody(newDependencies);

      expect(result).toContain(CHECKER_SIGNATURE);
      expect(result).toContain('⚠️ Blocking Dependencies Found');
      expect(result).toContain('PR #888');
    });
  });

  describe('updateIssue', () => {
    /**
     * Wraps a given callback function with a mocked value for the `createCommentBody` method.
     *
     * This allows tests to control the output of the `createCommentBody` method, and ensures that the spy is restored
     * after the test.
     *
     * @template T - The return type of the callback function
     * @param {() => Promise<T>} callback - The function to wrap with the mocked `createCommentBody` method.
     * @param {string} returnValue - The value to return from the mocked `createCommentBody` method.
     * @returns {Promise<T>} - The result of the wrapped function.
     */
    const withMockedBotComment = async <T>(callback: () => Promise<T>, returnValue: string): Promise<T> => {
      const spy = vi.spyOn(IssueUpdater.prototype, 'createCommentBody' as never) as MockInstance;

      spy.mockReturnValue(returnValue);

      try {
        return await callback();
      } finally {
        spy.mockRestore();
      }
    };

    /**
     * Asserts that the `core.info` function was called with the expected arguments for a changed dependency.
     *
     * @param {boolean} isPR - Whether the dependency is a pull request or an issue.
     */
    const assertCoreOutputForChanged = (isPR: boolean) => {
      const type = isPR ? 'Pull Request' : 'Issue';

      expect(core.info).toHaveBeenCalledWith(expect.stringContaining(`Creating a comment on ${type}`));
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining(`Updating ${type} #999 successfully finished.`));
    };

    describe('changed dependencies', () => {
      /**
       * Mocks the POST requests for creating a comment and adding a label.
       */
      const mockPostRequests = () => {
        mockApi.mockIssuePostRequest('test-owner', 'test-repo', 999, 201);
        mockApi.mockIssuePostRequest('test-owner', 'test-repo', 999, 200);
      };

      it('should create bot comment when it does not exist', async () => {
        // Mock listComments to return empty array (no existing comments) and POST requests.
        mockApi.mockListComments('test-owner', 'test-repo', 999, { code: 200, data: [] });
        mockPostRequests();

        await updater.updateIssue(newDependencies);

        expect(core.info).toHaveBeenCalledWith(expect.stringContaining('The dependencies have been changed.'));
        assertCoreOutputForChanged(IS_PR);
        expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Adding blocked label'));
      });

      it('should create new bot comment when dependencies differ from last bot comment', async () => {
        // Mock listComments to return existing bot comment and POST requests.
        mockApi.mockListComments('test-owner', 'test-repo', 999, { code: 200, data: [getBodyWithDependencies(IS_PR)] });
        mockPostRequests();

        // Call method updateIssue with mocked new bot comment.
        await withMockedBotComment(() => updater.updateIssue(newDependencies), 'Mocked comment body');

        assertCoreOutputForChanged(IS_PR);
        expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Adding blocked label'));
      });
    });

    it('should create a bot comment if all dependencies are resolved', async () => {
      // Mock listComments to return existing bot comment.
      mockApi.mockListComments('test-owner', 'test-repo', 999, { code: 200, data: [getBodyWithDependencies(IS_PR)] });

      // Mock API responses for creating a comment and removing a label.
      mockApi.mockIssuePostRequest('test-owner', 'test-repo', 999, 201);
      mockApi.mockIssueDeleteRequest('test-owner', 'test-repo', 999, 200);

      await updater.updateIssue([]);

      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('All dependencies have been resolved.'));
      assertCoreOutputForChanged(IS_PR);
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Removing blocked label'));
    });

    it('should not create a new comment when the dependencies have not been changed', async () => {
      // Mock listComments to return an existing bot comment and POST requests.
      mockApi.mockListComments('test-owner', 'test-repo', 999, { code: 200, data: [getBodyWithDependencies(IS_PR)] });
      mockApi.mockIssuePostRequest('test-owner', 'test-repo', 999, 200);

      // Call method updateIssue with mocked new bot comment.
      await withMockedBotComment(() => updater.updateIssue(newDependencies), getBodyWithDependencies(IS_PR).body ?? '');

      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('The dependencies have not been changed.'));
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Adding blocked label'));
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('Updating Pull Request #999 successfully finished.')
      );
    });
  });

  describe('error handling', () => {
    it('should log error when an API call fails', async () => {
      // Mock listComments to result in a fail.
      mockApi.mockListComments('test-owner', 'test-repo', 999, { code: 404 });

      await expect(updater.updateIssue(newDependencies)).rejects.toThrow();

      expect(core.error).toHaveBeenCalledWith(expect.stringMatching('Error updating Pull Request.'));
    });
  });
});
