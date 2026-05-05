/**
 * @file create_inline_comment tool definition.
 */

import { Type, Static } from 'typebox';
import { defineTool } from '@mariozechner/pi-coding-agent';
import type { AgentToolResult } from '@mariozechner/pi-coding-agent';
import {
  CREATE_INLINE_COMMENT_PROMPT_SNIPPET,
  CREATE_INLINE_COMMENT_PROMPT_GUIDELINES,
  CREATE_INLINE_COMMENT_DESCRIPTION,
  CREATE_INLINE_COMMENT_PARAM_PULL_NUMBER_DESCRIPTION,
  CREATE_INLINE_COMMENT_PARAM_BODY_DESCRIPTION,
  CREATE_INLINE_COMMENT_PARAM_PATH_DESCRIPTION,
  CREATE_INLINE_COMMENT_PARAM_LINE_DESCRIPTION,
  CREATE_INLINE_COMMENT_PARAM_SIDE_DESCRIPTION,
  CREATE_INLINE_COMMENT_PARAM_COMMIT_ID_DESCRIPTION,
  CREATE_INLINE_COMMENT_PARAM_START_LINE_DESCRIPTION,
  CREATE_INLINE_COMMENT_PARAM_START_SIDE_DESCRIPTION,
} from '../prompt';
import { CANCELLATION_MESSAGE_CREATE_INLINE_COMMENT } from './constants';
import type {
  CreateInlineCommentParams,
  CreateInlineCommentDetails,
  PlatformProvider,
} from '../../platform';
import { withCancellation } from './tool-execution';

/**
 * Schema for the create_inline_comment tool.
 */
const createInlineCommentSchema = Type.Object({
  pull_number: Type.Optional(
    Type.Integer({
      description: CREATE_INLINE_COMMENT_PARAM_PULL_NUMBER_DESCRIPTION,
    })
  ),
  body: Type.String({
    description: CREATE_INLINE_COMMENT_PARAM_BODY_DESCRIPTION,
  }),
  path: Type.String({
    description: CREATE_INLINE_COMMENT_PARAM_PATH_DESCRIPTION,
  }),
  line: Type.Integer({
    description: CREATE_INLINE_COMMENT_PARAM_LINE_DESCRIPTION,
  }),
  side: Type.Optional(
    Type.Union([Type.Literal('LEFT'), Type.Literal('RIGHT')], {
      description: CREATE_INLINE_COMMENT_PARAM_SIDE_DESCRIPTION,
    })
  ),
  commit_id: Type.Optional(
    Type.String({
      description: CREATE_INLINE_COMMENT_PARAM_COMMIT_ID_DESCRIPTION,
    })
  ),
  start_line: Type.Optional(
    Type.Integer({
      description: CREATE_INLINE_COMMENT_PARAM_START_LINE_DESCRIPTION,
    })
  ),
  start_side: Type.Optional(
    Type.Union([Type.Literal('LEFT'), Type.Literal('RIGHT')], {
      description: CREATE_INLINE_COMMENT_PARAM_START_SIDE_DESCRIPTION,
    })
  ),
});

type CreateInlineCommentToolParams = Static<typeof createInlineCommentSchema>;

/**
 * Create a success result for the create_inline_comment tool.
 */
function createSuccessResult(details: CreateInlineCommentDetails): AgentToolResult<CreateInlineCommentDetails> {
  return {
    content: [{ type: 'text' as const, text: `Inline comment created successfully: ${details.url}` }],
    details,
  };
}

/**
 * Create the create_inline_comment tool definition bound to a platform provider.
 *
 * @param provider - The platform provider for comment operations.
 * @returns The tool definition.
 */
export function createInlineCommentToolFactory(provider: PlatformProvider) {
  return defineTool({
    name: 'create_inline_comment',
    label: 'Create Inline Comment',
    description: CREATE_INLINE_COMMENT_DESCRIPTION,
    promptSnippet: CREATE_INLINE_COMMENT_PROMPT_SNIPPET,
    promptGuidelines: CREATE_INLINE_COMMENT_PROMPT_GUIDELINES,
    parameters: createInlineCommentSchema,
    execute: withCancellation({
      cancellationMessage: CANCELLATION_MESSAGE_CREATE_INLINE_COMMENT,
      cancellationDetails: {
        comment_id: 0,
        pull_number: 0,
        path: '',
        line: 0,
        url: '',
      },
      prepareParams: (params: CreateInlineCommentToolParams) => {
        const { pull_number, body, path, line } = params;
        const base: Pick<CreateInlineCommentParams, 'pull_number' | 'body' | 'path' | 'line'> = {
          pull_number: pull_number ?? 0,
          body,
          path,
          line,
        };
        const result: CreateInlineCommentParams = { ...base };
        if (params.side) { result.side = params.side; }
        if (params.commit_id) { result.commit_id = params.commit_id; }
        if (params.start_line) { result.start_line = params.start_line; }
        if (params.start_side) { result.start_side = params.start_side; }
        return result;
      },
      execute: async (params: CreateInlineCommentParams) => {
        const result = await provider.createInlineComment(params);
        return createSuccessResult(result);
      },
    }),
  });
}