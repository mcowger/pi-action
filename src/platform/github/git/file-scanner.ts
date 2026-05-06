/**
 * @file GitHub-specific file map building on top of the platform-agnostic scanner.
 *
 * Provides `buildFileMap` which fetches a Git tree via the GitHub REST API
 * and returns a reference file map suitable for use with the shared
 * `scanForChanges` function from `src/git/file-scanner`.
 *
 * Re-exports the shared scanner functions with GitHub-specific defaults
 * (workspace root, platform ignore patterns) applied.
 */

import * as github from '@actions/github';
import { getOctokit } from '../octokit';
import { GITHUB_IGNORE_PATTERNS } from '../constants';
import { createLogger } from './types';
import type { Logger } from '../../../git/types';
import { scanForChanges as sharedScanForChanges, scanDirectory } from '../../../git/file-scanner';
import type { ChangeScanResult, ScanDirectoryParams } from '../../../git/file-scanner';

// Re-export shared types and scanDirectory for direct use within the GitHub module
export type { ChangeScanResult, ScanDirectoryParams };
export { scanDirectory };

/**
 * Build a map of files from a Git tree via the GitHub REST API.
 *
 * Fetches the tree recursively and returns a map of path → blob SHA.
 * Content is NOT fetched — the scanner computes local file hashes for
 * comparison, which is much faster than fetching every file's content.
 *
 * @param treeSha - SHA of the tree to fetch.
 * @param _fetchContents - Ignored (kept for backward compatibility).
 * @param log - Logger instance for debug output.
 * @returns Map of path -> { sha }.
 */
export async function buildFileMap(
  treeSha: string,
  _fetchContents = true,
  log: Logger = createLogger()
): Promise<Map<string, { sha: string }>> {
  const octokit = getOctokit();
  const owner = github.context.repo.owner;
  const repo = github.context.repo.repo;

  log.debug(`fetching tree: ${treeSha}`);

  const tree = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: treeSha,
    recursive: 'true',
  });

  log.debug(`tree contains ${tree.data.tree.length} items`);

  const fileMap = new Map<string, { sha: string }>();

  for (const item of tree.data.tree) {
    if (item.type === 'blob' && item.sha) {
      fileMap.set(item.path, { sha: item.sha });
    }
  }

  log.debug(`built file map with ${fileMap.size} files`);

  return fileMap;
}

/**
 * Scan the local workspace for file changes compared to a reference file map.
 *
 * This is a GitHub-aware wrapper around the shared `scanForChanges` that
 * supplies the GitHub workspace root and platform-specific ignore patterns.
 *
 * @param referenceFiles - Map of reference file paths to their SHA and content.
 * @param log - Logger instance for debug output.
 * @returns An object containing changed files and deleted files.
 */
export async function scanForChanges(
  referenceFiles: Map<string, { sha: string }>,
  log: Logger = createLogger()
): Promise<ChangeScanResult> {
  return sharedScanForChanges(referenceFiles, log, {
    repoRoot: process.env.GITHUB_WORKSPACE,
    ignorePatterns: GITHUB_IGNORE_PATTERNS,
  });
}
