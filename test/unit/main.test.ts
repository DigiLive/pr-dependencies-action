import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import * as core from '@actions/core';
import { mockEvaluate, MockPRDependencyChecker } from '../mocks/PRDependencyChecker.js';

// Mock the PRDependencyChecker class.
vi.mock('../../src/PRDependencyChecker', () => ({
  PRDependencyChecker: MockPRDependencyChecker,
}));

let originalToken: string | undefined;

describe('main', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('successful execution', () => {
    it('should initialize and run successfully with valid environment', async () => {
      await import('../../src/main.js');

      await vi.waitFor(() => {
        expect(core.info).toHaveBeenCalledWith('Initializing the action...');
        expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Using GitHub Enterprise instance at:'));
        expect(core.info).toHaveBeenCalledWith('Initialization completed. Starting...');
        expect(mockEvaluate).toHaveBeenCalled();
      });
    });
  });

  describe('environment validation', () => {
    it('should fail when GITHUB_TOKEN is missing', async () => {
      originalToken = process.env.GITHUB_TOKEN;

      delete process.env.GITHUB_TOKEN;

      await import('../../src/main.js');

      await vi.waitFor(() => {
        expect(core.setFailed).toHaveBeenCalledWith('GITHUB_TOKEN or GITHUB_API_URL environment variable is not set.');
      });

      process.env.GITHUB_TOKEN = originalToken;
    });
  });

  describe('error handling', () => {
    it('should handle caught errors from evaluate', async () => {
      const error = new Error('Mock Error');
      mockEvaluate.mockRejectedValue(error);

      await import('../../src/main.js');

      await vi.waitFor(() => {
        expect(core.setFailed).toHaveBeenCalledWith(error.message);
      });

      mockEvaluate.mockResolvedValue(undefined);
    });

    it('should handle uncaught errors in run()', async () => {
      originalToken = process.env.GITHUB_TOKEN;
      const error = new Error('Mock Error');

      // Mock exit to prevent actual process exit.
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null) => {
        return undefined as never;
      });

      // Mock setFailed to throw an error.
      (core.setFailed as Mock).mockImplementation(() => {
        throw error;
      });

      delete process.env.GITHUB_TOKEN;
      await import('../../src/main.js');

      await vi.waitFor(() => {
        expect(core.error).toHaveBeenCalledWith(`Unhandled error in run(): ${error.message}`);
        expect(processExitSpy).toHaveBeenCalledWith(1);
      });

      processExitSpy.mockRestore();
      process.env.GITHUB_TOKEN = originalToken;
    });
  });
});
