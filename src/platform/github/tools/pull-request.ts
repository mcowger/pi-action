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
 *
 * On failure, throws with both the exit code and the full stderr so that
 * the calling tool — and the agent reading its output — can see exactly
 * what went wrong (pre-commit hook output, push rejection, etc.).
 */
function git(args: string): string {
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  try {
    return execSync(`git -C "${workspace}" ${args}`, {
      encoding: 'utf-8',
      timeout: 60_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string; stdout?: string; status?: number };
    const stderr = err.stderr?.trim();
    const stdout = err.stdout?.trim();
    const status = err.status ?? '?';
    const detail = [stderr, stdout].filter(Boolean).join('\n');
    const base = `git ${args} exited with status ${status}`;
    throw new Error(detail ? `${base}:\n${detail}` : base);
  }
}

/**
 * Detect whether the current branch has commits ahead of the given base branch.
 *
 * Returns the current branch name if it is ahead of base (i.e. has at least one
 * commit not reachable from base). Returns `undefined` if the current branch is
 * the base branch or is at/behind base.
 */
function detectExistingBranchWithCommits(baseBranch: string): string | undefined {
  const currentBranch = git(`branch --show-current`);
  if (!currentBranch || currentBranch === baseBranch) {
    return undefined;
  }

  // Check if there are commits on the current branch not reachable from base
  try {
    const revCount = git(`rev-list --count ${baseBranch}..HEAD`);
    if (parseInt(revCount, 10) > 0) {
      core.info(`Detected existing branch '${currentBranch}' with ${revCount} commit(s) ahead of '${baseBranch}'`);
      return currentBranch;
    }
  } catch {
    // rev-list may fail if base branch is not a direct ancestor; treat as no commits ahead
  }

  return undefined;
}

/**
 * Create a pull request end-to-end.
 *
 * Supports two scenarios:
 *
 * **Scenario A – pre-committed branch:** If the current branch already has
 * commits ahead of the base branch (e.g. the agent already committed and
 * pushed its changes), the tool uses that branch directly. Any additional
 * uncommitted changes in the working tree are staged and committed on top.
 *
 * **Scenario B – uncommitted changes:** If the current branch has no commits
 * ahead of base, the tool falls back to the original behavior: create a new
 * branch from base, stage all changes, commit, push, and open the PR.
 *
 * In dry-run mode, all steps are reported but not executed.
 */
export async function createPullRequest(
  params: CreatePullRequestParams
): Promise<CreatePullRequestResult> {
  validateCreatePullRequestParams(params);

  const issueNumber = github.context.issue?.number ?? 'unknown';
  const timestamp = Temporal.Now.instant().epochMilliseconds;
  const generatedHead = `${BRANCH_PREFIX}-${issueNumber}-${timestamp}`;
  const baseBranch = await determineBaseBranch(params.base);
  const bodyText = generatePullRequestBody(params.body);

  if (params.dryRun) {
    const message = [
      `[DRY RUN] Would create pull request:`,
      `- Title: ${params.title}`,
      `- Body: ${bodyText || '(empty)'}`,
      `- Base: ${baseBranch}`,
      `- Head: ${generatedHead}`,
    ].join('\n');
    return {
      content: [{ type: 'text', text: message }],
      details: { pullRequestNumber: 0, pullRequestUrl: '', headBranch: generatedHead, baseBranch, dryRun: true },
    };
  }

  try {
    // Detect if the current branch already has committed changes ahead of base
    const existingBranch = detectExistingBranchWithCommits(baseBranch);
    let head: string;

    if (existingBranch) {
      // ── Scenario A: use the existing branch ──────────────────────────
      head = existingBranch;
      core.info(`Using existing branch '${head}' that is ahead of '${baseBranch}'`);

      // Stage any additional uncommitted changes on top of the existing commits
      git(`add -A`);
      if (git(`status --porcelain`)) {
        git(`commit -m "${params.title.replace(/"/g, '\\"')}"`);
      }
    } else {
      // ── Scenario B: create a new branch from base ────────────────────
      head = generatedHead;
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
    }

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
    core.error(`[create_pull_request] failed:\n${message}`);
    throw new Error(`[pull-request] ${message}`);
  }
}
