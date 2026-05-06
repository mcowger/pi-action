/**
 * @file GitHub pull request update tool implementation.
 *
 * Uses native git CLI for staging, committing, and pushing to an existing
 * PR branch. PR metadata updates (title/body) use the GitHub REST API.
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { execSync } from 'node:child_process';
import { getOctokit } from '../octokit';
import { MAX_TITLE_LENGTH } from '../constants';

function git(args: string): string {
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  return execSync(`git -C "${workspace}" ${args}`, {
    encoding: 'utf-8',
    timeout: 30_000,
  }).trim();
}

export interface UpdatePullRequestParams {
  pull_number?: number;
  title?: string;
  body?: string;
  message?: string;
  dryRun?: boolean;
}

export interface UpdatePullRequestResult {
  content: { type: 'text'; text: string }[];
  details: UpdatePullRequestDetails;
}

export interface UpdatePullRequestDetails {
  pullRequestNumber: number;
  pullRequestUrl: string;
  headBranch: string;
  baseBranch: string;
  commitSha?: string;
  titleUpdated?: boolean;
  bodyUpdated?: boolean;
  dryRun: boolean;
  cancelled?: boolean;
}

/**
 * Validate pull request update parameters.
 */
export function validateUpdatePullRequestParams(params: UpdatePullRequestParams): void {
  if (params.title !== undefined && params.title.length > MAX_TITLE_LENGTH) {
    throw new Error(
      `Pull request title exceeds maximum length of ${MAX_TITLE_LENGTH} characters (got ${params.title.length})`
    );
  }

  const { title, body, message, pull_number } = params;
  const hasUpdate = title !== undefined || body !== undefined || message !== undefined;
  const hasContext = pull_number !== undefined || github.context.issue?.number;

  if (!hasUpdate && !hasContext) {
    throw new Error(
      'At least one update parameter (title, body, message, or pull_number) must be provided'
    );
  }
}

/**
 * Update a pull request end-to-end.
 *
 * 1. Fetch PR details to get the head branch
 * 2. Check out the PR branch
 * 3. Stage all changes via `git add -A`
 * 4. Commit via `git commit`
 * 5. Push via `git push`
 * 6. Optionally update PR title/body via API
 */
export async function updatePullRequest(
  params: UpdatePullRequestParams
): Promise<UpdatePullRequestResult> {
  validateUpdatePullRequestParams(params);

  const resolvedPullNumber = params.pull_number ?? github.context.issue.number;
  if (!resolvedPullNumber) {
    throw new Error(
      'Pull request number not provided and not available in context.'
    );
  }

  const octokit = getOctokit();
  const { owner, repo } = github.context.repo;

  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: resolvedPullNumber,
  });

  const headBranch = pr.head.ref;
  const baseBranch = pr.base.ref;
  const prUrl = pr.html_url;

  if (params.dryRun) {
    const parts: string[] = [`[DRY RUN] Would update pull request #${resolvedPullNumber}:`];
    if (params.title !== undefined) {parts.push(`- Title: ${params.title}`);}
    if (params.body !== undefined) {parts.push(`- Body: ${params.body}`);}
    parts.push(`- Head branch: ${headBranch}`);
    parts.push(`- Base branch: ${baseBranch}`);

    return {
      content: [{ type: 'text', text: parts.join('\n') }],
      details: {
        pullRequestNumber: resolvedPullNumber,
        pullRequestUrl: prUrl,
        headBranch,
        baseBranch,
        dryRun: true,
      },
    };
  }

  // Checkout PR branch, stage, commit, push
  git(`checkout ${headBranch}`);
  git(`add -A`);

  let commitSha: string | undefined;
  if (git(`status --porcelain`)) {
    const commitMessage = params.message ?? `Update PR #${resolvedPullNumber}: changes by pi coding agent`;

    git(`commit -m "${commitMessage.replace(/"/g, '\\"')}"`);
    git(`push origin ${headBranch}`);

    commitSha = git(`rev-parse HEAD`);
  }

  // Update PR title/body via API
  let titleUpdated = false;
  let bodyUpdated = false;
  if (params.title !== undefined || params.body !== undefined) {
    const updates: Record<string, string> = {};
    if (params.title !== undefined) {updates.title = params.title;}
    if (params.body !== undefined) {updates.body = params.body;}

    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: resolvedPullNumber,
      ...updates,
    });

    titleUpdated = params.title !== undefined;
    bodyUpdated = params.body !== undefined;
  }

  const parts: string[] = [`Pull request #${resolvedPullNumber} updated: ${prUrl}`];
  if (commitSha) {parts.push(`- New commit: ${commitSha}`);}
  if (titleUpdated) {parts.push(`- Title updated`);}
  if (bodyUpdated) {parts.push(`- Description updated`);}

  const message = parts.join('\n');
  core.info(`SUCCESS: ${message}`);

  const details: UpdatePullRequestDetails = {
    pullRequestNumber: resolvedPullNumber,
    pullRequestUrl: prUrl,
    headBranch,
    baseBranch,
    dryRun: false,
  };
  if (commitSha) {details.commitSha = commitSha;}
  if (titleUpdated) {details.titleUpdated = titleUpdated;}
  if (bodyUpdated) {details.bodyUpdated = bodyUpdated;}

  return {
    content: [{ type: 'text', text: message }],
    details,
  };
}
