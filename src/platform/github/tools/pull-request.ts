/**
 * @file GitHub pull request creation tool implementation.
 *
 * Uses native git CLI for branch creation, staging, committing, and pushing.
 * Only the final PR creation step uses the GitHub REST API.
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { Temporal } from '@js-temporal/polyfill';
import { execSync } from 'node:child_process';
import { getOctokit } from '../octokit';
import { BRANCH_PREFIX, MAX_TITLE_LENGTH } from '../constants';
import { getContextType } from '../context-utils';

export interface CreatePullRequestParams {
  title: string;
  body?: string;
  base?: string;
  dryRun?: boolean;
}

export interface CreatePullRequestResult {
  content: { type: 'text'; text: string }[];
  details: CreatePullRequestDetails;
}

export interface CreatePullRequestDetails {
  pullRequestNumber: number;
  pullRequestUrl: string;
  headBranch: string;
  baseBranch: string;
  dryRun: boolean;
  cancelled?: boolean;
}

/**
 * Determine the base branch for the pull request.
 *
 * Uses the caller-supplied base or falls back to the repo's default branch.
 */
export async function determineBaseBranch(providedBase: string | undefined): Promise<string> {
  if (providedBase) {
    core.debug(`Using provided base branch: ${providedBase}`);
    return providedBase;
  }

  if (github.context.payload.repository?.default_branch) {
    return github.context.payload.repository.default_branch;
  }

  core.debug('Fetching default branch from GitHub API...');
  const octokit = getOctokit();
  const { owner, repo } = github.context.repo;
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return data.default_branch;
}

/**
 * Generate the pull request body.
 *
 * Uses the caller-supplied body or auto-generates one referencing the
 * originating issue/PR number.
 */
export function generatePullRequestBody(providedBody: string | undefined): string {
  if (providedBody) {return providedBody;}
  if (!github.context.issue?.number) {return '';}

  const issueNum = github.context.issue.number;
  const contextType = getContextType();
  if (contextType === 'issue') {return `Fixes #${issueNum}\n\nCreated by pi coding agent.`;}
  if (contextType === 'pull_request') {return `Related to #${issueNum}\n\nCreated by pi coding agent.`;}
  return '';
}

/**
 * Validate pull request creation parameters.
 */
export function validateCreatePullRequestParams(params: CreatePullRequestParams): void {
  if (!params.title || params.title.trim() === '') {
    throw new Error('Pull request title is required and cannot be empty');
  }
  if (params.title.length > MAX_TITLE_LENGTH) {
    throw new Error(
      `Pull request title exceeds maximum length of ${MAX_TITLE_LENGTH} characters (got ${params.title.length})`
    );
  }
}

/**
 * Run a git command in the workspace and return stdout.
 */
function git(args: string): string {
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  return execSync(`git -C "${workspace}" ${args}`, {
    encoding: 'utf-8',
    timeout: 30_000,
  }).trim();
}

/**
 * Create a pull request end-to-end.
 *
 * 1. Create a new branch via `git checkout -b`
 * 2. Stage all changes via `git add -A`
 * 3. Commit via `git commit`
 * 4. Push via `git push`
 * 5. Open the PR via GitHub REST API
 *
 * In dry-run mode, steps 1-5 are reported but not executed.
 */
export async function createPullRequest(
  params: CreatePullRequestParams
): Promise<CreatePullRequestResult> {
  validateCreatePullRequestParams(params);

  const issueNumber = github.context.issue?.number ?? 'unknown';
  const timestamp = Temporal.Now.instant().epochMilliseconds;
  const head = `${BRANCH_PREFIX}-${issueNumber}-${timestamp}`;
  const baseBranch = await determineBaseBranch(params.base);
  const bodyText = generatePullRequestBody(params.body);

  if (params.dryRun) {
    const message = [
      `[DRY RUN] Would create pull request:`,
      `- Title: ${params.title}`,
      `- Body: ${bodyText || '(empty)'}`,
      `- Base: ${baseBranch}`,
      `- Head: ${head}`,
    ].join('\n');
    return {
      content: [{ type: 'text', text: message }],
      details: { pullRequestNumber: 0, pullRequestUrl: '', headBranch: head, baseBranch, dryRun: true },
    };
  }

  try {
    // Checkout base, create feature branch
    git(`checkout ${baseBranch}`);
    git(`checkout -b ${head}`);

    // Stage and verify there's something to commit
    git(`add -A`);
    if (!git(`status --porcelain`)) {
      throw new Error(
        'No changes detected. Please add new files and/or make your changes before creating a pull request.'
      );
    }

    git(`commit -m "${params.title.replace(/"/g, '\\"')}"`);
    git(`push origin ${head}`);

    // Create PR via API
    const { owner, repo } = github.context.repo;
    const result = await getOctokit().rest.pulls.create({
      owner,
      repo,
      title: params.title,
      body: bodyText,
      base: baseBranch,
      head,
    });

    const message = `Pull request #${result.data.number} created: ${result.data.html_url}`;
    core.info(`SUCCESS: ${message}`);

    return {
      content: [{ type: 'text', text: message }],
      details: {
        pullRequestNumber: result.data.number,
        pullRequestUrl: result.data.html_url,
        headBranch: result.data.head.ref,
        baseBranch: result.data.base.ref,
        dryRun: false,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[pull-request] ${message}`);
  }
}
