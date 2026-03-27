/**
 * @file Pi extension factory – registers custom tools with the agent.
 *
 * Defines two tools that extend Pi's built-in capabilities:
 *
 * - **`create_pull_request`** – creates a GitHub pull request with the current
 *   working-tree changes.
 * - **`get_issue_or_pr_thread`** – fetches the full comment thread of an issue
 *   or pull request for context.
 *
 * The exported {@link extFactory} function is passed to the Pi SDK resource
 * loader so that the tools are available during agent sessions.
 */

import { Type } from '@mariozechner/pi-ai';
import * as core from '@actions/core';
import { Temporal } from '@js-temporal/polyfill';
import { createPullRequest, getIssueOrPRThread } from './github/index';
import { CANCELLATION_MESSAGE_CREATE_PR, CANCELLATION_MESSAGE_GET_THREAD } from './github/index';
import {
  CREATE_PULL_REQUEST_PROMPT_SNIPPET,
  CREATE_PULL_REQUEST_PROMPT_GUIDELINES,
  CREATE_PULL_REQUEST_DESCRIPTION,
  CREATE_PULL_REQUEST_PARAM_TITLE_DESCRIPTION,
  CREATE_PULL_REQUEST_PARAM_BODY_DESCRIPTION,
  CREATE_PULL_REQUEST_PARAM_BASE_DESCRIPTION,
  CREATE_PULL_REQUEST_PARAM_DRY_RUN_DESCRIPTION,
  GET_ISSUE_PR_THREAD_PROMPT_SNIPPET,
  GET_ISSUE_PR_THREAD_PROMPT_GUIDELINES,
  GET_ISSUE_PR_THREAD_DESCRIPTION,
  GET_ISSUE_PR_THREAD_PARAM_OWNER_DESCRIPTION,
  GET_ISSUE_PR_THREAD_PARAM_REPO_DESCRIPTION,
  GET_ISSUE_PR_THREAD_PARAM_ISSUE_NUMBER_DESCRIPTION,
  GET_ISSUE_PR_THREAD_PARAM_MAX_COMMENTS_DESCRIPTION,
} from './prompt';
import type { ExtensionAPI, ToolDefinition, AgentToolResult } from '@mariozechner/pi-coding-agent';
import type {
  CreatePullRequestParams,
  CreatePullRequestDetails,
  GetIssueOrPRThreadParams,
  IssueOrPRThread,
} from './github/index';

/**
 * Log the start of a tool execution and check for cancellation.
 *
 * @param toolName - Name of the tool being invoked (used in log output).
 * @param signal   - Optional `AbortSignal` to check for cancellation.
 * @returns `true` if the tool was cancelled and execution should stop,
 *          `false` to continue.
 */
