// Octokit client singleton
export { getOctokit } from './octokit.js';

// Context extraction functions
export {
  isPR,
  getContextType,
  getIssueOrPullRequestContext,
  getPrompt,
  getIssueOrPRThread,
  type IssueOrPullRequestContext,
  type ThreadComment,
  type IssueOrPRThread,
  type GetIssueOrPRThreadParams,
} from './context.js';

// Reaction management functions
export {
  addReaction,
  deleteReaction,
  type CreateReactionType,
  type DeleteReactionType,
} from './reactions.js';

// Comment creation functions
export { createFinalComment, type CreateCommentType } from './comments.js';

// Pull request creation functions
export {
  createPullRequest,
  type CreatePullRequestParams,
  type CreatePullRequestResult,
  type CreatePullRequestDetails,
} from './pull-request.js';
