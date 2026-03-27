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

// Constants
export {
  REACTION_TYPE_EYES,
  FILE_MODE_REGULAR,
  FILE_MODE_EXECUTABLE,
  FILE_MODE_DIRECTORY,
  MAX_FILE_SIZE_BYTES,
  BRANCH_PREFIX,
  CANCELLATION_MESSAGE_CREATE_PR,
  CANCELLATION_MESSAGE_GET_THREAD,
  IGNORE_PATTERNS,
} from './constants.js';
