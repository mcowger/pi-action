/**
 * @file add_issue_comment tool definition.
 */

import { Type, Static } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import type { AgentToolResult } from '@earendil-works/pi-coding-agent';
import {
  ADD_ISSUE_COMMENT_PROMPT_SNIPPET,
  ADD_ISSUE_COMMENT_PROMPT_GUIDELINES,
  ADD_ISSUE_COMMENT_DESCRIPTION,
  ADD_ISSUE_COMMENT_PARAM_ISSUE_NUMBER_DESCRIPTION,
  ADD_ISSUE_COMMENT_PARAM_BODY_DESCRIPTION,
} from '../prompt';
import { CANCELLATION_MESSAGE_ADD_ISSUE_COMMENT } from './constants';
import type {
  AddIssueCommentParams,
  AddIssueCommentDetails,
  PlatformProvider,
} from '../../platform';
import { withCancellation } from './tool-execution';

/**
 * Schema for the add_issue_comment tool.
 */
const addIssueCommentSchema = Type.Object({
  issue_number: Type.Optional(
    Type.Integer({
      description: ADD_ISSUE_COMMENT_PARAM_ISSUE_NUMBER_DESCRIPTION,
    })
  ),
  body: Type.String({
    description: ADD_ISSUE_COMMENT_PARAM_BODY_DESCRIPTION,
  }),
});

type AddIssueCommentToolParams = Static<typeof addIssueCommentSchema>;

/**
 * Create a success result for the add_issue_comment tool.
 */
function createSuccessResult(
  details: AddIssueCommentDetails
): AgentToolResult<AddIssueCommentDetails> {
  return {
    content: [{ type: 'text' as const, text: `Comment added successfully: ${details.url}` }],
    details,
  };
}

/**
 * Create the add_issue_comment tool definition bound to a platform provider.
 *
 * @param provider - The platform provider for comment operations.
 * @returns The tool definition.
 */
export function addIssueCommentToolFactory(provider: PlatformProvider) {
  return defineTool({
    name: 'add_issue_comment',
    label: 'Add Issue Comment',
    description: ADD_ISSUE_COMMENT_DESCRIPTION,
    promptSnippet: ADD_ISSUE_COMMENT_PROMPT_SNIPPET,
    promptGuidelines: ADD_ISSUE_COMMENT_PROMPT_GUIDELINES,
    parameters: addIssueCommentSchema,
    execute: withCancellation({
      cancellationMessage: CANCELLATION_MESSAGE_ADD_ISSUE_COMMENT,
      cancellationDetails: {
        comment_id: 0,
        issue_number: 0,
        url: '',
      },
      prepareParams: (params: AddIssueCommentToolParams) => {
        const { issue_number, body } = params;
        const commentParams: AddIssueCommentParams = {
          issue_number: issue_number ?? 0,
          body,
        };
        return commentParams;
      },
      execute: async (params: AddIssueCommentParams) => {
        const result = await provider.addIssueComment(params);
        return createSuccessResult(result);
      },
    }),
  });
}
