import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as core from '@actions/core';
import * as github from '@actions/github';
import ignore from 'ignore';
import { getOctokit } from './octokit.js';
import {
  FILE_MODE_DIRECTORY,
  FILE_MODE_EXECUTABLE,
  FILE_MODE_REGULAR,
  MAX_FILE_SIZE_BYTES,
  BRANCH_PREFIX,
  IGNORE_PATTERNS,
} from './constants.js';

const octokit = getOctokit();

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
}

/**
 * Git file mode types
 */
export type FileMode =
  | typeof FILE_MODE_REGULAR
  | typeof FILE_MODE_EXECUTABLE
  | typeof FILE_MODE_DIRECTORY;

/**
 * Determine the base branch for the pull request.
 * Uses the provided base branch, or the repository default branch.
 */
async function determineBaseBranch(providedBase: string | undefined): Promise<string> {
  const debug = (msg: string) => {
    core.debug(`[pull-request] ${msg}`);
  };

  let baseBranch: string;
  if (providedBase) {
    // Explicitly provided by caller
    baseBranch = providedBase;
    debug(`Using provided base branch: ${baseBranch}`);
    return baseBranch;
  }

  if (github.context.payload.repository?.default_branch) {
    // Available in context
    baseBranch = github.context.payload.repository.default_branch;
    debug(`Using default branch from context: ${baseBranch}`);
    return baseBranch;
  }

  // Fetch from GitHub API
  debug(`Fetching repository default branch from GitHub API...`);
  const owner = github.context.repo.owner;
  const repo = github.context.repo.repo;
  const repoData = await octokit.rest.repos.get({
    owner,
    repo,
  });
  baseBranch = repoData.data.default_branch;
  debug(`Fetched default branch: ${baseBranch}`);
  return baseBranch;
}

/**
 * Generate the body text for the pull request.
 * Uses the provided body, or auto-generates based on issue/PR context.
 */
function generatePullRequestBody(providedBody: string | undefined): string {
  const debug = (msg: string) => {
    core.debug(`[pull-request] ${msg}`);
  };

  let bodyText = providedBody ?? '';
  if (!bodyText && github.context.issue?.number) {
    const contextType = getContextType();
    const issueNum = github.context.issue.number;
    if (contextType === 'issue') {
      bodyText = `Fixes #${issueNum}\n\nCreated by pi coding agent.`;
    } else if (contextType === 'pull_request') {
      bodyText = `Related to #${issueNum}\n\nCreated by pi coding agent.`;
    }
    debug(`Auto-generated body from issue #${issueNum}`);
  }

  return bodyText;
}

/**
 * Determine if the current GitHub context is a pull request.
 * @returns true if the event type is 'pull_request' or if the context payload contains a pull_request object
 */
function getContextType(): 'issue' | 'pull_request' | undefined {
  const eventType = github.context.eventName;
  if (eventType === 'pull_request' || github.context.payload.pull_request !== undefined) {
    return 'pull_request';
  }
  if (github.context.eventName === 'issue_comment' || github.context.eventName === 'issues') {
    return 'issue';
  }
  return undefined;
}

/**
 * Scan the local repository for changed files compared to the base branch.
 * Returns a list of files that have been added or modified.
 */
async function scanForChanges(
  baseFiles: Map<string, { sha: string; content: string | null }>
): Promise<
  {
    path: string;
    content: string;
    mode: FileMode;
  }[]
