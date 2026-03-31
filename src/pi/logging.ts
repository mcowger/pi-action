/**
 * @file Context visualization extension for Pi GitHub Action.
 *
 * Provides a nicely formatted view of the agent context before session starts
 * and after session ends, including system prompt, tools and configuration.
 */

import type { CoreAdapter } from '../types';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

/**
 * Injected at build time because Pi SDK 'VERSION' doesn't play well with bundles
 */
declare const __PI_CODING_AGENT_VERSION__: string;

export const loggingFactory = (pi: ExtensionAPI, core: CoreAdapter) => {
  pi.on('tool_execution_start', async event => {
    core.info('');
    core.debug(`🔧 Tool Execution started: ${event.toolName} (${event.toolCallId})`);
  });

  pi.on('tool_execution_end', async event => {
    core.info(`::group::🔧 Tool Execution: ${event.toolName}`);
    core.info(`  Tool Call ID: ${event.toolCallId}`);

    // Check for cancellation via details.cancelled pattern
    const cancelled = event.result?.details?.cancelled === true;

    if (cancelled) {
      core.warning(`  ⚠️ execution cancelled`);
    } else if (event.isError) {
      core.info(`  ❌ execution failed`);
    } else {
      core.info(`  ✅ execution succeeded`);
    }
    core.info('::endgroup::');
  });

  pi.on('before_agent_start', async (event, ctx) => {
    core.info('::group::🤖 Agent Session settings');
    core.info(`  Running @mariozechner/pi-coding-agent@${getVersion()}`);
    core.info('─────────────────────────────────────────────────────────────────────');

    const model = ctx.model;
    const thinkingLevel = pi.getThinkingLevel();
    core.info('📊 LLM');
    if (model) {
      core.info(`  Model:            ${model.provider}/${model.id}`);
      core.info(`  Reasoning:        ${model.reasoning}`);
    } else {
      core.info('  Model:     Not configured');
    }
    core.info(`  Thinking Level:   ${thinkingLevel}`);
    core.info('─────────────────────────────────────────────────────────────────────');

    const allTools = pi.getAllTools();
    if (allTools.length > 0) {
      core.info('🔧 Available Tools');
      allTools.forEach(tool => {
        if (tool.sourceInfo.source) {
          core.info(`  • [${tool.sourceInfo.source}] ${tool.name}`);
        } else {
          core.info(`  • ${tool.name}`);
        }
      });
      core.info('─────────────────────────────────────────────────────────────────────');
    }

    const systemPrompt = ctx.getSystemPrompt();
    core.info('📝 System Prompt');
    const displaySystemPrompt = truncateText(systemPrompt, 1000);
    core.info(displaySystemPrompt);
    if (systemPrompt.length > 1000) {
      core.info(`\n... (${systemPrompt.length - 1000} more characters)`);
    }
    core.info('─────────────────────────────────────────────────────────────────────');

    core.info('👤 User Prompt');
    core.info(truncateText(event.prompt, 500));
    if (event.images && event.images.length > 0) {
      core.info(`  [${event.images.length} image(s) attached]`);
    }
    core.info('::endgroup::');

    core.info('════════════════════════════════════════════════════════════════');
    core.info('🚀 Starting agent session...');
    core.info('════════════════════════════════════════════════════════════════');
  });

  pi.on('agent_end', async () => {
    core.info('\n');
    core.info('════════════════════════════════════════════════════════════════');
    core.info('✅ Agent session completed');
    core.info('════════════════════════════════════════════════════════════════');
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

export function getVersion(): string {
  return typeof __PI_CODING_AGENT_VERSION__ === 'string' ? __PI_CODING_AGENT_VERSION__ : 'unknown';
}

/**
 * Create a logging factory bound to a specific CoreAdapter.
 *
 * This is a convenience wrapper that curries the CoreAdapter for use with
 * the Pi SDK's extension system.
 *
 * @param core - The CoreAdapter to use for logging.
 * @returns A factory function compatible with the Pi SDK's extension system.
 */
export function createLoggingFactory(core: CoreAdapter) {
  return (pi: ExtensionAPI) => loggingFactory(pi, core);
}
