/**
 * @file GitHub Action entry point.
 *
 * Orchestrates the action by creating adapters and passing them to the
 * ActionOrchestrator, which handles the complete execution flow.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';

// Read version from package.json at runtime
const packageJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
);
globalThis.__VERSION__ = packageJson.version;
import { ActionOrchestrator } from './orchestrator';
import { RealCoreAdapter } from './adapters/core-adapter';
import { RealGitAdapter } from './adapters/git-adapter';
import { createRealPiAgent } from './adapters/pi-agent-adapter';
import { createPlatformProvider } from './platform';

/**
 * Run the Pi coding agent end-to-end.
 *
 * Creates real adapters for Core, Git platform, and Pi agent, then passes them
 * to the orchestrator which handles the execution flow.
 *
 * @throws Rethrows any error from the orchestrator.
 */
export async function run() {
  const coreAdapter = new RealCoreAdapter();
  const gitAdapter = new RealGitAdapter(coreAdapter);
  const platformProvider = createPlatformProvider();
  const orchestrator = new ActionOrchestrator(
    coreAdapter,
    gitAdapter,
    createRealPiAgent,
    platformProvider
  );

  await orchestrator.execute();
}


run().catch(error => {
  // Safety net – the orchestrator should have already called core.setFailed,
  // but ensure the action is always marked as failed on any unhandled error.
  console.error('Unhandled error in run():', error);
  core.setFailed(`Unhandled error: ${error instanceof Error ? error.message : String(error)}`);
});
