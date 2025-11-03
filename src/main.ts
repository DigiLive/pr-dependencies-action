import * as core from '@actions/core';
import { evaluate } from './pr-dependency-checker';

async function run() {
  try {
    await evaluate();
  } catch (error) {
    // Log the error to the GitHub Actions console
    core.setFailed((error as Error).message);
  }
}

// Execute the run function and handle the Promise
run().catch(error => {
  core.error(`Unhandled error in run(): ${error}`);
  process.exit(1);
});
