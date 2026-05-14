/**
 * @file Real implementation of GitAdapter using the GitHub platform module.
 */

import { Temporal } from '@js-temporal/polyfill';
import {
  addReaction,
  deleteReaction,
  createFinalComment,
  postInitialComment,
  getPrompt,
  setCoreAdapter,
  getStartTimeFromContext,
  type CreateReactionType,
} from '../platform/github';
import type { GitAdapter, CommentMetadata, CoreAdapter } from '../types';

/**
 * Production adapter for GitHub platform operations.
 *
 * Wraps the git module to provide a testable interface for platform
 * operations (reactions, comments, prompts).
 */
export class RealGitAdapter implements GitAdapter {
  constructor(private readonly core: CoreAdapter) {
    // Set the module-level CoreAdapter for use by github functions and Pi tools
    setCoreAdapter(core);
  }

  async addReaction() {
    return addReaction();
  }

  async deleteReaction(reaction: CreateReactionType | undefined) {
    await deleteReaction(reaction);
  }

  async postInitialComment(): Promise<void> {
    await postInitialComment();
  }

  async createFinalComment(body: string, metadata: CommentMetadata): Promise<void> {
    await createFinalComment(body, metadata);
  }

  async getPrompt(inputPrompt?: string): Promise<string | undefined> {
    return getPrompt(inputPrompt);
  }

  getStartTime(): Temporal.Instant | undefined {
    return getStartTimeFromContext();
  }
}
