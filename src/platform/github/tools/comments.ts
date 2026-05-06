/**
 * @file Comment operations for GitHub issues and pull requests.
 *
 * Implements the server-side logic for:
 * - `add_issue_comment` - Add a comment to an issue or PR
 * - `update_comment` - Update an existing comment
 * - `create_inline_comment` - Create an inline PR review comment
 * - `list_comments` - List comments on an issue or PR
 */

import * as github from '@actions/github';
import { getOctokit } from '../octokit';
import { getCoreAdapter } from '../index';
import type {
  AddIssueCommentParams,
  AddIssueCommentDetails,
  UpdateCommentParams,
  UpdateCommentDetails,
  CreateInlineCommentParams,
  CreateInlineCommentDetails,
  ListCommentsParams,
  ListCommentsDetails,
  ThreadComment,
  ReviewComment,
} from '../types';

const MAX_COMMENTS_PER_PAGE = 100;

/**
 * Debug logging helper.
 */
function debug(msg: string): void {
  getCoreAdapter().debug(msg);
}

function resolveOwnerRepo(owner?: string, repo?: string): { owner: string; repo: string } {
  return {
    owner: owner ?? github.context.repo.owner,
    repo: repo ?? github.context.repo.repo,
  };
}

/**
 * Add a comment to an issue or pull request.
 *
 * Uses `octokit.rest.issues.createComment()` which works for both issues
 * and pull requests (since every PR is also an issue).
 *
 * @param params - Parameters including owner, repo, issue_number, and body.
 * @returns The created comment details.
 * @throws {Error} If the API call fails.
 */
