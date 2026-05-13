/**
 * @file update_comment tool definition.
 */

import { Type, Static } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import type { AgentToolResult } from '@earendil-works/pi-coding-agent';
import {
  UPDATE_COMMENT_PROMPT_SNIPPET,
  UPDATE_COMMENT_PROMPT_GUIDELINES,
  UPDATE_COMMENT_DESCRIPTION,
  UPDATE_COMMENT_PARAM_COMMENT_ID_DESCRIPTION,
  UPDATE_COMMENT_PARAM_BODY_DESCRIPTION,
  UPDATE_COMMENT_PARAM_IS_REVIEW_COMMENT_DESCRIPTION,
} from '../prompt';
import { CANCELLATION_MESSAGE_UPDATE_COMMENT } from './constants';
import type { UpdateCommentParams, UpdateCommentDetails, PlatformProvider } from '../../platform';
import { withCancellation } from './tool-execution';

/**
 * Schema for the update_comment tool.
 */
const updateCommentSchema = Type.Object({
  comment_id: Type.Integer({
    description: UPDATE_COMMENT_PARAM_COMMENT_ID_DESCRIPTION,
  }),
  body: Type.String({
    description: UPDATE_COMMENT_PARAM_BODY_DESCRIPTION,
  }),
  is_review_comment: Type.Optional(
    Type.Boolean({
      description: UPDATE_COMMENT_PARAM_IS_REVIEW_COMMENT_DESCRIPTION,
    })
  ),
});

type UpdateCommentToolParams = Static<typeof updateCommentSchema>;

/**
 * Create a success result for the update_comment tool.
 */
function createSuccessResult(details: UpdateCommentDetails): AgentToolResult<UpdateCommentDetails> {
  return {
    content: [{ type: 'text' as const, text: `Comment updated successfully: ${details.url}` }],
    details,
  };
}

/**
 * Create the update_comment tool definition bound to a platform provider.
 *
 * @param provider - The platform provider for comment operations.
 * @returns The tool definition.
 */
export function updateCommentToolFactory(provider: PlatformProvider) {
  return defineTool({
    name: 'update_comment',
    label: 'Update Comment',
    description: UPDATE_COMMENT_DESCRIPTION,
    promptSnippet: UPDATE_COMMENT_PROMPT_SNIPPET,
    promptGuidelines: UPDATE_COMMENT_PROMPT_GUIDELINES,
    parameters: updateCommentSchema,
    execute: withCancellation({
      cancellationMessage: CANCELLATION_MESSAGE_UPDATE_COMMENT,
      cancellationDetails: {
        comment_id: 0,
        url: '',
        updated: false,
      },
      prepareParams: (params: UpdateCommentToolParams) => {
        const { comment_id, body } = params;
        const commentParams: UpdateCommentParams = {
          comment_id,
          body,
        };
        // Only set is_review_comment if explicitly provided
        if (params.is_review_comment !== undefined) {
          commentParams.is_review_comment = params.is_review_comment;
        }
        return commentParams;
      },
      execute: async (params: UpdateCommentParams) => {
        const result = await provider.updateComment(params);
        return createSuccessResult(result);
      },
    }),
  });
}
