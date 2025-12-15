import { constants } from '../constants/constants.js';
import { IssueComment } from '../mocks/types.js';

const { CHECKER_SIGNATURE, CURRENT_ISSUE_TYPE, CURRENT_IS_PR } = constants;

/**
 * Generates a mock Bot Comment object containing a body with a specified number of dependencies and dependents.
 *
 * @param {number} [dependencyCount=2] - The number of dependencies to include in the comment body.
 * @param {number} [dependentCount=2] - The number of dependents to include in the comment body.
 * @returns {IssueComment} - The generated IssueComment object.
 */
export const createTestBotComment = (dependencyCount: number = 2, dependentCount: number = 2): IssueComment => {
  if (dependencyCount + dependentCount === 0) {
    return {
      user: { login: 'github-actions[bot]' },
      body: '',
    };
  }

  const dependencies = Array.from({ length: dependencyCount }, (_, i) => {
    const number = 100 + i;
    return `- [PR #${number}](https://github.com/owner/repo/pull/${number}): Fix critical bug ${i + 1}`;
  }).join('\n');

  // Generate dependents list
  const dependents = Array.from({ length: dependentCount }, (_, i) => {
    const number = 200 + i;
    const type = i % 2 === 0 ? 'PR' : 'Issue';
    return `- [${type} #${number}](https://github.com/owner/repo/${type === 'PR' ? 'pull' : 'issues'}/${number}) – ${type === 'PR' ? 'Add' : 'Implement'} ${i % 2 === 0 ? 'feature' : 'test'} ${i + 1}`;
  }).join('\n');

  return {
    user: { login: 'github-actions[bot]' },
    body: `${CHECKER_SIGNATURE}
## ${dependencyCount > 0 ? '⚠️' : '✅'} ${dependencyCount > 0 ? 'Blocking Dependencies Found' : 'All Dependencies Resolved'}

${
  dependencyCount > 0
    ? `This ${CURRENT_ISSUE_TYPE} should not be ${CURRENT_IS_PR ? 'merged' : 'resolved'} until the following dependencies are resolved:

${dependencies}`
    : `This ${CURRENT_ISSUE_TYPE} has no blocking dependencies.`
}

## ${dependentCount > 0 ? '⚠️' : '✅'} ${dependentCount > 0 ? 'Blocked Dependents Found' : 'All Dependents Resolved'}

${
  dependentCount > 0
    ? `This ${CURRENT_ISSUE_TYPE} should be ${CURRENT_IS_PR ? 'merged' : 'resolved'} to unblock the following dependents:

${dependents}`
    : `This ${CURRENT_ISSUE_TYPE} blocks no dependents.`
}

<sub>*This is an automated message. Please resolve the above dependencies, if any.*</sub>
<!-- DO NOT EDIT THIS COMMENT! IT WILL BREAK THE DEPENDENCY CHECKER. -->`,
  };
};
