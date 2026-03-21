import { Type } from '@mariozechner/pi-ai';
import * as core from '@actions/core';
import { createPullRequest } from './github';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { CreatePullRequestParams } from './github';

export const extFactory = (pi: ExtensionAPI): void => {
  pi.registerTool({
    name: 'create_pull_request',
    label: 'Create Pull Request',
    description:
      'Create a new pull request on GitHub. This tool handles everything: automatically determines the default base branch, creates a new branch, pushes changes, and creates the PR. The branch name is auto-generated following the pi/issue{number}-{timestamp} pattern.',
    promptSnippet:
      'Create a pull request with title and description. The tool will automatically determine the default base branch, create a new branch, push changes, and create the PR.',
    promptGuidelines: [
      'Always use the create_pull_request tool to create pull requests - do not use git commands or gh CLI directly.',
      'Make sure your changes are made (modified files exist) before calling this tool. The tool will detect changes, create branch, and create PR automatically. Do NOT use unless you have already applied changes and/or added new files.',
      'The tool will automatically generate a branch name in the format: pi/issue{number}-{timestamp}.',
      'Do NOT provide the "base" parameter unless the user explicitly requests a different target branch than the repository default. The tool will automatically detect the correct default branch.',
      'Use dryRun=true first to verify the PR configuration, then dryRun=false to create it.',
    ],
    parameters: Type.Object({
      title: Type.String({
        description:
          'Pull request title (should be descriptive and follow conventional commit format)',
      }),
      body: Type.Optional(
        Type.String({
          description:
            'Detailed description of changes in markdown format. If not provided, will auto-generate from issue context (e.g., "Fixes #27")',
        })
      ),
      base: Type.Optional(
        Type.String({
          description:
            'EXPERT: Override the default target branch. Only use this if the user explicitly requests a different branch than the repository default. Do NOT guess or assume a branch name - leave this empty unless specifically instructed.',
        })
      ),
      dryRun: Type.Optional(
        Type.Boolean({
          description:
            'Set to true to simulate PR creation without actually creating it (for testing). Set to false to create the actual PR.',
        })
      ),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      core.debug('\n=== create_pull_request tool called ===');

      // Check for cancellation
      if (signal?.aborted) {
        core.warning('[create_pull_request] Tool execution cancelled');

        return {
          content: [{ type: 'text' as const, text: 'Pull request creation was cancelled' }],
          details: {},
        };
      }

      const { title, body, base, dryRun } = params as CreatePullRequestParams;

      // Delegate to the GitHub-specific implementation
      const prParams: CreatePullRequestParams = { title };
      if (body !== undefined) {
        prParams.body = body;
      }
      if (base !== undefined) {
        prParams.base = base;
      }
      if (dryRun !== undefined) {
        prParams.dryRun = dryRun;
      }

      return await createPullRequest(prParams);
    },
  });

  core.info('[create_pull_request] Tool registered successfully');
};
