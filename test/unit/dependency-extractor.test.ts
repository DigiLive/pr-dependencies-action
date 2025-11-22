import { describe, expect, it } from 'vitest';
import { getDependencyTags } from '@/dependency-extractor.js';
import * as core from '@actions/core';

describe('Dependency Extractor', () => {
  describe('Quick Links', () => {
    it('extracts single quick link', () => {
      const body = 'Depends on: #123';
      const result = getDependencyTags(body);

      expect(result).toEqual([{ owner: 'test-owner', repo: 'test-repo', number: 123 }]);
    });

    it('extracts multiple quick links', () => {
      const body = 'Depends on: #123#9123 #456 #789#INCLUDED #9456EXCLUDED';
      const result = getDependencyTags(body);

      expect(result).toHaveLength(3);
      expect(result).toContainEqual({ owner: 'test-owner', repo: 'test-repo', number: 123 });
      expect(result).toContainEqual({ owner: 'test-owner', repo: 'test-repo', number: 456 });
      expect(result).toContainEqual({ owner: 'test-owner', repo: 'test-repo', number: 789 });
    });
  });

  describe('Partial Links', () => {
    it('extracts single partial link', () => {
      const body = 'Depends on: owner/repo#123';
      const result = getDependencyTags(body);

      expect(result).toEqual([{ owner: 'owner', repo: 'repo', number: 123 }]);
    });

    it('extracts multiple partial links', () => {
      const body = 'Depends on: owner/repo#9123owner/repo#9456 owner/repo#123 owner/repo#456#INCLUDED #9789EXCLUDED';
      const result = getDependencyTags(body);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ owner: 'owner', repo: 'repo', number: 123 });
      expect(result).toContainEqual({ owner: 'owner', repo: 'repo', number: 456 });
    });
  });

  describe('Partial URLs', () => {
    it('extracts single partial URL', () => {
      const body = 'Depends on: owner/repo/pull/123';
      const result = getDependencyTags(body);

      expect(result).toEqual([{ owner: 'owner', repo: 'repo', number: 123 }]);
    });

    it('extracts multiple partial URLs', () => {
      const body =
        'Depends on: owner/repo/pull/9123owner/repo/pull/9456 owner/repo/pull/123 ' +
        'owner/repo/pull/9789EXCLUDED owner/repo/pull/456';
      const result = getDependencyTags(body);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ owner: 'owner', repo: 'repo', number: 123 });
      expect(result).toContainEqual({ owner: 'owner', repo: 'repo', number: 456 });
    });
  });

  describe('Full GitHub URLs', () => {
    it('extracts single GitHub URLs', () => {
      const body = 'Depends on: https://github.com/org/repo/pull/123';
      const result = getDependencyTags(body);

      expect(result).toEqual([{ owner: 'org', repo: 'repo', number: 123 }]);
    });

    it('extracts multiple GitHub URLs', () => {
      const body =
        'Depends on: https://github.com/owner/repo/pull/9123https://github.com/owner/repo/pull/9456 ' +
        'https://github.com/owner/repo/pull/123 https://github.com/owner/repo/pull/9789EXCLUDED ' +
        'https://github.com/owner/repo/pull/456';
      const result = getDependencyTags(body);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ owner: 'owner', repo: 'repo', number: 123 });
      expect(result).toContainEqual({ owner: 'owner', repo: 'repo', number: 456 });
    });
  });

  describe('Markdown Links', () => {
    it('extracts single Markdown link', () => {
      const body = 'Depends on: [this](https://github.com/owner/repo/pull/123)';
      const result = getDependencyTags(body);

      expect(result).toEqual([{ owner: 'owner', repo: 'repo', number: 123 }]);
    });

    it('extracts multiple Markdown links with text in between', () => {
      const body =
        'Depends on: [this](https://github.com/owner/repo/pull/123)&[that](https://github.com/owner/repo/pull/456)';
      const result = getDependencyTags(body);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ owner: 'owner', repo: 'repo', number: 123 });
      expect(result).toContainEqual({ owner: 'owner', repo: 'repo', number: 456 });
    });

    it('extracts multiple Markdown links without text in between', () => {
      const body =
        'Depends on: [this](https://github.com/owner/repo/pull/123)[that](https://github.com/owner/repo/pull/456)';
      const result = getDependencyTags(body);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ owner: 'owner', repo: 'repo', number: 123 });
      expect(result).toContainEqual({ owner: 'owner', repo: 'repo', number: 456 });
    });
  });

  // Combined formats
  describe('Combined Formats', () => {
    it('handles multiple formats in the same text', () => {
      const body = `
        Depends on:
        - #123
        - owner/repo#456
        - org/repo/pull/789
        - https://github.com/owner/repo/issues/223
        - [this](https://github.com/org/repo/pull/256)
      `;
      const result = getDependencyTags(body);

      expect(result).toHaveLength(5);
      expect(result).toContainEqual({ owner: 'test-owner', repo: 'test-repo', number: 123 });
      expect(result).toContainEqual({ owner: 'owner', repo: 'repo', number: 456 });
      expect(result).toContainEqual({ owner: 'org', repo: 'repo', number: 789 });
      expect(result).toContainEqual({ owner: 'owner', repo: 'repo', number: 223 });
      expect(result).toContainEqual({ owner: 'org', repo: 'repo', number: 256 });
    });
  });

  // Edge cases
  describe('Edge Cases', () => {
    it('returns empty array for empty or invalid input', () => {
      expect(getDependencyTags('')).toEqual([]);
      expect(getDependencyTags(null as unknown as string)).toEqual([]);
      expect(getDependencyTags(undefined as unknown as string)).toEqual([]);
    });

    it('stops capturing at blank lines', () => {
      const body = `Depends on:\n- #123\n- #456\n\n#789 (should be ignored)`;
      const result = getDependencyTags(body);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ owner: 'test-owner', repo: 'test-repo', number: 123 });
      expect(result).toContainEqual({ owner: 'test-owner', repo: 'test-repo', number: 456 });
    });

    it('removes duplicate dependencies', () => {
      const body = 'Depends on: #123 and also #123';
      const result = getDependencyTags(body);

      expect(result).toEqual([{ owner: 'test-owner', repo: 'test-repo', number: 123 }]);
    });

    it('does reject the PR number as a dependency', () => {
      const body = 'Depends on: #123 #999';
      const result = getDependencyTags(body);

      expect(result).toEqual([{ owner: 'test-owner', repo: 'test-repo', number: 123 }]);
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringMatching('The Pull Request has itself listed as a dependency.')
      );
    });

    it('ignores invalid issue numbers', () => {
      const body = 'Depends on: #notanumber and #123';
      const result = getDependencyTags(body);

      expect(result).toEqual([{ owner: 'test-owner', repo: 'test-repo', number: 123 }]);
    });

    it('handles multiple key phrases', () => {
      const body = `
        Depends on: #1
        Blocked by: #2
      `;
      const result = getDependencyTags(body);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ owner: 'test-owner', repo: 'test-repo', number: 1 });
      expect(result).toContainEqual({ owner: 'test-owner', repo: 'test-repo', number: 2 });
    });

    it('handles issues and pull requests', () => {
      const body = `
        Depends on: owner/repo/issues/123
        Blocked by: owner/repo/pull/456
      `;
      const result = getDependencyTags(body);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ owner: 'owner', repo: 'repo', number: 123 });
      expect(result).toContainEqual({ owner: 'owner', repo: 'repo', number: 456 });
    });

    it('handles custom GitHub enterprise URLs', () => {
      const originalServerUrl = process.env.GITHUB_SERVER_URL;
      process.env.GITHUB_SERVER_URL = 'https://github.example.com';

      const body = 'Depends on: https://github.example.com/org/repo/pull/42';
      const result = getDependencyTags(body);

      expect(result).toEqual([{ owner: 'org', repo: 'repo', number: 42 }]);

      process.env.GITHUB_SERVER_URL = originalServerUrl;
    });
  });
});
