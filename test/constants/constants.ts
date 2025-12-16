import * as github from '@actions/github';

export const constants = {
  CURRENT_ISSUE_TYPE: github.context.eventName === 'pull_request' ? 'Pull Request' : 'Issue',
  CURRENT_IS_PR: github.context.eventName === 'pull_request',
  CHECKER_SIGNATURE: '<!-- dependency-checker-action -->'
} as const;