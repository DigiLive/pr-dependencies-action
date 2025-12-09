import { describe, expect, it } from 'vitest';
import { getDependencyTags, getDependentsTags } from '../../src/tag-extractor.js';
import * as core from '@actions/core';
import { createTestBotComment } from '../fixtures/comments.js';
import * as github from '@actions/github';

describe('Tag Extractor', () => {
  describe('Dependency Tags', () => {
    describe('Intra Repo links', () => {
      it('should extract a single tag', () => {
        const body = 'Depends on: #123';
        const result = getDependencyTags(body);

        expect(result).toEqual([{ owner: 'owner', repo: 'repo', issue_number: 123 }]);
      });

      it('should extract multiple tags', () => {
        const body = 'Depends on: #123#9123 #456 #789#INCLUDED #9456EXCLUDED';
        const result = getDependencyTags(body);

        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 123 });
        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 456 });
        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 789 });
        expect(result).toHaveLength(3);
      });
    });

    describe('Cross Repo tags', () => {
      it('should extract a single tag', () => {
        const body = 'Depends on: owner/repo#123';
        const result = getDependencyTags(body);

        expect(result).toEqual([{ owner: 'owner', repo: 'repo', issue_number: 123 }]);
      });

      it('should extract multiple tags', () => {
        const body = 'Depends on: owner/repo#9123owner/repo#9456 owner/repo#123 owner/repo#456#INCLUDED #9789EXCLUDED';
        const result = getDependencyTags(body);

        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 123 });
        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 456 });
        expect(result).toHaveLength(2);
      });
    });

    describe('Path Shorthands', () => {
      it('should extract a single tag', () => {
        const body = 'Depends on: owner/repo/pull/123';
        const result = getDependencyTags(body);

        expect(result).toEqual([{ owner: 'owner', repo: 'repo', issue_number: 123 }]);
      });

      it('should extract multiple tags', () => {
        const body =
          'Depends on: owner/repo/pull/9123owner/repo/pull/9456 owner/repo/pull/123 ' +
          'owner/repo/pull/9789EXCLUDED owner/repo/pull/456';
        const result = getDependencyTags(body);

        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 123 });
        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 456 });
        expect(result).toHaveLength(2);
      });
    });

    describe('GitHub URLs', () => {
      it('should extract a single tag', () => {
        const body = 'Depends on: https://github.com/org/repo/pull/123';
        const result = getDependencyTags(body);

        expect(result).toEqual([{ owner: 'org', repo: 'repo', issue_number: 123 }]);
      });

      it('should extract multiple tags', () => {
        const body =
          'Depends on: https://github.com/owner/repo/pull/9123https://github.com/owner/repo/pull/9456 ' +
          'https://github.com/owner/repo/pull/123 https://github.com/owner/repo/pull/9789EXCLUDED ' +
          'https://github.com/owner/repo/pull/456';
        const result = getDependencyTags(body);

        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 123 });
        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 456 });
        expect(result).toHaveLength(2);
      });
    });

    describe('Markdown', () => {
      it('should extract a single tag', () => {
        const body = 'Depends on: [this](https://github.com/owner/repo/pull/123)';
        const result = getDependencyTags(body);

        expect(result).toEqual([{ owner: 'owner', repo: 'repo', issue_number: 123 }]);
      });

      it('should extract multiple tags from links with text in between', () => {
        const body =
          'Depends on: [this](https://github.com/owner/repo/pull/123)&[that](https://github.com/owner/repo/pull/456)';
        const result = getDependencyTags(body);

        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 123 });
        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 456 });
      });

      it('should extract multiple tags from links without text in between', () => {
        const body =
          'Depends on: [this](https://github.com/owner/repo/pull/123)[that](https://github.com/owner/repo/pull/456)';
        const result = getDependencyTags(body);

        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 123 });
        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 456 });
        expect(result).toHaveLength(2);
      });
    });

    // Combined formats
    describe('Combined Formats', () => {
      it('should extract tags from multiple formats in the same text', () => {
        const body = `
        Depends on:
        - #123
        - owner/repo#456
        - org/repo/pull/789
        - https://github.com/owner/repo/issues/101112
        - [this](#1231)
        - [this](owner/repo#4561)
        - [this](org/repo/pull/7891)
        - [this](https://github.com/owner/repo/issues/1011121)
      `;
        const result = getDependencyTags(body);

        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 123 });
        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 456 });
        expect(result).toContainEqual({ owner: 'org', repo: 'repo', issue_number: 789 });
        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 101112 });
        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 1231 });
        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 4561 });
        expect(result).toContainEqual({ owner: 'org', repo: 'repo', issue_number: 7891 });
        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 1011121 });
        expect(result).toHaveLength(8);
      });
    });

    // Edge cases
    describe('Edge Cases', () => {
      it('should return an empty array for an empty or invalid input', () => {
        expect(getDependencyTags('')).toEqual([]);
        expect(getDependencyTags(null as unknown as string)).toEqual([]);
        expect(getDependencyTags(undefined as unknown as string)).toEqual([]);
      });

      it('should stop capture from dependency-block only', () => {
        const body = `Depends on:\n- #123\n- #456\n\n#789 (should be ignored)`;
        const result = getDependencyTags(body);

        expect(result).toHaveLength(2);
        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 123 });
        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 456 });
      });

      it('should remove duplicate dependencies', () => {
        const body = 'Depends on: #123 and also #123';
        const result = getDependencyTags(body);

        expect(result).toEqual([{ owner: 'owner', repo: 'repo', issue_number: 123 }]);
      });

      it('should skip extraction of the current issue', () => {
        const body = 'Depends on: #123 #999';
        const result = getDependencyTags(body);

        expect(result).toEqual([{ owner: 'owner', repo: 'repo', issue_number: 123 }]);
        expect(core.warning).toHaveBeenCalledWith(
          expect.stringMatching(
            `Skipping dependency tag that matches the current issue: ${github.context.repo.owner}/${github.context.repo.repo}#${github.context.issue.number}`
          )
        );
      });

      it('handles multiple key phrases', () => {
        const body = `
        Depends on: #1
        Blocked by: #2
      `;
        const result = getDependencyTags(body);

        expect(result).toHaveLength(2);
        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 1 });
        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 2 });
      });

      it('handles issues and pull requests', () => {
        const body = `
        Depends on: owner/repo/issues/123
        Blocked by: owner/repo/pull/456
      `;
        const result = getDependencyTags(body);

        expect(result).toHaveLength(2);
        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 123 });
        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', issue_number: 456 });
      });

      it('handles custom GitHub enterprise URLs', () => {
        const originalServerUrl = process.env.GITHUB_SERVER_URL;
        process.env.GITHUB_SERVER_URL = 'https://github.example.com';

        const body = 'Depends on: https://github.example.com/org/repo/pull/42';
        const result = getDependencyTags(body);

        expect(result).toEqual([{ owner: 'org', repo: 'repo', issue_number: 42 }]);

        process.env.GITHUB_SERVER_URL = originalServerUrl;
      });
    });
  });

  describe('Dependent Tags', () => {
    describe('getDependentsTags', () => {
      it('should return empty array if no dependents section exists', () => {
        expect(getDependentsTags('No dependents here')).toEqual([]);
      });

      it('should extract dependents from the section', () => {
        const result = getDependentsTags(createTestBotComment().body ?? '');

        expect(result).toEqual([
          { owner: 'owner', repo: 'repo', issue_number: 200 },
          { owner: 'owner', repo: 'repo', issue_number: 201 },
        ]);
      });
    });

    it('should not include a back-reference', () => {
      const originalIssueNumber = github.context.issue.number;
      github.context.issue.number = 200;

      try {
        const result = getDependentsTags(createTestBotComment().body ?? '');

        expect(result).toEqual([{ owner: 'owner', repo: 'repo', issue_number: 201 }]);
      } finally {
        github.context.issue.number = originalIssueNumber;
      }
    });
  });
});
