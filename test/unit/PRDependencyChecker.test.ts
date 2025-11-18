import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { createMockGithubAPI, mockedOctokit } from '../mocks/api-mocks.js';
import { PRDependencyChecker } from '@/PRDependencyChecker.js';
import { MockPRDependencyChecker } from '../mocks/types.js';

// Mock PRUpdater.
vi.mock('@/PRUpdater.js', async () => {
  return await import('../mocks/PRUpdater.js');
});

describe('PRDependencyChecker', () => {
  const targetPRNumber = github.context.issue.number;

  let mockApi: ReturnType<typeof createMockGithubAPI>;
  let checker: PRDependencyChecker;

  beforeEach(() => {
    vi.clearAllMocks();

    checker = new PRDependencyChecker(mockedOctokit);
    mockApi = createMockGithubAPI();
  });

  afterEach(() => {
    mockApi.done();
  });

  describe('PR Body Handling', () => {
    it('should handle empty PR body', async () => {
      mockApi.mockGetPR('test-owner', 'test-repo', targetPRNumber, {
        code: 200,
        data: {
          body: '',
        },
      });

      await checker.evaluate();

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining(`Stopping: Pull Request #${targetPRNumber} has an empty body.`)
      );
    });

    it('should handle PR with no dependencies', async () => {
      mockApi.mockGetPR('test-owner', 'test-repo', targetPRNumber, {
        code: 200,
        data: {
          body: 'This PR has no dependencies.',
        },
      });

      await checker.evaluate();

      expect(core.notice).toHaveBeenCalledWith('All dependencies have been resolved!');
      expect(core.setOutput).toHaveBeenCalledWith('has-dependencies', false);
    });
  });

  describe('Dependency Resolution', () => {
    it('should handle PR with open dependencies', async () => {
      mockApi.mockGetPR('test-owner', 'test-repo', targetPRNumber, {
        code: 200,
        data: {
          body: 'Depends on: #123',
        },
      });

      mockApi.mockGetIssue('test-owner', 'test-repo', 123, {
        code: 200,
        data: {
          state: 'open',
        },
      });

      await checker.evaluate();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('The following dependencies need to be resolved')
      );
      expect(core.setOutput).toHaveBeenCalledWith('has-dependencies', true);
    });

    it('should handle PR with multiple dependencies', async () => {
      mockApi.mockGetPR('test-owner', 'test-repo', targetPRNumber, {
        code: 200,
        data: {
          body: 'Depends on: #123 #456 #789',
        },
      });

      mockApi.mockGetIssue('test-owner', 'test-repo', 123, {
        code: 200,
        data: {
          title: 'Issue 1',
          state: 'open',
        },
      });

      mockApi.mockGetIssue('test-owner', 'test-repo', 456, {
        code: 200,
        data: {
          title: 'Pull Request 2',
          state: 'closed',
        },
      });

      mockApi.mockGetIssue('test-owner', 'test-repo', 789, {
        code: 200,
        data: {
          title: 'Issue 3',
          state: 'open',
        },
      });

      await checker.evaluate();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringMatching(/The following dependencies need to be resolved.*#123.*#789/s)
      );
      expect(core.setFailed).not.toHaveBeenCalledWith(expect.stringContaining('#456'));
      expect(core.setOutput).toHaveBeenCalledWith('has-dependencies', true);
    });

    it('should handle closed dependencies', async () => {
      mockApi.mockGetPR('test-owner', 'test-repo', targetPRNumber, {
        code: 200,
        data: {
          body: 'Depends on: #123',
        },
      });

      mockApi.mockGetIssue('test-owner', 'test-repo', 123, {
        code: 200,
        data: {
          state: 'closed',
        },
      });

      await checker.evaluate();

      expect(core.notice).toHaveBeenCalledWith('All dependencies have been resolved!');
      expect(core.setOutput).toHaveBeenCalledWith('has-dependencies', false);
    });

    it('should show warning when a dependency fetch fails', async () => {
      mockApi.mockGetPR('test-owner', 'test-repo', targetPRNumber, {
        code: 200,
        data: {
          body: 'Depends on: #123',
        },
      });

      mockApi.mockGetIssue('test-owner', 'test-repo', 123, { code: 404 });

      await checker.evaluate();

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining("Error while fetching Pull Request/Issue #123. You'll need to verify it manually.")
      );
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle errors when fetching PR', async () => {
      mockApi.mockGetPR('test-owner', 'test-repo', targetPRNumber, { code: 404 });

      await checker.evaluate();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to fetch Pull Request #${targetPRNumber}`)
      );
    });

    it('should handle Error objects in catch block', async () => {
      const errorMessage = 'Type Error is thrown.';
      const error = new Error(errorMessage);

      vi.spyOn(
        PRDependencyChecker.prototype as unknown as MockPRDependencyChecker,
        'fetchPullRequest'
      ).mockRejectedValueOnce(error);

      await checker.evaluate();

      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining(`Dependency check failed: ${errorMessage}`));
    });

    it('should handle non-Error values in catch block', async () => {
      const errorMessage = 'A non-Type Error is thrown';

      vi.spyOn(
        PRDependencyChecker.prototype as unknown as MockPRDependencyChecker,
        'fetchPullRequest'
      ).mockRejectedValueOnce(errorMessage);

      await checker.evaluate();

      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining(`Dependency check failed: ${errorMessage}`));
    });
  });
});
