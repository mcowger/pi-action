import { Type } from '@mariozechner/pi-ai';
import * as core from '@actions/core';
import { createPullRequest, getIssueOrPRThread } from './github/index';
import {
  CANCELLATION_MESSAGE_CREATE_PR,
  CANCELLATION_MESSAGE_GET_THREAD,
} from './github/index';
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
import type { ExtensionAPI, ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { CreatePullRequestParams, GetIssueOrPRThreadParams, IssueOrPRThread } from './github/index';

/**
 * Helper to handle common tool execution setup: logging and cancellation check.
 * Returns true if execution should stop (cancelled), false to continue.
 */
function handleToolStart(toolName: string, signal: AbortSignal | undefined): boolean {
  console.info(`\n=== ${toolName} tool called ===`);

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

  async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
    if (handleToolStart('create_pull_request', signal)) {
      return {
        content: [{ type: 'text' as const, text: CANCELLATION_MESSAGE_CREATE_PR }],
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

function formatThreadAsText(thread: IssueOrPRThread): string {
  const lines: string[] = [
    `${thread.is_pull_request ? 'Pull Request' : 'Issue'} #${thread.number}: ${thread.title}`,
    '',
    `State: ${thread.state.toUpperCase()}`,
    `Author: @${thread.author}${thread.author_type === 'bot' ? ' (bot)' : ''}`,
  ];

  if (thread.created_at) {
    lines.push(`Created: ${new Date(thread.created_at).toISOString()}`);
  }

  if (thread.updated_at) {
    lines.push(`Updated: ${new Date(thread.updated_at).toISOString()}`);
  }

  if (thread.closed_at) {
    lines.push(`Closed: ${new Date(thread.closed_at).toISOString()}`);
  }
  if (thread.merged_at) {
    lines.push(`Merged: ${new Date(thread.merged_at).toISOString()}`);
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
      `     ${new Date(comment.created_at).toISOString()}`,
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

  async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
    if (handleToolStart('get_issue_or_pr_thread', signal)) {
      return {
        content: [{ type: 'text' as const, text: CANCELLATION_MESSAGE_GET_THREAD }],
        details: {},
      };
    }

    const result = await getIssueOrPRThread(params as GetIssueOrPRThreadParams);

    if (!result) {
      return {
        content: [{ type: 'text' as const, text: 'Issue or pull request not found' }],
        details: {},
      };
    }

    const threadSummary = formatThreadAsText(result);

    return {
      content: [{ type: 'text' as const, text: threadSummary }],
      details: result,
    };
  },
};

export const extFactory = (pi: ExtensionAPI): void => {
  const tools = [createPRTool, getIssueOrPRThreadTool];
  tools.forEach(tool => {
    pi.registerTool(tool);
    core.info(`[${tool.name}] Tool registered successfully`);
  });
};
