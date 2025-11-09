import { getDependencyTags } from '../src/dependency-extractor';
import { DependencyTag } from '../src/types';
import * as config from '../src/config';

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

jest.mock('@actions/github', () => ({
  context: {
    repo: {
      owner: 'test-owner',
      repo: 'test-repo',
    },
  },
}));

describe('Dependency Extractor', () => {
  it('should extract all valid dependency references', () => {
    const testBody = `
Some introductory text here...

Depends on:
[Markdown1](https://github.com/owner/repo/issues/1)
[Markdown2](https://github.com/owner/repo/pull/2)

[EXCLUDED](https://github.com/owner/repo/issues/1000)

blocked by:
[Markdown3](https://github.com/owner/repo/pull/3)any text in between[Fix 4](https://github.com/owner/repo/issues/4)
[Markdown5](https://github.com/owner/repo/pull/5)[Markdown6](https://github.com/owner/repo/issues/6)
Followed by more text or a blank line.

Depends on:
[Markdown7](https://github.com/owner/repo/pull/7)
[Markdown8](https://github.com/owner/repo/issues/8)

Depends on:[Markdown9](https://github.com/owner/repo/pull/9)
[Markdown10](https://github.com/owner/repo/issues/10)

Blocked by: #101#2000 #102 #103#INCLUDED #3000EXCLUDED
#104

Depends on: owner/repo#1000owner/repo#2000 owner/repo#201 owner/repo#202#INCLUDED #3000EXCLUDED
owner/repo#203

Depends on: owner/repo/pull/4000owner/repo/issues/5000 owner/repo/pull/301 owner/repo/issues/6000EXCLUDED
owner/repo/pull/302

Depends on: https://github.com/owner/repo/issues/9000https://github.com/owner/repo/pull/10000 https://github.com/owner/repo/issues/401 https://github.com/owner/repo/pull/11000EXCLUDED
https://github.com/owner/repo/issues/402
https://domain.com/owner/repo/pull/402
`;

    const result = getDependencyTags(testBody);

    // Expected results based on the test body
    const expected: DependencyTag[] = [
      { owner: 'owner', repo: 'repo', number: 1 },
      { owner: 'owner', repo: 'repo', number: 2 },
      { owner: 'owner', repo: 'repo', number: 3 },
      { owner: 'owner', repo: 'repo', number: 4 },
      { owner: 'owner', repo: 'repo', number: 5 },
      { owner: 'owner', repo: 'repo', number: 6 },
      { owner: 'owner', repo: 'repo', number: 7 },
      { owner: 'owner', repo: 'repo', number: 8 },
      { owner: 'owner', repo: 'repo', number: 9 },
      { owner: 'owner', repo: 'repo', number: 10 },
      { owner: 'test-owner', repo: 'test-repo', number: 101 },
      { owner: 'test-owner', repo: 'test-repo', number: 102 },
      { owner: 'test-owner', repo: 'test-repo', number: 103 },
      { owner: 'test-owner', repo: 'test-repo', number: 104 },
      { owner: 'owner', repo: 'repo', number: 201 },
      { owner: 'owner', repo: 'repo', number: 202 },
      { owner: 'owner', repo: 'repo', number: 203 },
      { owner: 'owner', repo: 'repo', number: 301 },
      { owner: 'owner', repo: 'repo', number: 302 },
      { owner: 'owner', repo: 'repo', number: 401 },
      { owner: 'owner', repo: 'repo', number: 402 },
    ];

    // Check that all expected dependencies are present
    expect(result).toHaveLength(expected.length);
    expected.forEach((expectedDep) => {
      expect(result).toContainEqual(expect.objectContaining(expectedDep));
    });
  });

  it('should handle an empty body', () => {
    expect(getDependencyTags('')).toEqual([]);
  });

  it('should handle a body with no dependencies', () => {
    const text = 'This is a test with no dependencies';
    expect(getDependencyTags(text)).toEqual([]);
  });

  it('should handle different key phrases', () => {
    const text = `
    DEPENDS ON: #1
    BLOCKED BY: #2
    depends on: #3
    Blocked By: #4
    `;
    const result = getDependencyTags(text);
    expect(result).toHaveLength(4);
    expect(result).toContainEqual({ owner: 'test-owner', repo: 'test-repo', number: 1 });
    expect(result).toContainEqual({ owner: 'test-owner', repo: 'test-repo', number: 2 });
    expect(result).toContainEqual({ owner: 'test-owner', repo: 'test-repo', number: 3 });
    expect(result).toContainEqual({ owner: 'test-owner', repo: 'test-repo', number: 4 });
  });

  it('should handle different reference formats in the same text', () => {
    const text = `
    Depends on: #1
    Blocked by: owner/repo#2
    Depends on: https://github.com/owner/repo/issues/3
    `;
    const result = getDependencyTags(text);
    expect(result).toHaveLength(3);
    expect(result).toContainEqual({ owner: 'test-owner', repo: 'test-repo', number: 1 });
    expect(result).toContainEqual({ owner: 'owner', repo: 'repo', number: 2 });
    expect(result).toContainEqual({ owner: 'owner', repo: 'repo', number: 3 });
  });

  it('should not include invalid patterns', () => {
    const text = `
    Depends on: #123EXCLUDED
    https://github.com/owner/repo/issues/456EXCLUDED
    `;
    const result = getDependencyTags(text);
    expect(result).toHaveLength(0);
  });

  describe('with a custom environment/inputs', () => {
    describe('with a custom server URL', () => {
      process.env.GITHUB_SERVER_URL = 'https://custom-domain.com';

      const customDomainBody = `
    Depends on:
    [Custom PR](https://custom-domain.com/custom-org/custom-repo/pull/123)
    Blocked by: #456
    `;

      it('should handle custom domain URLs', () => {
        const result = getDependencyTags(customDomainBody);

        expect(result).toHaveLength(2);
        expect(result).toContainEqual({ owner: 'custom-org', repo: 'custom-repo', number: 123 });
        expect(result).toContainEqual({ owner: 'test-owner', repo: 'test-repo', number: 456 });
      });

      it('should not match non-configured domains', () => {
        const nonConfiguredDomainBody = `
      Depends on: https://not-configured.com/owner/repo/pull/123
      `;

        const result = getDependencyTags(nonConfiguredDomainBody);
        expect(result).toHaveLength(0);
      });
    });

    describe('With custom key phrases', () => {
      const customDomainBody = `
    Subject to:
    [Custom PR](https://github.com/owner/repo/pull/123)
    requires: #456
    `;

      beforeAll(() => {
        jest.spyOn(config, 'getKeyPhrases').mockReturnValue('subject to|requires');
      });

      afterAll(() => {
        jest.restoreAllMocks();
      });

      it('should handle custom key phrases', () => {
        const result = getDependencyTags(customDomainBody);

        expect(result).toHaveLength(2);
        expect(result).toContainEqual({ owner: 'owner', repo: 'repo', number: 123 });
        expect(result).toContainEqual({ owner: 'test-owner', repo: 'test-repo', number: 456 });
      });
    });
  });
});
