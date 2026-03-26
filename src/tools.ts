import { Type } from '@mariozechner/pi-ai';
import * as core from '@actions/core';
import { createPullRequest } from './github';
import type { ExtensionAPI, ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { CreatePullRequestParams } from './github';
import {
  CREATE_PULL_REQUEST_PROMPT_SNIPPET,
  CREATE_PULL_REQUEST_PROMPT_GUIDELINES,
  CREATE_PULL_REQUEST_DESCRIPTION,
  CREATE_PULL_REQUEST_PARAM_TITLE_DESCRIPTION,
  CREATE_PULL_REQUEST_PARAM_BODY_DESCRIPTION,
  CREATE_PULL_REQUEST_PARAM_BASE_DESCRIPTION,
  CREATE_PULL_REQUEST_PARAM_DRY_RUN_DESCRIPTION,
} from './prompt';

const createPRTool: ToolDefinition = {
  name: 'create_pull_request',
  label: 'Create Pull Request',
  description: CREATE_PULL_REQUEST_DESCRIPTION,
  promptSnippet: CREATE_PULL_REQUEST_PROMPT_SNIPPET,
  promptGuidelines: CREATE_PULL_REQUEST_PROMPT_GUIDELINES,
  parameters: Type.Object({
    title: Type.String({
      description: CREATE_PULL_REQUEST_PARAM_TITLE_DESCRIPTION,
    }),
    body: Type.Optional(
      Type.String({
        description: CREATE_PULL_REQUEST_PARAM_BODY_DESCRIPTION,
      })
    ),
    base: Type.Optional(
      Type.String({
        description: CREATE_PULL_REQUEST_PARAM_BASE_DESCRIPTION,
      })
    ),
    dryRun: Type.Optional(
      Type.Boolean({
        description: CREATE_PULL_REQUEST_PARAM_DRY_RUN_DESCRIPTION,
      })
    ),
  }),

  async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
    core.debug('\n=== create_pull_request tool called ===');

    // Check for cancellation
    if (signal?.aborted) {
      core.warning('[create_pull_request] Tool execution cancelled');

      return {
        content: [{ type: 'text' as const, text: 'Pull request creation was cancelled' }],
        details: {},
      };
    }

    const { title, body, base, dryRun } = params as CreatePullRequestParams;

    // Delegate to the GitHub-specific implementation
    const prParams: CreatePullRequestParams = { title };
    if (body !== undefined) {
      prParams.body = body;
    }
    if (base !== undefined) {
      prParams.base = base;
    }
    if (dryRun !== undefined) {
      prParams.dryRun = dryRun;
    }

    return await createPullRequest(prParams);
  },
};

export const extFactory = (pi: ExtensionAPI): void => {
  const tools = [createPRTool];
  tools.forEach(tool => {
    pi.registerTool(tool);
    core.info(`[${tool.name}] Tool registered successfully`);
  });
};
