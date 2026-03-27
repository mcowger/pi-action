import * as core from '@actions/core';
import * as github from '@actions/github';

/**
 * Shared Octokit client instance.
 * Uses a lazy initialization pattern to ensure @actions/core and @actions/github
 * are available when the module is first imported.
 */
let _octokit: ReturnType<typeof github.getOctokit> | undefined;

export function getOctokit() {
  _octokit ??= github.getOctokit(core.getInput('github_token'));
  return _octokit;
}
