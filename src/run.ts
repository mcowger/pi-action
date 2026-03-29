/**
 * @file GitHub Action entry point.
 *
 * Orchestrates the action by creating adapters and passing them to the
 * ActionOrchestrator, which handles the complete execution flow.
 */

import { ActionOrchestrator } from './orchestrator';
import { RealCoreAdapter } from './adapters/core-adapter';
import { RealGitHubAdapter } from './adapters/github-adapter';
import { createRealPiAgent } from './adapters/pi-agent-adapter';

/**
 * Run the Pi coding agent end-to-end.
 *
 * Creates real adapters for Core, GitHub, and Pi agent, then passes them
 * to the orchestrator which handles the execution flow.
 *
 * @throws Rethrows any error from the orchestrator.
 */
export async function run() {
  const coreAdapter = new RealCoreAdapter();
  const githubAdapter = new RealGitHubAdapter();
  const orchestrator = new ActionOrchestrator(coreAdapter, githubAdapter, createRealPiAgent);

  await orchestrator.execute();
}

run().catch(error => {
  // This catch block is a safety net; the orchestrator already calls core.setFailed
  console.error('Unhandled error in run():', error);
});
