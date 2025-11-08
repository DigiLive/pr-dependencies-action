import * as core from '@actions/core';
import { Octokit as OctoKitCore } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { PRDependencyChecker } from './PRDependencyChecker';
import { throttlingConfig } from './config';

const ThrottledOctokit = OctoKitCore.plugin(throttling);
const myToken = process.env.GITHUB_TOKEN;

/**
 * The main entry point for the GitHub Action.
 *
 * This function:
 * 1. Initializes the GitHub client with authentication and rate limiting.
 * 2. Validates required environment variables.
 * 3. Executes the PR dependency evaluation.
 * 4. Handles and reports any errors that occur during execution.
 *
 * @throws {Error} When GITHUB_TOKEN is not set or when evaluation fails.
 * @returns {Promise<void>} Resolves when the action completes successfully.
 */
async function run(): Promise<void> {
  try {
    core.info('Initializing the action...');
    if (!myToken) {
      throw new Error('GITHUB_TOKEN environment variable is not set.');
    }

    const octokit = new ThrottledOctokit({
      auth: myToken,
      throttle: throttlingConfig,
    });

    core.info('Initialization completed. Starting...');

    const checker = new PRDependencyChecker(octokit);
    await checker.evaluate();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.setFailed(errorMessage);
  }
}

run().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  core.error(`Unhandled error in run(): ${errorMessage}`);
  process.exit(1);
});
