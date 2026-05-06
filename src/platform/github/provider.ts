/**
 * @file GitHub platform provider implementation.
 *
 * Provides the platform implementation for GitHub and GitHub-compatible
 * APIs (GitHub Enterprise, etc.). Uses the standard GitHub Actions
 * environment variables (GITHUB_* env vars).
 */

import { context } from '@actions/github';
import { addReaction, deleteReaction } from './reactions';
import { createFinalComment } from './comments';
import { getPrompt, getStartTimeFromContext } from './context';
import { createPullRequest } from './tools/pull-request';
import { updatePullRequest } from './tools/pull-request-update';
import { getIssueOrPRThread } from './tools/thread';
import { fetchPRDiff } from './tools/pr-diff';
import {
  addIssueComment,
  updateComment,
  createInlineComment,
  listComments,
} from './tools/comments';
import { MAX_DIFF_LINES } from './constants';
import type { Temporal } from '@js-temporal/polyfill';
import type { PlatformProvider, PlatformContext } from '../types';
import type { CommentMetadata } from '../../types';
import type { CreateReactionType } from './reactions';
import type { IssueOrPRThread, GetIssueOrPRThreadParams } from './types';
import type { CreatePullRequestParams, CreatePullRequestDetails } from './tools/pull-request';
import type {
  UpdatePullRequestParams,
  UpdatePullRequestDetails,
} from './tools/pull-request-update';
import type {
  AddIssueCommentParams,
  AddIssueCommentDetails,
  UpdateCommentParams,
  UpdateCommentDetails,
  CreateInlineCommentParams,
  CreateInlineCommentDetails,
  ListCommentsParams,
  ListCommentsDetails,
} from './types';

/**
 * Create the platform provider for GitHub.
 *
 * Uses the standard GitHub Actions CI/CD environment variables
 * (GITHUB_* env vars) for context extraction.
 *
 * @returns A PlatformProvider instance.
 */
export function createPlatformProvider(): PlatformProvider {
  return {
    getContext(): PlatformContext {
      return {
        repo: context.repo,
        issue: context.issue,
        eventName: context.eventName,
        payload: context.payload,
        serverUrl: context.serverUrl || 'https://github.com',
        runId: context.runId,
        workspace: process.env.GITHUB_WORKSPACE ?? process.cwd(),
      };
    },

    async addReaction(): Promise<CreateReactionType | undefined> {
      return addReaction();
    },

    async deleteReaction(reaction: CreateReactionType | undefined): Promise<void> {
      await deleteReaction(reaction);
    },

    async createFinalComment(body: string, metadata: CommentMetadata): Promise<void> {
      await createFinalComment(body, metadata);
    },

    async getPrompt(inputPrompt?: string): Promise<string | undefined> {
      return getPrompt(inputPrompt);
    },

    getStartTime(): Temporal.Instant | undefined {
      return getStartTimeFromContext();
    },

    async createPullRequest(
      params: CreatePullRequestParams
    ): Promise<{ content: { type: 'text'; text: string }[]; details: CreatePullRequestDetails }> {
      return createPullRequest(params);
    },

    async updatePullRequest(
      params: UpdatePullRequestParams
    ): Promise<{ content: { type: 'text'; text: string }[]; details: UpdatePullRequestDetails }> {
      return updatePullRequest(params);
    },

    async getIssueOrPRThread(
      params?: GetIssueOrPRThreadParams
    ): Promise<IssueOrPRThread | undefined> {
      return getIssueOrPRThread(params);
    },

    async getPRDiff(
      owner: string,
      repo: string,
      pullNumber: number,
      ignoreFiles?: string[]
    ): Promise<string> {
      return fetchPRDiff(owner, repo, pullNumber, MAX_DIFF_LINES, ignoreFiles);
    },

    async addIssueComment(params: AddIssueCommentParams): Promise<AddIssueCommentDetails> {
      return addIssueComment(params);
    },

    async updateComment(params: UpdateCommentParams): Promise<UpdateCommentDetails> {
      return updateComment(params);
    },

    async createInlineComment(
      params: CreateInlineCommentParams
    ): Promise<CreateInlineCommentDetails> {
      return createInlineComment(params);
    },

    async listComments(params: ListCommentsParams): Promise<ListCommentsDetails> {
      return listComments(params);
    },
  };
}