export async function addIssueComment(
  params: AddIssueCommentParams
): Promise<AddIssueCommentDetails> {
  const { issue_number, body } = params;
  const { owner, repo } = resolveOwnerRepo(params.owner, params.repo);

  if (!issue_number) {
    throw new Error('issue_number is required');
  }
  if (!body || body.trim() === '') {
    throw new Error('Comment body is required and cannot be empty');
  }

  debug(`[addIssueComment] Adding comment to ${owner}/${repo}#${issue_number}`);

  try {
    const octokit = getOctokit();
    const response = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number,
      body,
    });

    const details: AddIssueCommentDetails = {
      comment_id: response.data.id,
      issue_number: response.data.issue_url
        ? parseInt(response.data.issue_url.split('/').pop() ?? '0', 10)
        : issue_number,
      url: response.data.html_url,
    };

    debug(`[addIssueComment] Created comment #${details.comment_id}`);
    return details;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[addIssueComment] Failed to add comment: ${message}`);
  }
}

/**
 * Update an existing comment.
 *
 * Can update either an issue/PR comment or a PR review comment depending
 * on the `is_review_comment` flag.
 *
 * @param params - Parameters including comment_id, body, and optional is_review_comment flag.
 * @returns The updated comment details.
 * @throws {Error} If the API call fails.
 */
export async function updateComment(params: UpdateCommentParams): Promise<UpdateCommentDetails> {
  const { comment_id, body, is_review_comment = false } = params;
  const { owner, repo } = resolveOwnerRepo(params.owner, params.repo);

  if (!comment_id) {
    throw new Error('comment_id is required');
  }
  if (!body || body.trim() === '') {
    throw new Error('Comment body is required and cannot be empty');
  }

  debug(
    `[updateComment] Updating ${is_review_comment ? 'review' : 'issue'} comment #${comment_id}`
  );

  try {
    const octokit = getOctokit();
    let response;

    if (is_review_comment) {
      // Use pulls.updateReviewComment for PR review comments
      response = await octokit.rest.pulls.updateReviewComment({
        owner,
        repo,
        comment_id,
        body,
      });
    } else {
      // Use issues.updateComment for issue/PR comments
      response = await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id,
        body,
      });
    }

    const details: UpdateCommentDetails = {
      comment_id: response.data.id,
      url: response.data.html_url,
      updated: true,
    };

    debug(`[updateComment] Updated comment #${details.comment_id}`);
    return details;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[updateComment] Failed to update comment: ${message}`);
  }
}

/**
 * Create an inline comment on a pull request.
 *
 * Uses `octokit.rest.pulls.createReviewComment()` to create a comment on
 * a specific line of a file in a pull request diff.
 *
 * @param params - Parameters including pull_number, path, line, body, and optional side/commit_id.
 * @returns The created comment details.
 * @throws {Error} If the API call fails.
 */
export async function createInlineComment(
  params: CreateInlineCommentParams
): Promise<CreateInlineCommentDetails> {
  const {
    pull_number,
    body,
    path,
    line,
    side = 'RIGHT',
    commit_id,
    start_line,
    start_side,
  } = params;
  const { owner, repo } = resolveOwnerRepo(params.owner, params.repo);

  if (!pull_number) {
    throw new Error('pull_number is required');
  }
  if (!body || body.trim() === '') {
    throw new Error('Comment body is required and cannot be empty');
  }
  if (!path) {
    throw new Error('path is required for inline comments');
  }
  if (!line) {
    throw new Error('line is required for inline comments');
  }

  debug(
    `[createInlineComment] Creating inline comment on ${owner}/${repo}#${pull_number} at ${path}:${line}`
  );

  try {
    const octokit = getOctokit();

    // If commit_id not provided, fetch the PR head commit
    let resolvedCommitId = commit_id;
    if (!resolvedCommitId) {
      const pr = await octokit.rest.pulls.get({ owner, repo, pull_number });
      resolvedCommitId = pr.data.head.sha;
    }

    // Build the comment parameters
    const commentParams: {
      owner: string;
      repo: string;
      pull_number: number;
      commit_id: string;
      body: string;
      path: string;
      line: number;
      side: 'LEFT' | 'RIGHT';
      start_line?: number;
      start_side?: 'LEFT' | 'RIGHT';
    } = {
      owner,
      repo,
      pull_number,
      commit_id: resolvedCommitId,
      body,
      path,
      line,
      side,
    };

    // Add optional parameters if provided
    if (start_line) {
      commentParams.start_line = start_line;
      commentParams.start_side = start_side ?? 'RIGHT';
    }

    const response = await octokit.rest.pulls.createReviewComment(commentParams);

    const details: CreateInlineCommentDetails = {
      comment_id: response.data.id,
      pull_number,
      path,
      line,
      url: response.data.html_url,
    };

    debug(`[createInlineComment] Created inline comment #${details.comment_id}`);
    return details;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[createInlineComment] Failed to create inline comment: ${message}`);
  }
}

/**
 * List comments on an issue or pull request.
 *
 * Can fetch issue-level comments, PR review comments, or both.
 * Uses `octokit.rest.issues.listComments()` for issue comments and
 * `octokit.rest.pulls.listReviewComments()` for PR review comments.
 *
 * @param params - Parameters including owner, repo, issue_number/pull_number, and filters.
 * @returns List of comments and review comments.
 * @throws {Error} If the API call fails.
 */
export async function listComments(params: ListCommentsParams): Promise<ListCommentsDetails> {
  const {
    issue_number,
    pull_number,
    include_issue_comments = true,
    include_review_comments = false,
  } = params;
  const { owner, repo } = resolveOwnerRepo(params.owner, params.repo);

  // Determine which issue number to use
  const resolvedIssueNumber = issue_number ?? pull_number;
  if (!resolvedIssueNumber) {
    throw new Error('Either issue_number or pull_number is required');
  }

  debug(
    `[listComments] Listing comments for ${owner}/${repo}#${resolvedIssueNumber} ` +
      `(issue_comments=${include_issue_comments}, review_comments=${include_review_comments})`
  );

  try {
    const issueComments: ThreadComment[] = [];
    const reviewComments: ReviewComment[] = [];
    let totalIssueComments = 0;
    let totalReviewComments = 0;

    // Fetch issue-level comments if requested
    if (include_issue_comments) {
      let page = 1;
      while (issueComments.length < MAX_COMMENTS_PER_PAGE) {
        const octokit = getOctokit();
        const response = await octokit.rest.issues.listComments({
          owner,
          repo,
          issue_number: resolvedIssueNumber,
          per_page: MAX_COMMENTS_PER_PAGE,
          page,
        });

        if (response.data.length === 0) {
          break;
        }

        for (const comment of response.data) {
          issueComments.push({
            id: comment.id,
            author: comment.user?.login ?? 'unknown',
            author_type: comment.user?.type === 'Bot' ? 'bot' : 'user',
            created_at: comment.created_at,
            body: comment.body ?? '',
            ...(comment.updated_at ? { updated_at: comment.updated_at } : {}),
          });
        }

        // Update total count from response headers
        if (page === 1 && response.headers['x-total-count']) {
          const headerValue = response.headers['x-total-count'];
          totalIssueComments =
            typeof headerValue === 'string' ? parseInt(headerValue, 10) : headerValue;
        }

        if (response.data.length < MAX_COMMENTS_PER_PAGE) {
          totalIssueComments = Math.max(totalIssueComments, issueComments.length);
          break;
        }
        page++;
      }

      if (totalIssueComments === 0) {
        totalIssueComments = issueComments.length;
      }
    }

    // Fetch PR review comments if requested and we have a PR number
    if (include_review_comments && pull_number) {
      let page = 1;
      while (reviewComments.length < MAX_COMMENTS_PER_PAGE) {
        const octokit = getOctokit();
        const response = await octokit.rest.pulls.listReviewComments({
          owner,
          repo,
          pull_number,
          per_page: MAX_COMMENTS_PER_PAGE,
          page,
        });

        if (response.data.length === 0) {
          break;
        }

        for (const comment of response.data) {
          reviewComments.push({
            id: comment.id,
            path: comment.path,
            line: comment.line ?? comment.original_line ?? null,
            side: (comment.side as 'LEFT' | 'RIGHT') ?? 'RIGHT',
            author: comment.user?.login ?? 'unknown',
            author_type: comment.user?.type === 'Bot' ? 'bot' : 'user',
            created_at: comment.created_at,
            body: comment.body,
            ...(comment.in_reply_to_id ? { in_reply_to_id: comment.in_reply_to_id } : {}),
          });
        }

        if (response.data.length < MAX_COMMENTS_PER_PAGE) {
          totalReviewComments = Math.max(totalReviewComments, reviewComments.length);
          break;
        }
        page++;
      }

      if (totalReviewComments === 0) {
        totalReviewComments = reviewComments.length;
      }
    }

    const details: ListCommentsDetails = {
      issue_comments: issueComments,
      review_comments: reviewComments,
      total_issue_comments: totalIssueComments,
      total_review_comments: totalReviewComments,
    };

    debug(
      `[listComments] Found ${details.total_issue_comments} issue comments, ` +
        `${details.total_review_comments} review comments`
    );
    return details;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[listComments] Failed to list comments: ${message}`);
  }
}