function handleToolStart(toolName: string, signal: AbortSignal | undefined): boolean {
  console.info('\n');
  console.info(`\n[tool called] === ${toolName} ===`);
  console.info('\n');

  if (signal?.aborted) {
    console.warn(`[${toolName}] Tool execution cancelled`);
    return true;
  }

  return false;
}

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

  async execute(
    _toolCallId,
    params,
    signal,
    _onUpdate,
    _ctx
  ): Promise<AgentToolResult<CreatePullRequestDetails>> {
    if (handleToolStart('create_pull_request', signal)) {
      return {
        content: [{ type: 'text' as const, text: CANCELLATION_MESSAGE_CREATE_PR }],
        details: {
          pullRequestNumber: 0,
          pullRequestUrl: '',
          headBranch: '',
          baseBranch: '',
          dryRun: false,
          cancelled: true,
        },
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

/**
 * Format an {@link IssueOrPRThread} into a human-readable text summary.
 *
 * @param thread - The thread data to format.
 * @returns A multi-line string representation of the thread.
 */
function formatThreadAsText(thread: IssueOrPRThread): string {
  const lines: string[] = [
    `${thread.is_pull_request ? 'Pull Request' : 'Issue'} #${thread.number}: ${thread.title}`,
    '',
    `State: ${thread.state.toUpperCase()}`,
    `Author: @${thread.author}${thread.author_type === 'bot' ? ' (bot)' : ''}`,
  ];

  if (thread.created_at) {
    lines.push(`Created: ${Temporal.Instant.from(thread.created_at).toString()}`);
  }

  if (thread.updated_at) {
    lines.push(`Updated: ${Temporal.Instant.from(thread.updated_at).toString()}`);
  }

  if (thread.closed_at) {
    lines.push(`Closed: ${Temporal.Instant.from(thread.closed_at).toString()}`);
  }
  if (thread.merged_at) {
    lines.push(`Merged: ${Temporal.Instant.from(thread.merged_at).toString()}`);
  }

  if (thread.labels.length > 0) {
    lines.push(`Labels: ${thread.labels.map(l => `"${l}"`).join(', ')}`);
  }

  if (thread.is_pull_request) {
    lines.push(
      `Head Branch: ${thread.head_branch ?? 'unknown'}`,
      `Base Branch: ${thread.base_branch ?? 'unknown'}`,
      `Head SHA: ${thread.head_sha ?? 'unknown'}`
    );
  }

  lines.push('');
  if (thread.body) {
    lines.push('Description:');
    lines.push(thread.body);
    lines.push('');
  }

  lines.push(`Comments (${thread.comments.length}):`);
  thread.comments.forEach((comment, i) => {
    const triggerMark = comment.is_triggering_comment ? ' [📍 triggering comment]' : '';
    lines.push(
      `  ${i + 1}. @${comment.author}${comment.author_type === 'bot' ? ' (bot)' : ''}${triggerMark}`,
      `     ${Temporal.Instant.from(comment.created_at).toString()}`,
      `     ${comment.body}`
    );
  });

  return lines.join('\n');
}

const getIssueOrPRThreadTool: ToolDefinition = {
  name: 'get_issue_or_pr_thread',
  label: 'Get Issue/PR Thread',
  description: GET_ISSUE_PR_THREAD_DESCRIPTION,
  promptSnippet: GET_ISSUE_PR_THREAD_PROMPT_SNIPPET,
  promptGuidelines: GET_ISSUE_PR_THREAD_PROMPT_GUIDELINES,
  parameters: Type.Object({
    owner: Type.Optional(
      Type.String({
        description: GET_ISSUE_PR_THREAD_PARAM_OWNER_DESCRIPTION,
      })
    ),
    repo: Type.Optional(
      Type.String({
        description: GET_ISSUE_PR_THREAD_PARAM_REPO_DESCRIPTION,
      })
    ),
    issue_number: Type.Optional(
      Type.Integer({
        description: GET_ISSUE_PR_THREAD_PARAM_ISSUE_NUMBER_DESCRIPTION,
      })
    ),
    max_comments: Type.Optional(
      Type.Integer({
        description: GET_ISSUE_PR_THREAD_PARAM_MAX_COMMENTS_DESCRIPTION,
      })
    ),
  }),

  async execute(
    _toolCallId,
    params,
    signal,
    _onUpdate,
    _ctx
  ): Promise<AgentToolResult<IssueOrPRThread>> {
    if (handleToolStart('get_issue_or_pr_thread', signal)) {
      return {
        content: [{ type: 'text' as const, text: CANCELLATION_MESSAGE_GET_THREAD }],
        details: {
          number: 0,
          title: 'Cancelled',
          body: CANCELLATION_MESSAGE_GET_THREAD,
          state: 'closed',
          author: 'unknown',
          author_type: 'user',
          created_at: undefined,
          updated_at: undefined,
          closed_at: undefined,
          merged_at: undefined,
          labels: [],
          is_pull_request: false,
          head_branch: undefined,
          base_branch: undefined,
          head_sha: undefined,
          comments: [],
          cancelled: true,
        },
      };
    }

    const result = await getIssueOrPRThread(params as GetIssueOrPRThreadParams);

    if (!result) {
      return {
        content: [{ type: 'text' as const, text: 'Issue or pull request not found' }],
        details: {
          number: 0,
          title: 'Not Found',
          body: null,
          state: 'closed',
          author: 'unknown',
          author_type: 'user',
          created_at: undefined,
          updated_at: undefined,
          closed_at: undefined,
          merged_at: undefined,
          labels: [],
          is_pull_request: false,
          head_branch: undefined,
          base_branch: undefined,
          head_sha: undefined,
          comments: [],
        },
      };
    }

    const threadSummary = formatThreadAsText(result);

    return {
      content: [{ type: 'text' as const, text: threadSummary }],
      details: result,
    };
  },
};

/**
 * Extension factory that registers all custom tools with the Pi agent.
 *
 * Called by the Pi SDK resource loader during session initialisation. Registers
 * the `create_pull_request` and `get_issue_or_pr_thread` tools.
 *
 * @param pi - The Pi extension API used to register tools.
 */
export const extFactory = (pi: ExtensionAPI): void => {
  const tools = [createPRTool, getIssueOrPRThreadTool];
  tools.forEach(tool => {
    pi.registerTool(tool);
    core.debug(`[${tool.name}] Tool registered successfully`);
  });
};
