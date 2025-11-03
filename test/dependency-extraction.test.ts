import { test, expect, describe } from "@jest/globals";
import { getDependencyTags } from "../src/pr-dependency-checker";
import { DependencyTag } from "../src/types";

process.env.GITHUB_REPOSITORY = "owner/repo";

describe("getDependencyTags", () => {
  describe("shorthand format", () => {
    test("should parse shorthand dependency", () => {
      const input = "Depends on #14";
      const expected: DependencyTag[] = [
        {
          owner: "owner",
          repo: "repo",
          number: 14,
        },
      ];
      expect(getDependencyTags(input)).toStrictEqual(expected);
    });
  });

  describe("partial link format", () => {
    test("should parse partial link dependency", () => {
      const input = "Depends on username/dependencies-action#5";
      const expected: DependencyTag[] = [
        {
          owner: "username",
          repo: "dependencies-action",
          number: 5,
        },
      ];
      expect(getDependencyTags(input)).toStrictEqual(expected);
    });
  });

  describe("multiple dependencies", () => {
    test("should handle multiple dependencies in different formats", () => {
      const input = `Depends on #14
Depends on username/dependencies-action#5`;
      const expected: DependencyTag[] = [
        {
          owner: "owner",
          repo: "repo",
          number: 14,
        },
        {
          owner: "username",
          repo: "dependencies-action",
          number: 5,
        },
      ];
      expect(getDependencyTags(input)).toStrictEqual(expected);
    });
  });

  describe("whitespace handling", () => {
    test("should handle a blank line at the end", () => {
      const input = `Depends on #14
Depends on username/dependencies-action#5

`;
      const expected: DependencyTag[] = [
        {
          owner: "owner",
          repo: "repo",
          number: 14,
        },
        {
          owner: "username",
          repo: "dependencies-action",
          number: 5,
        },
      ];
      expect(getDependencyTags(input)).toStrictEqual(expected);
    });

    test("should handle a blank line in the middle", () => {
      const input = `Depends on #14

Depends on username/dependencies-action#5`;
      const expected: DependencyTag[] = [
        {
          owner: "owner",
          repo: "repo",
          number: 14,
        },
        {
          owner: "username",
          repo: "dependencies-action",
          number: 5,
        },
      ];
      expect(getDependencyTags(input)).toStrictEqual(expected);
    });
  });

  describe("complex cases", () => {
    test("should handle multiple dependencies in a bulleted list with mixed formats", () => {
      const input = `- Blocked by: https://github.com/username/action_docker/pull/1
- Blocked by: https://github.com/username/action_bump/pull/1
- Blocked By https://github.com/username/action_python/pull/1
- Blocked By: https://github.com/username/action_pull_requests/pull/1
- Related: https://github.com/username/dependencies-action/issues/28
- Related: #213
- Related: #214 `;

      const expected: DependencyTag[] = [
        {
          owner: "username",
          repo: "action_docker",
          number: 1,
        },
        {
          owner: "username",
          repo: "action_bump",
          number: 1,
        },
        {
          owner: "username",
          repo: "action_python",
          number: 1,
        },
        {
          owner: "username",
          repo: "action_pull_requests",
          number: 1,
        },
      ];
      expect(getDependencyTags(input)).toStrictEqual(expected);
    });
  });
});
