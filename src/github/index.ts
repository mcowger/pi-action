/**
 * @file GitHub module barrel export.
 *
 * Re-exports public symbols used by consumers outside the github/ module.
 * Internal implementation details are not exported from this barrel file.
 */

import type { CoreAdapter } from '../types';

/**
 * Module-level CoreAdapter instance.
 *
 * Provides dependency injection for logging and core operations throughout
 * the github module. Must be set before calling any github functions that
 * require logging or input retrieval.
 *
 * Used by both the GitHubAdapter path and Pi tools.
 */
let _coreAdapter: CoreAdapter | undefined;

/**
 * Set the CoreAdapter for the github module.
 *
 * Called by the orchestrator before using any github functions.
 * Tests can inject a mock CoreAdapter for unit testing.
 *
 * @param core - The CoreAdapter instance to use.
 */
export function setCoreAdapter(core: CoreAdapter): void {
  _coreAdapter = core;
}

/**
 * Get the CoreAdapter for the github module.
 *
 * Returns a default noop adapter if none has been set yet. This allows
 * module-level initialization to work during tests.
 *
 * @internal Exported for internal use within the github module.
 */
export function getCoreAdapter(): CoreAdapter {
  if (!_coreAdapter) {
    // Return a default noop adapter for test scenarios
    return {
      getInput: () => '',
      setFailed: () => {
        // Noop for test scenarios
      },
      notice: () => {
        // Noop for test scenarios
      },
      debug: () => {
        // Noop for test scenarios
      },
      info: () => {
        // Noop for test scenarios
      },
      warning: () => {
        // Noop for test scenarios
      },
    };
  }
  return _coreAdapter;
}

// Context extraction functions (used by run.ts)
export {
  getPrompt,
  getIssueOrPRThread,
  getStartTimeFromContext,
  type IssueOrPRThread,
} from './context';

// Reaction management functions (used by run.ts)
export { addReaction, deleteReaction, type CreateReactionType } from './reactions';

// Comment creation functions (used by run.ts)
export { createFinalComment } from './comments';

// Pull request creation functions (used by pi/tools/create-pr.ts)
export {
  createPullRequest,
  type CreatePullRequestParams,
  type CreatePullRequestDetails,
} from './pull-request';

// Pull request update functions (used by pi/tools/update-pr.ts)
export {
  updatePullRequest,
  type UpdatePullRequestParams,
  type UpdatePullRequestDetails,
} from './pull-request-update';

// Cancellation messages (used by pi/tools)
export {
  CANCELLATION_MESSAGE_CREATE_PR,
  CANCELLATION_MESSAGE_GET_THREAD,
  CANCELLATION_MESSAGE_UPDATE_PR,
} from './constants';
