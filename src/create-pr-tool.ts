/**
 * Custom `create_pull_request` tool for the pi agent.
 *
 * Provides a tool that the LLM can call to create a pull request via the
 * GitHub REST API, instead of shelling out to `gh pr create`. This ensures
 * the agent uses the same authenticated GitHubClient and avoids relying on
 * the `gh` CLI being available.
 */

import { Type } from "@sinclair/typebox";
import { defineTool, type AgentToolResult } from "@mariozechner/pi-coding-agent";

/**
 * Details returned by the create_pull_request tool.
 */
export interface CreatePRToolDetails {
	pullRequestNumber: number;
	pullRequestUrl: string;
	headBranch: string;
	baseBranch: string;
}

/**
 * Parameters schema for the create_pull_request tool.
 */
const createPRSchema = Type.Object({
	title: Type.String({
		description:
			"Title for the pull request. Should be concise and descriptive.",
	}),
	body: Type.Optional(
		Type.String({
			description:
				"Body/description for the pull request in Markdown. Include issue references (e.g. 'Fixes #123').",
		}),
	),
	base: Type.Optional(
		Type.String({
			description:
				"The branch to use as the base (target) of the pull request. Defaults to the repository's default branch.",
		}),
	),
});

/**
 * GitHub client interface — only the methods this tool needs.
 * This avoids coupling to the full GitHubClient type.
 */
interface PRGitHubClient {
	createPullRequest(params: {
		owner: string;
		repo: string;
		title: string;
		body?: string;
		head: string;
		base: string;
	}): Promise<{ number: number; html_url: string }>;
	getDefaultBranch(owner: string, repo: string): Promise<string>;
	getCurrentBranch(): Promise<string>;
}

/**
 * Create the `create_pull_request` tool bound to a GitHubClient.
 *
 * The tool requires a client + repo info at creation time so it can
 * execute GitHub API calls when the LLM invokes it.
 *
 * @param client - GitHub client with PR creation capability.
 * @param owner  - Repository owner.
 * @param repo   - Repository name.
 */
export function createPullRequestTool(
	client: PRGitHubClient,
	owner: string,
	repo: string,
) {
	return defineTool({
		name: "create_pull_request",
		label: "Create Pull Request",
		description:
			"Create a pull request on GitHub. Use this tool after committing and pushing your changes to a branch. " +
			"This is the ONLY way to create pull requests — do NOT use `gh pr create` or any other shell command. " +
			"The tool uses the GitHub API directly with the action's authenticated token.",
		promptSnippet:
			"create_pull_request: Create a pull request on GitHub (use after committing and pushing changes)",
		promptGuidelines: [
			"Always use the `create_pull_request` tool to open PRs — never use `gh pr create` via bash.",
			"Commit and push your changes before calling create_pull_request.",
			"Include issue references in the PR body (e.g., 'Fixes #123').",
		],
		parameters: createPRSchema,
		async execute(
			_toolCallId: string,
			params: {
				title: string;
				body?: string;
				base?: string;
			},
			_signal?: AbortSignal,
		): Promise<AgentToolResult<CreatePRToolDetails>> {
			// Resolve head branch from current git state
			const headBranch = await client.getCurrentBranch();

			// Resolve base branch
			const baseBranch = params.base ?? (await client.getDefaultBranch(owner, repo));

			if (headBranch === baseBranch) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: You are currently on the base branch "${baseBranch}". You must create and switch to a new branch before creating a pull request. Use git checkout -b <branch-name> to create a new branch.`,
						},
					],
					details: {
						pullRequestNumber: 0,
						pullRequestUrl: "",
						headBranch,
						baseBranch,
					},
				};
			}

			// Auto-append agent attribution if not already present
			let body = params.body ?? "";
			if (!body.includes("pi-action") && !body.includes("pi coding agent")) {
				body += "\n\n---\n*Created by pi-action 🤖*";
			}

			const pr = await client.createPullRequest({
				owner,
				repo,
				title: params.title,
				body,
				head: headBranch,
				base: baseBranch,
			});

			const successMsg = `Pull request #${pr.number} created: ${pr.html_url}`;

			return {
				content: [{ type: "text" as const, text: successMsg }],
				details: {
					pullRequestNumber: pr.number,
					pullRequestUrl: pr.html_url,
					headBranch,
					baseBranch,
				},
			};
		},
	});
}
