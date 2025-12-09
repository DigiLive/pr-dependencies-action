import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { createMockGithubAPI, mockedOctokit } from '../mocks/api-mocks.js';
import { mockBotCommentParams } from '../mocks/IssueUpdater.js';
import { DependencyChecker } from '../../src/DependencyChecker.js';

describe('DependencyChecker', () => {
  let mockApi: ReturnType<typeof createMockGithubAPI>;
  let checker: DependencyChecker;

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = createMockGithubAPI();
    checker = new DependencyChecker(mockedOctokit);
  });

  afterEach(() => {
    mockApi.done();
  });

  describe('Body Handling', () => {
    const testNoDependencies = async (body: string) => {
      github.context.payload.pull_request!.body = body;
      mockBotCommentParams.dependencyCount = 1;

      await checker.evaluate();

      expect(core.info).toHaveBeenCalledWith(expect.stringContaining(`Analyzing 0 dependencies`));
      expect(core.notice).toHaveBeenCalledWith(expect.stringContaining(`All dependencies are resolved.`));
      expect(core.setOutput).toHaveBeenCalledWith('has-dependencies', false);
    };

    // eslint-disable-next-line vitest/expect-expect
    it('should handle an empty body', async () => {
      await testNoDependencies('');
    });

    // eslint-disable-next-line vitest/expect-expect
    it('should handle no dependencies', async () => {
      await testNoDependencies('There are no dependencies');
    });
  });

  describe('Dependency Handling', () => {
    it('should handle open dependencies', async () => {
      github.context.payload.pull_request!.body = 'Depends on: #123';

      mockApi.mockGetIssue('owner', 'repo', 123, {
        code: 200,
        data: {
          state: 'open',
        },
      });

      await checker.evaluate();

      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Unresolved Dependencies: 1 (#123)'));
      expect(core.setOutput).toHaveBeenCalledWith('has-dependencies', true);
    });

    it('should handle multiple dependencies', async () => {
      github.context.payload.pull_request!.body = 'Depends on: #123 #456 #789';

      mockApi.mockGetIssue('owner', 'repo', 123, {
        code: 200,
        data: {
          title: 'Issue 1',
          state: 'open',
        },
      });

      mockApi.mockGetIssue('owner', 'repo', 456, {
        code: 200,
        data: {
          title: 'Pull Request 2',
          state: 'closed',
        },
      });

      mockApi.mockGetIssue('owner', 'repo', 789, {
        code: 200,
        data: {
          title: 'Issue 3',
          state: 'open',
        },
      });

      await checker.evaluate();

      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Unresolved Dependencies: 2 (#123 #789)'));
      expect(core.setFailed).not.toHaveBeenCalledWith(expect.stringContaining('#456'));
      expect(core.setOutput).toHaveBeenCalledWith('has-dependencies', true);
    });

    it('should handle closed dependencies', async () => {
      github.context.payload.pull_request!.body = 'Depends on: #123';

      mockApi.mockGetIssue('owner', 'repo', 123, {
        code: 200,
        data: {
          state: 'closed',
        },
      });

      await checker.evaluate();

      expect(core.notice).toHaveBeenCalledWith(expect.stringContaining('All dependencies are resolved.'));
      expect(core.setOutput).toHaveBeenCalledWith('has-dependencies', false);
    });

    it('should show warning when a dependency fetch fails', async () => {
      github.context.payload.pull_request!.body = 'Depends on: #123';

      mockApi.mockGetIssue('owner', 'repo', 123, { code: 404 });

      await checker.evaluate();

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch dependency #123. You'll need to verify it manually.")
      );
      expect(core.notice).toHaveBeenCalledWith(expect.stringContaining('All dependencies are resolved.'));
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });

  describe('Dependent Handling', () => {
    it('should handle open dependents', async () => {
      mockBotCommentParams.dependentCount = 1;

      mockApi.mockGetIssue('owner', 'repo', 200, {
        code: 200,
        data: {
          state: 'open',
        },
      });

      await checker.evaluate();

      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Analyzing 1 dependents'));
    });

    it('should handle multiple dependents', async () => {
      mockBotCommentParams.dependentCount = 3;

      mockApi.mockGetIssue('owner', 'repo', 200, {
        code: 200,
        data: {
          title: 'Issue 200',
          state: 'open',
        },
      });

      mockApi.mockGetIssue('owner', 'repo', 201, {
        code: 200,
        data: {
          title: 'Pull Request 201',
          state: 'closed',
        },
      });

      mockApi.mockGetIssue('owner', 'repo', 202, {
        code: 200,
        data: {
          title: 'Issue 202',
          state: 'open',
        },
      });

      await checker.evaluate();

      expect(core.notice).toHaveBeenCalledWith(expect.stringContaining('Blocked Dependents: 2 (#200 #202)'));
      expect(core.notice).not.toHaveBeenCalledWith(expect.stringContaining('#201'));
    });

    it('should handle closed dependents', async () => {
      mockBotCommentParams.dependentCount = 1;

      mockApi.mockGetIssue('owner', 'repo', 200, {
        code: 200,
        data: {
          state: 'closed',
        },
      });

      await checker.evaluate();

      expect(core.notice).toHaveBeenCalledWith(expect.stringContaining('Blocked Dependents: 0 (none)'));
    });

    it('should show warning when a dependent fetch fails', async () => {
      mockBotCommentParams.dependentCount = 1;

      mockApi.mockGetIssue('owner', 'repo', 200, { code: 404 });

      await checker.evaluate();

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch dependent #200. You'll need to verify it manually.")
      );
      expect(core.notice).toHaveBeenCalledWith(expect.stringContaining('Blocked Dependents: 0 (none)'));
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });
});
