/**
 * @file GitHub comment creation utilities.
 *
 * Provides wrappers around Octokit endpoints for creating comments on issues/PRs
 * and replies to PR review comments. Supports appending an action-run link to the
 * final comment posted by the Pi agent.
 */

import * as github from '@actions/github';
import RestEndpointMethodTypes from '@octokit/plugin-rest-endpoint-methods';
import { Temporal } from '@js-temporal/polyfill';
import { getOctokit } from './octokit';
import { getCoreAdapter } from './index';
import { getStartTimeFromContext } from './context';
import type { SessionStats } from '../../types';

/**
 * Metadata to include in the comment footer.
 */
export interface CommentMetadata {
  /** LLM provider (e.g., "anthropic", "openai") */
  provider?: string;
  /** Model identifier (e.g., "claude-sonnet-4-5") */
  model?: string;
  /** Thinking/reasoning level (e.g., "off", "low", "medium", "high") */
  thinkingLevel?: string;
  /** Total execution time as a Temporal Duration */
  executionDuration?: Temporal.Duration;
  /** Session statistics including token usage */
  sessionStats?: SessionStats;
  /** Pi SDK version */
  piSdkVersion?: string;
  /** The model requested via directive that could not be found; the default was used instead */
  modelDirectiveFallback?: string;
}

export type CreateCommentType =
  | RestEndpointMethodTypes.RestEndpointMethodTypes['issues']['createComment']['response']
  | RestEndpointMethodTypes.RestEndpointMethodTypes['pulls']['createReplyForReviewComment']['response'];

/**
 * Debug logging helper.
 */
function debug(msg: string): void {
  getCoreAdapter().debug(msg);
}

/**
 * Format a Temporal Duration to a human-readable string, rounded to the nearest second.
 *
 * Shows only non-zero units of hours, minutes, and seconds.
 *
 * @param duration - Execution time as Temporal.Duration
 * @returns Formatted string (e.g., "1s", "1m 30s", "1h 5m 30s")
 *
 * @internal Exported for testing purposes only.
 */
export function formatExecutionTime(duration: Temporal.Duration): string {
  const rounded = duration.round({ largestUnit: 'hour', smallestUnit: 'second' });
  const parts: string[] = [];

  const hours = rounded.hours;
  const minutes = rounded.minutes;
  const seconds = rounded.seconds;

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(' ');
}

/**
 * Check if the current comment is a pull request review comment (inline comment).
 *
 * PR review comments have a `pull_request_review_id` field in the payload.
 *
 * @returns `true` if the comment is a PR review comment, `false` otherwise.
 */
function isPullRequestReviewComment(): boolean {
  const comment = github.context.payload.comment;
  return comment?.pull_request_review_id !== undefined;
}

/**
 * Create a comment on the current issue or pull request, or reply to an inline PR review comment.
 *
 * For inline PR review comments, creates a threaded reply. For regular comments,
 * creates a top-level comment on the issue/PR.
 *
 * @param body - The Markdown body of the comment.
 * @returns The Octokit response, or `undefined` if `body` is empty.
 */
async function createComment(body: string): Promise<CreateCommentType | undefined> {
  if (!body) {
    return;
  }

  const issueNumber = github.context.issue.number;
  if (!issueNumber) {
    debug('[comments] no issue/PR number in context, skipping comment creation');
    return undefined;
  }

  const octokit = getOctokit();

  // Check if this is a reply to a PR review comment (inline comment)
  if (isPullRequestReviewComment()) {
    const comment = github.context.payload.comment;
    if (!comment) {
      debug('[comments] no comment found for review reply');
      return undefined;
    }

    debug('[comments] creating reply to PR review comment');
    return octokit.rest.pulls.createReplyForReviewComment({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: issueNumber,
      comment_id: comment.id,
      body,
    });
  } else {
    debug('[comments] creating top-level issue/PR comment');
    return octokit.rest.issues.createComment({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: issueNumber,
      body,
    });
  }
}

/**
 * Format a number with appropriate suffix (K for thousands, M for millions).
 *
 * @param value - Number to format
 * @returns Formatted string (e.g., "1.2K", "1.5M", "500")
 *
 * @internal Exported for testing purposes only.
 */
export function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return String(value);
}

/** Sentinel string used to detect an existing header for deduplication. */
const HEADER_SENTINEL = '---\n**Pi Action**';

/**
 * Build the action run URL from the current GitHub context.
 */
