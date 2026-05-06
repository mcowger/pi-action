/**
 * @file Platform module barrel export.
 *
 * Re-exports platform types and the GitHub platform provider.
 */

export {
  type PlatformContext,
  type PlatformProvider,
  type IssueOrPRThread,
  type ThreadComment,
  type ReviewComment,
  type GetIssueOrPRThreadParams,
  type CreatePullRequestParams,
  type CreatePullRequestDetails,
  type UpdatePullRequestParams,
  type UpdatePullRequestDetails,
  type CreateReactionType,
  type AddIssueCommentParams,
  type AddIssueCommentDetails,
  type UpdateCommentParams,
  type UpdateCommentDetails,
  type CreateInlineCommentParams,
  type CreateInlineCommentDetails,
  type ListCommentsParams,
  type ListCommentsDetails,
} from './types';

export { createPlatformProvider } from './github/index';