> {
  const debug = (msg: string) => {
    core.debug(`[pull-request] ${msg}`);
  };

  debug(`Scanning local files for changes...`);

  const repoRoot = process.env.GITHUB_WORKSPACE ?? process.cwd();

  const ig = ignore();
  try {
    const gitignoreContent = await fs.readFile(path.join(repoRoot, '.gitignore'), 'utf-8');
    ig.add(gitignoreContent);
  } catch (_e) {
    // No .gitignore file, that's fine
  }
  // Add additional patterns to always ignore
  ig.add(IGNORE_PATTERNS);

  const changedFiles: {
    path: string;
    content: string;
    mode: FileMode;
  }[] = [];

  async function scanDirectory(dir: string, relativePath = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativeFilePath = relativePath ? path.join(relativePath, entry.name) : entry.name;

      if (ig.ignores(relativeFilePath)) {
        debug(`Ignored: ${relativeFilePath}`);
        continue;
      }

      if (entry.isDirectory()) {
        await scanDirectory(fullPath, relativeFilePath);
      } else if (entry.isFile()) {
        // Skip files that are too large (>1MB to be safe)
        const stats = await fs.stat(fullPath);
        if (stats.size > MAX_FILE_SIZE_BYTES) {
          debug(`Skipping large file (>1MB): ${relativeFilePath}`);
          continue;
        }

        // Try to read file content, skip if binary
        let localContent: string;
        try {
          localContent = await fs.readFile(fullPath, 'utf-8');
        } catch (_e) {
          debug(`Skipping file (likely binary): ${relativeFilePath}`);
          continue;
        }

        const baseFile = baseFiles.get(relativeFilePath);

        // Check if file is new or modified
        let isChanged = false;
        if (!baseFile) {
          // New file
          isChanged = true;
          debug(`New file: ${relativeFilePath}`);
        } else if (baseFile.content !== null && baseFile.content !== localContent) {
          // Modified file
          isChanged = true;
          debug(`Modified file: ${relativeFilePath}`);
        }

        if (isChanged) {
          changedFiles.push({
            path: relativeFilePath,
            content: localContent,
            mode: FILE_MODE_REGULAR, // Default file mode (regular file, not executable)
          });
        }
      }
    }
  }

  await scanDirectory(repoRoot, '');

  debug(`Found ${changedFiles.length} changed file(s)`);
  return changedFiles;
}

/**
 * Create blobs and a tree for the changed files.
 * Returns the tree SHA.
 */
async function createBlobsAndTree(
  changedFiles: {
    path: string;
    content: string;
    mode: FileMode;
  }[],
  baseSha: string
): Promise<string> {
  const debug = (msg: string) => {
    core.debug(`[pull-request] ${msg}`);
  };

  const owner = github.context.repo.owner;
  const repo = github.context.repo.repo;

  debug(`Creating blobs for changed files...`);

  // Create blobs for all changed files and map their paths to SHAs
  const blobShaMap = new Map<string, string>();
  for (const file of changedFiles) {
    const blob = await octokit.rest.git.createBlob({
      owner,
      repo,
      content: Buffer.from(file.content).toString('base64'),
      encoding: 'base64',
    });
    blobShaMap.set(file.path, blob.data.sha);
    debug(`Created blob for ${file.path}: ${blob.data.sha}`);
  }
  debug(`Created ${blobShaMap.size} blob(s)`);

  // Create tree with all the blob references
  debug(`Creating tree with changes...`);
  const tree = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseSha,
    tree: Array.from(blobShaMap.entries()).map(([path, sha]) => ({
      path,
      mode: FILE_MODE_REGULAR,
      type: 'blob',
      sha,
    })),
  });
  debug(`Created tree: ${tree.data.sha}`);

  return tree.data.sha;
}

/**
 * Create a commit and update the branch reference.
 * Returns the commit SHA.
 */
