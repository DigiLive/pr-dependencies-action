import { createTestBotComment } from '../fixtures/comments.js';
import { vi } from 'vitest';

/**
 * Parameters for generating a mock bot comment.
 *
 * @property {number} [dependencyCount=0] - The number of dependencies in the bot comment.
 * @property {number} [dependentCount=0] - The number of dependents in the bot comment.
 */
export const mockBotCommentParams = { dependencyCount: 0, dependentCount: 0 };

/**
 * A mock implementation of IssueUpdater.findLastBotComment().
 *
 * @returns {Promise<{body?: string} | undefined>} A promise that resolves with the last bot comment,
 *                                                 or undefined if no bot comment is found.
 */
export const mockFindLastBotComment = vi.fn(() =>
  createTestBotComment(mockBotCommentParams.dependencyCount, mockBotCommentParams.dependentCount)
);

/**
 * A mock implementation of the IssueUpdater class for testing purposes.
 */
export class MockIssueUpdater {
  updateIssue = vi.fn().mockResolvedValue(undefined);
  findLastBotComment = mockFindLastBotComment;
}

vi.mock('@/IssueUpdater.js', () => ({
  IssueUpdater: MockIssueUpdater,
}));
