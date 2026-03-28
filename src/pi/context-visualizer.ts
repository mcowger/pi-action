/**
 * @file Context visualization extension for Pi GitHub Action.
 *
 * Provides a nicely formatted view of the agent context before session starts,
 * including system prompt, conversation history, tools, and configuration.
 */

import * as core from '@actions/core';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export const contextVisualizerFactory = (pi: ExtensionAPI) => {
  pi.on('before_agent_start', async (event, ctx) => {
    core.info('::group::🤖 Agent Configuration');
    core.info('╔════════════════════════════════════════════════════════════════╗');
    core.info('║                  🤖 AGENT SESSION CONTEXT                      ║');
    core.info('╚════════════════════════════════════════════════════════════════╝');
    core.info('');

    // Model configuration
    const model = ctx.model;
    core.info('📊 Configuration');
    core.info('─────────────────────────────────────────────────────────────────────');
    if (model) {
      core.info(`  Model:      ${model.provider}/${model.id}`);
      core.info(`  Reasoning:  ${model.reasoning}`);
    } else {
      core.info('  Model:     Not configured');
    }

    // System prompt
    const systemPrompt = ctx.getSystemPrompt();
    core.info('📝 System Prompt');
    core.info('─────────────────────────────────────────────────────────────────────');
    const displaySystemPrompt = truncateText(systemPrompt, 1000);
    core.info(displaySystemPrompt);
    if (systemPrompt.length > 1000) {
      core.info(`\n... (${systemPrompt.length - 1000} more characters)`);
    }
    core.info('');

    // Current user prompt
    core.info('👤 User Prompt');
    core.info('─────────────────────────────────────────────────────────────────────');
    core.info(truncateText(event.prompt, 500));
    if (event.images && event.images.length > 0) {
      core.info(`  [${event.images.length} image(s) attached]`);
    }
    core.info('::endgroup::');

    core.info('════════════════════════════════════════════════════════════════');
    core.info('🚀 Starting agent session...');
    core.info('════════════════════════════════════════════════════════════════');
    core.info('');
  });
};

/**
 * Truncate text to a maximum length, preserving word boundaries.
 */
function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) {
    return text;
  }

  const truncated = text.substring(0, maxLength);
  // Find the last complete word
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  }
  return truncated + '...';
}