async function createCommitAndUpdateBranch(
  treeSha: string,
  baseSha: string,
  branchName: string,
  title: string
): Promise<string> {
  const debug = (msg: string) => {
    core.debug(`[pull-request] ${msg}`);
  };

  const owner = github.context.repo.owner;
  const repo = github.context.repo.repo;

  // Create a single commit with the new tree
  debug(`Creating commit...`);
  const commit = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: title,
    tree: treeSha,
    parents: [baseSha],
  });
  debug(`Created commit: ${commit.data.sha}`);

  // Update the branch reference to point to the new commit
  debug(`Updating branch reference...`);
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branchName}`,
    sha: commit.data.sha,
  });
  debug(`Branch updated successfully`);

  return commit.data.sha;
}

/**
 * Create a pull request on GitHub.
 */
async function createPullRequestOnGitHub(
  title: string,
  body: string,
  baseBranch: string,
  headBranch: string
): Promise<{ number: number; url: string; headRef: string; baseRef: string }> {
  const debug = (msg: string) => {
    core.debug(`[pull-request] ${msg}`);
  };

  const owner = github.context.repo.owner;
  const repo = github.context.repo.repo;

  debug(`Creating pull request...`);

  const result = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    body,
    base: baseBranch,
    head: headBranch,
  });

  return {
    number: result.data.number,
    url: result.data.html_url,
    headRef: result.data.head.ref,
    baseRef: result.data.base.ref,
  };
}

/**
 * Create a pull request.
 * This function handles the entire flow: determining base branch, scanning for changes,
 * creating blobs, trees, commits, and finally the pull request.
 */
export async function createPullRequest(
  params: CreatePullRequestParams
): Promise<CreatePullRequestResult> {
  const { title, body, base, dryRun } = params;
  const info = (msg: string) => {
    core.info(`[pull-request] ${msg}`);
  };
  const debug = (msg: string) => {
    core.debug(`[pull-request] ${msg}`);
  };

  // Auto-generate branch name
  const issueNumber = github.context.issue?.number ?? 'unknown';
  const timestamp = Date.now();
  const head = `${BRANCH_PREFIX}${issueNumber}-${timestamp}`;

  debug(`Title: ${title}`);
  debug(`Auto-generated branch: ${head}`);
  debug(`Base: ${base ?? 'default'}`);
  debug(`DryRun: ${dryRun ?? false}`);

  // Determine base branch
  const baseBranch = await determineBaseBranch(base);

  // Generate body text
  const bodyText = generatePullRequestBody(body);

  // Dry run mode
  if (dryRun) {
    const message = `[DRY RUN] Would create pull request:\n- Title: ${title}\n- Body: ${bodyText || '(empty)'}\n- Base: ${baseBranch}\n- Head: ${head}`;
    debug(message);

    return {
      content: [{ type: 'text' as const, text: message }],
      details: {
        pullRequestNumber: 0,
        pullRequestUrl: '',
        headBranch: head,
        baseBranch,
        dryRun: true,
      },
    };
  }

  // Create and push the new branch via GitHub API
  debug(`Preparing branch and changes via GitHub API...`);

  try {
    const owner = github.context.repo.owner;
    const repo = github.context.repo.repo;

    // Get base branch reference
    debug(`Getting base branch "${baseBranch}" reference...`);
    const baseRef = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`,
    });
    const baseSha = baseRef.data.object.sha;
    debug(`Base branch SHA: ${baseSha}`);

    // Get files that exist in the base branch tree (for comparison)
    debug(`Getting base branch tree...`);
    const baseTree = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: baseSha,
      recursive: 'true',
    });

    // Create a map of base files for quick lookup: path -> {sha, content}
    const baseFiles = new Map<string, { sha: string; content: string | null }>();
    for (const item of baseTree.data.tree) {
      if (item.type === 'blob') {
        let content: string | null = null;
        if (item.sha) {
          try {
            const blob = await octokit.rest.git.getBlob({
              owner,
              repo,
              file_sha: item.sha,
            });
            content = Buffer.from(blob.data.content, 'base64').toString('utf-8');
          } catch (_e) {
            // Could not fetch blob content, continue with null
          }
        }
        baseFiles.set(item.path, { sha: item.sha, content });
      }
    }
    debug(`Found ${baseFiles.size} files in base branch`);

    // Scan for changes
    const changedFiles = await scanForChanges(baseFiles);

    if (changedFiles.length === 0) {
      const errorMsg =
        'No changes detected. Please add new files and/or make your changes before creating a pull request.';
      throw new Error(errorMsg);
    }

    // Create new branch reference from base branch
    debug(`Creating new branch "${head}"...`);
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${head}`,
      sha: baseSha,
    });
    debug(`Branch created successfully`);

    // Create blobs and tree
    const treeSha = await createBlobsAndTree(changedFiles, baseSha);

    // Create commit and update branch
    await createCommitAndUpdateBranch(treeSha, baseSha, head, title);

    // Create pull request
    const prResult = await createPullRequestOnGitHub(title, bodyText, baseBranch, head);

    const successMessage = `Pull request #${prResult.number} created: ${prResult.url}`;

    info(`SUCCESS: ${successMessage}`);

    const details: CreatePullRequestDetails = {
      pullRequestNumber: prResult.number,
      pullRequestUrl: prResult.url,
      headBranch: prResult.headRef,
      baseBranch: prResult.baseRef,
      dryRun: false,
    };

    return {
      content: [{ type: 'text' as const, text: successMessage }],
      details,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorMsg = `[pull-request] Failed to create pull request: ${message}`;
    throw new Error(errorMsg);
  }
}
