/**
 * @file Platform types for GitHub Actions integration.
 *
 * Defines interfaces for platform-specific operations used by the action
 * and Pi custom tools. The platform module is built specifically for
 * GitHub and GitHub-compatible APIs.
 */

import type { Temporal } from '@js-temporal/polyfill';
import type {
  IssueOrPRThread,
  GetIssueOrPRThreadParams,
  CreatePullRequestParams,
  CreatePullRequestDetails,
  UpdatePullRequestParams,
  UpdatePullRequestDetails,
  CreateReactionType,
  AddIssueCommentParams,
  AddIssueCommentDetails,
  UpdateCommentParams,
  UpdateCommentDetails,
  CreateInlineCommentParams,
  CreateInlineCommentDetails,
  ListCommentsParams,
  ListCommentsDetails,
} from './github';

// Re-export types used by consumers (pi tools, adapters, etc.) so they
// depend on the platform abstraction, not the implementation.
export type {
  IssueOrPRThread,
  ThreadComment,
  ReviewComment,
  GetIssueOrPRThreadParams,
  CreatePullRequestParams,
  CreatePullRequestDetails,
  UpdatePullRequestParams,
  UpdatePullRequestDetails,
  CreateReactionType,
  AddIssueCommentParams,
  AddIssueCommentDetails,
  UpdateCommentParams,
  UpdateCommentDetails,
  CreateInlineCommentParams,
  CreateInlineCommentDetails,
  ListCommentsParams,
  ListCommentsDetails,
} from './github';
import type { CommentMetadata } from '../types';

/**
 * Platform-agnostic context information extracted from the CI/CD environment.
 *
 * Abstracts the event payload, repository info, and other context needed
 * by the action, regardless of which platform triggered the workflow.
 * triggered the workflow.
 */
export interface PlatformContext {
  /** Repository owner and name */
  repo: { owner: string; repo: string };
  /** Current issue or PR number */
  issue: { number: number };
  /** The event that triggered the workflow */
  eventName: string;
  /** The full event payload */
  payload: Record<string, unknown>;
  /** The server URL (e.g. https://github.com) */
  serverUrl: string;
  /** The current workflow run ID */
  runId: number;
  /** The workspace directory path */
  workspace: string;
}

/**
 * Platform provider interface for GitHub platform operations.
 *
 * Encapsulates all platform-specific operations needed by the action
 * and Pi custom tools. Provides a single injectable interface for
 * dependency injection into tools and adapters.
 */
export interface PlatformProvider {
  /**
   * Get the platform context (repo info, event payload, etc.).
   *
   * Extracts context from the platform's CI/CD environment variables
   * and event payload.
   */
  getContext(): PlatformContext;

  /**
   * Add an "eyes" reaction to the triggering comment.
   *
   * @returns The reaction response, or undefined if no comment is present.
   */
  addReaction(): Promise<CreateReactionType | undefined>;

  /**
   * Remove a previously added reaction.
   *
   * @param reaction - The reaction to remove.
   */
  deleteReaction(reaction: CreateReactionType | undefined): Promise<void>;

  /**
   * Create the final comment with optional metadata footer.
   *
   * @param body - The comment body.
   * @param metadata - Optional metadata to include in the footer.
   */
  createFinalComment(body: string, metadata: CommentMetadata): Promise<void>;

  /**
   * Get the prompt from input or comment context.
   *
   * @param inputPrompt - Optional prompt input override.
   * @returns The prompt string, or undefined if no prompt is available.
   */
  getPrompt(inputPrompt?: string): Promise<string | undefined>;

  /**
   * Get the start time from the platform event payload.
   *
   * @returns The start instant, or undefined if unavailable.
   */
  getStartTime(): Temporal.Instant | undefined;

  /**
   * Create a pull request.
   *
   * @param params - Pull request creation parameters.
   * @returns The result of the PR creation.
   */
  createPullRequest(
    params: CreatePullRequestParams
  ): Promise<{ content: { type: 'text'; text: string }[]; details: CreatePullRequestDetails }>;

  /**
   * Update an existing pull request.
   *
   * @param params - Pull request update parameters.
   * @returns The result of the PR update.
   */
  updatePullRequest(
    params: UpdatePullRequestParams
  ): Promise<{ content: { type: 'text'; text: string }[]; details: UpdatePullRequestDetails }>;

  /**
   * Fetch the complete thread for an issue or pull request.
   *
   * For pull requests, the thread includes inline review comments
   * (comments on specific lines of the diff) in addition to issue-level comments.
   *
   * @param params - Optional parameters to override defaults.
   * @returns The thread data, or undefined if not found.
   */
  getIssueOrPRThread(params?: GetIssueOrPRThreadParams): Promise<IssueOrPRThread | undefined>;

  /**
   * Fetch the diff for a pull request.
   *
   * @param owner - Repository owner.
   * @param repo - Repository name.
   * @param pullNumber - Pull request number.
   * @param ignoreFiles - Optional list of file paths to exclude from the diff.
   *                      Supports exact paths (e.g. "dist/bundle.js") and prefix
   *                      matching (e.g. "dist/" excludes everything under dist/).
   *                      Matching is literal — glob patterns are NOT supported.
   * @returns The diff string, or empty string if unavailable.
   */
  getPRDiff(
    owner: string,
    repo: string,
    pullNumber: number,
    ignoreFiles?: string[]
  ): Promise<string>;

  /**
   * Add a comment to an issue or pull request.
   *
   * @param params - Parameters including issue_number and body.
   * @returns The created comment details.
   */
  addIssueComment(params: AddIssueCommentParams): Promise<AddIssueCommentDetails>;

  /**
   * Update an existing issue or PR review comment.
   *
   * @param params - Parameters including comment_id, body, and optional is_review_comment flag.
   * @returns The updated comment details.
   */
  updateComment(params: UpdateCommentParams): Promise<UpdateCommentDetails>;

  /**
   * Create an inline review comment on a pull request diff.
   *
   * @param params - Parameters including pull_number, path, line, and body.
   * @returns The created comment details.
   */
  createInlineComment(params: CreateInlineCommentParams): Promise<CreateInlineCommentDetails>;

  /**
   * List comments on an issue or pull request.
   *
   * @param params - Parameters including issue_number/pull_number and filter flags.
   * @returns Lists of issue comments and review comments.
   */
  listComments(params: ListCommentsParams): Promise<ListCommentsDetails>;
}
