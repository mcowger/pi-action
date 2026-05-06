/**
 * @file Shared type definitions for the GitHub platform module.
 *
 * Centralises all interfaces used across the github module so that individual
 * files can import types without creating circular dependencies.
 */

export interface IssueOrPullRequestContext {
  title: string;
  body?: string;
  number: number;
}

export interface ThreadComment {
  id: number;
  author: string;
  author_type: 'user' | 'bot';
  created_at: string;
  updated_at?: string;
  body: string;
  is_triggering_comment?: boolean; // marks the comment that invoked /pi
}

export interface ReviewComment {
  id: number;
  path: string;
  line: number | null;
  side: 'LEFT' | 'RIGHT';
  author: string;
  author_type: 'user' | 'bot';
  created_at: string;
  body: string;
  in_reply_to_id?: number;
}

export interface IssueOrPRThread {
  number: number;
  title: string;
  body: string | null | undefined;
  state: 'open' | 'closed' | 'merged';
  author: string;
  author_type: 'user' | 'bot';
  created_at: string | null | undefined;
  updated_at: string | null | undefined;
  closed_at: string | null | undefined;
  merged_at: string | null | undefined; // PR only
  labels: string[];
  // PR-specific fields
  is_pull_request: boolean;
  head_branch: string | undefined; // PR only
  base_branch: string | undefined; // PR only
  head_sha: string | undefined; // PR only
  // Comments
  comments: ThreadComment[];
  // PR review comments (inline comments on the diff)
  review_comments: ReviewComment[];
  // Cancellation flag
  cancelled?: boolean;
}

// ─── Comment operation types ────────────────────────────────────────────────

export interface AddIssueCommentParams {
  owner?: string;
  repo?: string;
  issue_number: number;
  body: string;
}

export interface AddIssueCommentDetails {
  comment_id: number;
  issue_number: number;
  url: string;
}

export interface UpdateCommentParams {
  owner?: string;
  repo?: string;
  comment_id: number;
  body: string;
  is_review_comment?: boolean;
}

export interface UpdateCommentDetails {
  comment_id: number;
  url: string;
  updated: boolean;
}

export interface CreateInlineCommentParams {
  owner?: string;
  repo?: string;
  pull_number: number;
  body: string;
  path: string;
  line: number;
  side?: 'LEFT' | 'RIGHT';
  commit_id?: string;
  start_line?: number;
  start_side?: 'LEFT' | 'RIGHT';
}

export interface CreateInlineCommentDetails {
  comment_id: number;
  pull_number: number;
  path: string;
  line: number;
  url: string;
}

export interface ListCommentsParams {
  owner?: string;
  repo?: string;
  issue_number?: number;
  pull_number?: number;
  include_issue_comments?: boolean;
  include_review_comments?: boolean;
}

export interface ListCommentsDetails {
  issue_comments: ThreadComment[];
  review_comments: ReviewComment[];
  total_issue_comments: number;
  total_review_comments: number;
}

export interface GetIssueOrPRThreadParams {
  owner?: string;
  repo?: string;
  issue_number?: number;
  max_comments?: number;
}
