import * as core from '@actions/core';
import { Octokit as OctoKitCore } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { PRDependencyChecker } from './PRDependencyChecker.js';
import { throttlingConfig } from './config.js';

const ThrottledOctokit = OctoKitCore.plugin(throttling);
const apiUrl = process.env.GITHUB_API_URL;
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

    if (!myToken || !apiUrl) {
      throw new Error('GITHUB_TOKEN or GITHUB_API_URL environment variable is not set.');
    }

    core.info(`  Using GitHub Enterprise instance at: ${new URL(apiUrl).hostname}`);
    core.debug(`  API URL: ${apiUrl}`);

    const octokit = new ThrottledOctokit({
      auth: myToken,
      baseUrl: apiUrl,
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