function buildActionRunUrl(): string | undefined {
  const serverUrl = github.context.serverUrl || 'https://github.com';
  const { owner, repo } = github.context.repo;
  const runId = github.context.runId;
  if (!owner || !repo || !runId) return undefined;
  return `${serverUrl}/${owner}/${repo}/actions/runs/${runId}`;
}

/**
 * Build the header string statelessly from GitHub Actions context and environment.
 *
 * Reads the model from INPUT_PROVIDER / INPUT_MODEL env vars and the start time
 * from the GitHub event context, falling back to the current instant.
 *
 * @internal Exported for testing purposes only.
 */
export function buildHeader(): string {
  const actionRunUrl = buildActionRunUrl();
  const provider = process.env.INPUT_PROVIDER ?? '';
  const model = process.env.INPUT_MODEL ?? '';
  const modelStr = provider && model ? `${provider}/${model}` : (model || provider);

  const startTime = getStartTimeFromContext() ?? Temporal.Now.instant();
  const startTimeStr = new Date(startTime.epochMilliseconds).toUTCString();

  const parts: string[] = ['**Pi Action**'];
  if (actionRunUrl) {
    parts.push(`[GitHub Actions Run](${actionRunUrl})`);
  }
  if (modelStr) {
    parts.push(`Model: \`${modelStr}\``);
  }
  parts.push(`Started: ${startTimeStr}`);

  return `${HEADER_SENTINEL} | ${parts.slice(1).join(' | ')}\n---`;
}

/**
 * Prepend the header to a comment body, stripping any existing header first.
 */
export function prependHeader(body: string): string {
  let stripped = body;
  if (stripped.startsWith(HEADER_SENTINEL)) {
    // Remove the header block (up to and including the closing ---) and any leading whitespace
    const closingMarker = '\n---';
    const closingIdx = stripped.indexOf(closingMarker, HEADER_SENTINEL.length);
    if (closingIdx !== -1) {
      stripped = stripped.slice(closingIdx + closingMarker.length).replace(/^\n+/, '');
    }
  }
  const header = buildHeader();
  return stripped ? `${header}\n\n${stripped}` : header;
}

/**
 * Post an initial header comment on the current issue or PR before the agent runs.
 *
 * @returns The Octokit response, or `undefined` if posting is not possible.
 */
export async function postInitialComment(): Promise<CreateCommentType | undefined> {
  return createComment(buildHeader());
}

/**
 * Post the final result (or error) comment on the current issue or pull request.
 *
 * Automatically appends a "View action run" link pointing to the GitHub Actions
 * run that produced the comment, along with optional Pi metadata.
 *
 * @param body - The Markdown body of the comment.
 * @param metadata - Optional metadata to include in the footer.
 * @returns The Octokit response, or `undefined` if `body` is empty.
 */
export async function createFinalComment(
  body: string,
  metadata?: CommentMetadata
): Promise<CreateCommentType | undefined> {
  if (!body) {
    return;
  }

  const bodyWithHeader = prependHeader(body);
  let finalBody = bodyWithHeader;
  const actionRunUrl = buildActionRunUrl();
  if (actionRunUrl) {
    // Build metadata parts
    const metadataParts: string[] = [`[View action run](${actionRunUrl})`];

    if (metadata?.provider && metadata.model) {
      let modStr = `Model: ${metadata.provider}/${metadata.model}`;
      if (metadata?.thinkingLevel && metadata.thinkingLevel !== 'off') {
        modStr = `${modStr} (thinking: ${metadata.thinkingLevel})`;
      }
      metadataParts.push(modStr);
    }

    if (metadata?.modelDirectiveFallback) {
      metadataParts.push(
        `⚠️ Requested model \"${metadata.modelDirectiveFallback}\" not found, used default`
      );
    }

    if (metadata?.executionDuration !== undefined) {
      metadataParts.push(`Time: ${formatExecutionTime(metadata.executionDuration)}`);
    }

    // Add token usage if available
    if (metadata?.sessionStats) {
      const { totalTokens, cost } = metadata.sessionStats;
      let tokenInfo = `Tokens: ${formatNumber(totalTokens)}`;
      if (cost > 0) {
        tokenInfo += ` ($${cost.toFixed(4)})`;
      }
      metadataParts.push(tokenInfo);
    }

    if (metadata?.sessionStats?.version) {
      metadataParts.push(`Pi SDK v${metadata.sessionStats.version}`);
    }

    finalBody = `${bodyWithHeader}\n\n---\n\n${metadataParts.join(' | ')}`;
  }

  return createComment(finalBody);
}
