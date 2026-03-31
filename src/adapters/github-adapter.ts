/**
 * @file Real implementation of GitHubAdapter using github module.
 *
 * Provides the production implementation for GitHub operations.
 */

import { Temporal } from '@js-temporal/polyfill';
import {
  addReaction,
  deleteReaction,
  createFinalComment,
  getPrompt,
  setCoreAdapter,
} from '../github';
import { getStartTimeFromContext } from '../github/context';
import type { GitHubAdapter, CommentMetadata, CoreAdapter } from '../types';
import type { CreateReactionType } from '../github/reactions';

/**
 * Production adapter for GitHub operations.
 */
export class RealGitHubAdapter implements GitHubAdapter {
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
