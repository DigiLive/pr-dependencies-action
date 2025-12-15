import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { createMockGithubAPI, mockedOctokit } from '../mocks/api-mocks.js';
import { mockBotCommentParams } from '../mocks/IssueUpdater.js';
import { DependencyChecker } from '../../src/DependencyChecker.js';

describe('DependencyChecker', () => {
  let mockApi: ReturnType<typeof createMockGithubAPI>;
  let checker: DependencyChecker;

  /**
   * Extracts the issue numbers from a section of the summary.
   *
   * @param {string} section - The section of the summary to extract issue numbers from.
   * @param {string} sectionName - The name of the section to extract issue numbers from.
   * @return {number[]} An array of issue numbers found in the section.
   */
  function getIssueNumbers(section: string, sectionName: string): number[] {
    const sectionMatch = new RegExp(`<h2>${sectionName}<\\/h2>\\s*<ul>([\\s\\S]*?)<\\/ul>`).exec(section);

    if (!sectionMatch) return [];
    return [...sectionMatch[1].matchAll(/#(\d+)/g)].map((m) => parseInt(m[1], 10));
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = createMockGithubAPI();
    checker = new DependencyChecker(mockedOctokit);

    core.summary.emptyBuffer();
  });

  afterEach(() => {
    mockApi.done();
  });

  describe('Body Handling', () => {
    const testNoDependencies = async (body: string) => {
      github.context.payload.pull_request!.body = body;
      mockBotCommentParams.dependencyCount = 1;

      await checker.evaluate();

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

      expect(getIssueNumbers(core.summary.stringify(), 'Unresolved Dependencies')).toEqual([123]);
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Dependencies must be resolved'));
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

      expect(getIssueNumbers(core.summary.stringify(), 'Unresolved Dependencies')).toEqual([]);
      expect(core.notice).toHaveBeenCalledWith(expect.stringContaining('All dependencies are resolved.'));
      expect(core.setOutput).toHaveBeenCalledWith('has-dependencies', false);
    });

    it('should handle multiple and mixed dependencies', async () => {
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

      expect(getIssueNumbers(core.summary.stringify(), 'Unresolved Dependencies')).toEqual([123, 789]);
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Dependencies must be resolved'));
      expect(core.setOutput).toHaveBeenCalledWith('has-dependencies', true);
    });

    it('should not include a dependency that references to the current issue', async () => {
      github.context.payload.pull_request!.body = `Depends on: #${github.context.issue.number}`;

      await checker.evaluate();

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining(`Skipping dependency #${github.context.issue.number}`)
      );
    });

    it('should show warning when a dependency fetch fails', async () => {
      github.context.payload.pull_request!.body = 'Depends on: #123';

      mockApi.mockGetIssue('owner', 'repo', 123, { code: 404 });

      await checker.evaluate();

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch dependency #123. You'll need to verify it manually.")
      );
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

      expect(getIssueNumbers(core.summary.stringify(), 'Blocked Dependents')).toEqual([200]);
      expect(core.setOutput).toHaveBeenCalledWith('has-dependencies', false);
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

      expect(getIssueNumbers(core.summary.stringify(), 'Blocked Dependents')).toEqual([]);
      expect(core.notice).toHaveBeenCalledWith(expect.stringContaining('does not block a dependent.'));
      expect(core.setOutput).toHaveBeenCalledWith('has-dependencies', false);
    });

    it('should handle multiple/mixed dependents', async () => {
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

      expect(getIssueNumbers(core.summary.stringify(), 'Blocked Dependents')).toEqual([200,202]);
      expect(core.setOutput).toHaveBeenCalledWith('has-dependencies', false);
    });

    it('should not include a dependent that references to the current issue', async () => {
      const originalIssueNumber = github.context.issue.number;

      github.context.payload.pull_request!.number = 200;
      mockBotCommentParams.dependentCount = 1;

      await checker.evaluate();

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining(`Skipping dependent #200`)
      );

      github.context.payload.pull_request!.number = originalIssueNumber;
    });

    it('should show warning when a dependent fetch fails', async () => {
      mockBotCommentParams.dependentCount = 1;
      mockApi.mockGetIssue('owner', 'repo', 200, { code: 404 });

      await checker.evaluate();

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch dependent #200. You'll need to verify it manually.")
      );
      expect(getIssueNumbers(core.summary.stringify(), 'Blocked Dependents')).toEqual([]);
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });
});
