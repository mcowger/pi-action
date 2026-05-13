/**
 * @file list_comments tool definition.
 */

import { Type, Static } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import {
  LIST_COMMENTS_PROMPT_SNIPPET,
  LIST_COMMENTS_PROMPT_GUIDELINES,
  LIST_COMMENTS_DESCRIPTION,
  LIST_COMMENTS_PARAM_ISSUE_NUMBER_DESCRIPTION,
  LIST_COMMENTS_PARAM_PULL_NUMBER_DESCRIPTION,
  LIST_COMMENTS_PARAM_INCLUDE_ISSUE_COMMENTS_DESCRIPTION,
  LIST_COMMENTS_PARAM_INCLUDE_REVIEW_COMMENTS_DESCRIPTION,
} from '../prompt';
import { CANCELLATION_MESSAGE_LIST_COMMENTS } from './constants';
import type { ListCommentsParams, ListCommentsDetails, PlatformProvider } from '../../platform';
import { withCancellation } from './tool-execution';

/**
 * Schema for the list_comments tool.
 */
const listCommentsSchema = Type.Object({
  issue_number: Type.Optional(
    Type.Integer({
      description: LIST_COMMENTS_PARAM_ISSUE_NUMBER_DESCRIPTION,
    })
  ),
  pull_number: Type.Optional(
    Type.Integer({
      description: LIST_COMMENTS_PARAM_PULL_NUMBER_DESCRIPTION,
    })
  ),
  include_issue_comments: Type.Optional(
    Type.Boolean({
      description: LIST_COMMENTS_PARAM_INCLUDE_ISSUE_COMMENTS_DESCRIPTION,
    })
  ),
  include_review_comments: Type.Optional(
    Type.Boolean({
      description: LIST_COMMENTS_PARAM_INCLUDE_REVIEW_COMMENTS_DESCRIPTION,
    })
  ),
});

type ListCommentsToolParams = Static<typeof listCommentsSchema>;

/**
 * Format the comments list as text.
 */
function formatCommentsAsText(details: ListCommentsDetails): string {
  const lines: string[] = [];

  if (details.issue_comments.length > 0) {
    lines.push(`## Issue Comments (${details.total_issue_comments} total)`);
    for (const comment of details.issue_comments) {
      lines.push(
        `- **#${comment.id}** by ${comment.author} (${comment.author_type}) on ${comment.created_at}`
      );
      lines.push(`  ${comment.body.substring(0, 200)}${comment.body.length > 200 ? '...' : ''}`);
    }
  }

  if (details.review_comments.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(`## Review Comments (${details.total_review_comments} total)`);
    for (const comment of details.review_comments) {
      lines.push(
        `- **#${comment.id}** on \`${comment.path}:${comment.line}\` by ${comment.author}`
      );
      lines.push(`  ${comment.body.substring(0, 200)}${comment.body.length > 200 ? '...' : ''}`);
    }
  }

  if (lines.length === 0) {
    return 'No comments found.';
  }

  return lines.join('\n');
}

/**
 * Create the list_comments tool definition bound to a platform provider.
 *
 * @param provider - The platform provider for comment operations.
 * @returns The tool definition.
 */
export function listCommentsToolFactory(provider: PlatformProvider) {
  return defineTool({
    name: 'list_comments',
    label: 'List Comments',
    description: LIST_COMMENTS_DESCRIPTION,
    promptSnippet: LIST_COMMENTS_PROMPT_SNIPPET,
    promptGuidelines: LIST_COMMENTS_PROMPT_GUIDELINES,
    parameters: listCommentsSchema,
    execute: withCancellation({
      cancellationMessage: CANCELLATION_MESSAGE_LIST_COMMENTS,
      cancellationDetails: {
        issue_comments: [],
        review_comments: [],
        total_issue_comments: 0,
        total_review_comments: 0,
      },
      prepareParams: (params: ListCommentsToolParams) => {
        const result: ListCommentsParams = {};
        if (params.issue_number !== undefined) {
          result.issue_number = params.issue_number;
        }
        if (params.pull_number !== undefined) {
          result.pull_number = params.pull_number;
        }
        if (params.include_issue_comments !== undefined) {
          result.include_issue_comments = params.include_issue_comments;
        }
        if (params.include_review_comments !== undefined) {
          result.include_review_comments = params.include_review_comments;
        }
        return result;
      },
      execute: async (params: ListCommentsParams) => {
        const result = await provider.listComments(params);
        const text = formatCommentsAsText(result);
        return {
          content: [{ type: 'text' as const, text }],
          details: result,
        };
      },
    }),
  });
}
