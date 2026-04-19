// GitHub-specific types
export type GitHubReaction =
	| "+1"
	| "-1"
	| "laugh"
	| "confused"
	| "heart"
	| "hooray"
	| "rocket"
	| "eyes";

export interface GitHubUser {
	login: string;
	type: "User" | "Bot" | "Organization";
}

/**
 * Repository reference with clearer naming (avoids repo.repo)
 */
export interface RepoRef {
	owner: string;
	name: string;
}

/**
 * Session interface for session sharing
 */
export interface Session {
	exportToHtml: (outputPath?: string) => Promise<string>;
}

/**
 * Inline comment on a specific line of a PR diff
 */
export interface InlineComment {
	/** File path relative to repository root */
	path: string;
	/** End line number (1-indexed) */
	line: number;
	/** Comment body in Markdown */
	body: string;
	/** Which side of the diff: LEFT (old) or RIGHT (new). Defaults to RIGHT. */
	side?: "LEFT" | "RIGHT";
	/** Start line for multi-line comments (1-indexed). Must be less than line. */
	start_line?: number;
	/** Side for start_line. Defaults to side value. */
	start_side?: "LEFT" | "RIGHT";
}

/**
 * Model configuration - commonly passed together
 */
export interface ModelConfig {
	provider: string;
	model: string;
	timeout: number;
}

// Updated TriggerInfo interface using proper types
export interface TriggerInfo {
	isCommentEvent: boolean;
	triggerText: string;
	author: GitHubUser;
	authorAssociation: string;
	issueNumber: number;
	issueTitle: string;
	issueBody: string;
	commentId?: number;
	isPullRequest: boolean;
}

// Improved AgentResult using discriminated union
export type AgentResult =
	| { success: true; response: string; session?: Session }
	| { success: false; error: string; session?: Session };

// Minimal Octokit interface to replace 'any' type
export interface OctokitClient {
	rest: {
		reactions: {
			createForIssueComment: (params: {
				owner: string;
				repo: string;
				comment_id: number;
				content: GitHubReaction;
			}) => Promise<unknown>;
			createForIssue: (params: {
				owner: string;
				repo: string;
				issue_number: number;
				content: GitHubReaction;
			}) => Promise<unknown>;
		};
		issues: {
			createComment: (params: {
				owner: string;
				repo: string;
				issue_number: number;
				body: string;
			}) => Promise<unknown>;
		};
		pulls: {
			get: (params: {
				owner: string;
				repo: string;
				pull_number: number;
				mediaType: { format: string };
			}) => Promise<{ data: { head: { sha: string } } }>;
			createReview: (params: {
				owner: string;
				repo: string;
				pull_number: number;
				commit_id: string;
				event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
				comments: Array<{
					path: string;
					line: number;
					body: string;
					side: string;
					start_line?: number;
					start_side?: string;
				}>;
				body?: string;
			}) => Promise<{ data: { id: number; html_url: string } }>;
		};
		gists: {
			create: (params: {
				files: Record<string, { content: string }>;
				public?: boolean;
				description?: string;
			}) => Promise<{ data: { html_url?: string } }>;
		};
	};
}
