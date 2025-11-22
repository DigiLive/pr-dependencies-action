import { vi } from 'vitest';
import { Octokit } from '@octokit/rest';

// Mock function for `evaluate`
export const mockEvaluate = vi.fn();

// Mock class directly
export class MockPRDependencyChecker {
  evaluate = mockEvaluate;
  constructor(_octokit: Octokit) {}
}
