/**
 * @file GitHub Action entry point.
 *
 * Imports and invokes the main `run` function that orchestrates the Pi coding agent
 * within a GitHub Actions workflow. Any unhandled errors are reported back to
 * GitHub via `core.setFailed`.
 */

import * as core from '@actions/core';
import { run } from './run';

run().catch(error => {
  core.setFailed(error as Error);
});
