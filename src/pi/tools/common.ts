/**
 * @file Shared utilities for tool execution.
 */

import { Temporal } from '@js-temporal/polyfill';
import type { IssueOrPRThread } from '../../github/index';

/**
 * Log the start of a tool execution and check for cancellation.
 *
 * @param toolName - Name of the tool being invoked (used in log output).
 * @param signal   - Optional `AbortSignal` to check for cancellation.
 * @returns A tuple of [isCancelled, cleanupFn] where cleanupFn closes the group.
 */
export function handleToolStart(
  toolName: string,
  signal: AbortSignal | undefined
): [boolean, () => void] {
  console.info('\n');
  console.info('::group::🔧 Tool Execution');
  console.info(`Tool called: ${toolName}`);

  if (signal?.aborted) {
    console.warn(`⚠️ Tool execution cancelled: ${toolName}`);
    console.info('::endgroup::');
    return [true, () => undefined];
  }

  const cleanup = (): void => {
    console.info('execution completed');
    console.info('::endgroup::');
  };

  return [false, cleanup];
}

/**
 * Format an {@link IssueOrPRThread} into a human-readable text summary.
 *
 * @param thread - The thread data to format.
 * @returns A multi-line string representation of the thread.
 */
export function formatThreadAsText(thread: IssueOrPRThread): string {
  const lines: string[] = [
    `${thread.is_pull_request ? 'Pull Request' : 'Issue'} #${thread.number}: ${thread.title}`,
    '',
    `State: ${thread.state.toUpperCase()}`,
    `Author: @${thread.author}${thread.author_type === 'bot' ? ' (bot)' : ''}`,
  ];

  if (thread.created_at) {
    lines.push(`Created: ${Temporal.Instant.from(thread.created_at).toString()}`);
  }

  if (thread.updated_at) {
    lines.push(`Updated: ${Temporal.Instant.from(thread.updated_at).toString()}`);
  }

  if (thread.closed_at) {
    lines.push(`Closed: ${Temporal.Instant.from(thread.closed_at).toString()}`);
  }
  if (thread.merged_at) {
    lines.push(`Merged: ${Temporal.Instant.from(thread.merged_at).toString()}`);
  }

  if (thread.labels.length > 0) {
    lines.push(`Labels: ${thread.labels.map((l) => `"${l}"`).join(', ')}`);
  }

  if (thread.is_pull_request) {
    lines.push(
      `Head Branch: ${thread.head_branch ?? 'unknown'}`,
      `Base Branch: ${thread.base_branch ?? 'unknown'}`,
      `Head SHA: ${thread.head_sha ?? 'unknown'}`
    );
  }

  lines.push('');
  if (thread.body) {
    lines.push('Description:');
    lines.push(thread.body);
    lines.push('');
  }

  lines.push(`Comments (${thread.comments.length}):`);
  thread.comments.forEach((comment, i) => {
    const triggerMark = comment.is_triggering_comment ? ' [📍 triggering comment]' : '';
    lines.push(
      `  ${i + 1}. @${comment.author}${comment.author_type === 'bot' ? ' (bot)' : ''}${triggerMark}`,
      `     ${Temporal.Instant.from(comment.created_at).toString()}`,
      `     ${comment.body}`
    );
  });

  return lines.join('\n');
}
