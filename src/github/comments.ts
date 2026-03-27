/**
 * @file GitHub comment creation utilities.
 *
 * Provides a thin wrapper around the Octokit `issues.createComment` endpoint
 * with support for appending an action-run link to the final comment posted by
 * the Pi agent.
 */

import * as github from '@actions/github';
import RestEndpointMethodTypes from '@octokit/plugin-rest-endpoint-methods';
import { getOctokit } from './octokit.js';

const octokit = getOctokit();

export type CreateCommentType =
  RestEndpointMethodTypes.RestEndpointMethodTypes['issues']['createComment']['response'];

/**
 * Create a comment on the current issue or pull request.
 *
 * @param body - The Markdown body of the comment.
 * @returns The Octokit response, or `undefined` if `body` is empty.
 */
async function createComment(body: string): Promise<CreateCommentType | undefined> {
  if (!body) {
    return;
  }

  return octokit.rest.issues.createComment({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: github.context.issue.number,
    body,
  });
}

/**
 * Post the final result (or error) comment on the current issue or pull request.
 *
 * Automatically appends a "View action run" link pointing to the GitHub Actions
 * run that produced the comment.
 *
 * @param body - The Markdown body of the comment.
 * @returns The Octokit response, or `undefined` if `body` is empty.
 */
export async function createFinalComment(body: string): Promise<CreateCommentType | undefined> {
  if (!body) {
    return;
  }

  // Build the action run URL
  const serverUrl = github.context.serverUrl || 'https://github.com';
  const { owner, repo } = github.context.repo;
  const runId = github.context.runId;

  let finalBody = body;
  if (owner && repo && runId) {
    const actionRunUrl = `${serverUrl}/${owner}/${repo}/actions/runs/${runId}`;
    finalBody = `${body}\n\n---\n\n[View action run](${actionRunUrl})`;
  }

  return createComment(finalBody);
}
