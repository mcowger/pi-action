import { execSync } from "node:child_process";
import type {
	GitHubReaction,
	GitHubUser,
	InlineComment,
	OctokitClient,
	RepoRef,
	TriggerInfo,
} from "./types.js";

export interface GitHubContext {
	repo: RepoRef;
	cwd: string;
}

export function extractTriggerInfo(
	payload: Record<string, unknown>,
): TriggerInfo | null {
	const comment = payload.comment as Record<string, unknown> | undefined;
	const issue = (payload.issue || payload.pull_request) as
		| Record<string, unknown>
		| undefined;

	if (!issue) {
		return null;
	}

	const isCommentEvent = !!comment;
	const triggerText = isCommentEvent
		? (comment?.body as string)
		: (issue.body as string);
	const author = isCommentEvent
		? (comment?.user as GitHubUser)
		: (issue.user as GitHubUser);
	const authorAssociation = isCommentEvent
		? (comment?.author_association as string)
		: (issue.author_association as string);

	if (!(triggerText && author)) {
		return null;
	}

	return {
		isCommentEvent,
		triggerText,
		author,
		authorAssociation,
		issueNumber: issue.number as number,
		issueTitle: issue.title as string,
		issueBody: (issue.body as string) || "",
		commentId: comment?.id as number | undefined,
		isPullRequest: !!payload.pull_request,
	};
}

export interface GitHubClient {
	addReactionToComment(
		commentId: number,
		reaction: GitHubReaction,
	): Promise<void>;
	addReactionToIssue(
		issueNumber: number,
		reaction: GitHubReaction,
	): Promise<void>;
	createComment(issueNumber: number, body: string): Promise<void>;
	createIssueComment(issueNumber: number, body: string): Promise<{ id: number; html_url: string }>;
	updateComment(commentId: number, body: string): Promise<void>;
	getPullRequest(pullNumber: number): Promise<{ number: number; title: string; body: string; user: GitHubUser; author_association: string; head: { sha: string }; base: { ref: string } }>;
	getPullRequestDiff(pullNumber: number): Promise<string>;
	createGist(
		content: string,
		filename: string,
		description: string,
		isPublic?: boolean,
	): Promise<string>;
	createPRReview(
		pullNumber: number,
		comments: InlineComment[],
		body?: string,
		event?: "COMMENT" | "APPROVE" | "REQUEST_CHANGES",
	): Promise<{ reviewId: number; reviewUrl: string; commentsAdded: number }>;
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

export function createGitHubClient(
	octokit: OctokitClient,
	context: GitHubContext,
): GitHubClient {
	const { owner, name: repo } = context.repo;
	const cwd = context.cwd;

	return {
		async addReactionToComment(commentId: number, reaction: GitHubReaction) {
			await octokit.rest.reactions.createForIssueComment({
				owner,
				repo,
				comment_id: commentId,
				content: reaction,
			});
		},

		async addReactionToIssue(issueNumber: number, reaction: GitHubReaction) {
			await octokit.rest.reactions.createForIssue({
				owner,
				repo,
				issue_number: issueNumber,
				content: reaction,
			});
		},

		async createComment(issueNumber: number, body: string) {
			await octokit.rest.issues.createComment({
				owner,
				repo,
				issue_number: issueNumber,
				body,
			});
		},

		async createIssueComment(issueNumber: number, body: string) {
			const { data } = await octokit.rest.issues.createComment({
				owner,
				repo,
				issue_number: issueNumber,
				body,
			});
			return {
				id: data.id,
				html_url: data.html_url || "",
			};
		},

		async updateComment(commentId: number, body: string) {
			await octokit.rest.issues.updateComment({
				owner,
				repo,
				comment_id: commentId,
				body,
			});
		},

		async getPullRequest(pullNumber: number) {
			const { data } = await octokit.rest.pulls.get({
				owner,
				repo,
				pull_number: pullNumber,
			});
			const pr = data as {
				number: number;
				title: string;
				body: string | null;
				user: GitHubUser;
				author_association: string;
				head: { sha: string };
				base: { ref: string };
			};
			return {
				number: pr.number,
				title: pr.title,
				body: pr.body || "",
				user: pr.user,
				author_association: pr.author_association,
				head: pr.head,
				base: pr.base,
			};
		},

		async getPullRequestDiff(pullNumber: number): Promise<string> {
			const { data: diff } = await octokit.rest.pulls.get({
				owner,
				repo,
				pull_number: pullNumber,
				mediaType: { format: "diff" },
			});
			return diff as unknown as string;
		},

		async createGist(
			content: string,
			filename: string,
			description: string,
			isPublic = false,
		): Promise<string> {
			const { data: gist } = await octokit.rest.gists.create({
				files: { [filename]: { content } },
				public: isPublic,
				description,
			});
			return gist.html_url || "";
		},

		async createPRReview(
			pullNumber: number,
			comments: InlineComment[],
			body?: string,
			event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES" = "COMMENT",
		): Promise<{ reviewId: number; reviewUrl: string; commentsAdded: number }> {
			// Get the head SHA for the PR
			const { data: prData } = await octokit.rest.pulls.get({
				owner,
				repo,
				pull_number: pullNumber,
				mediaType: { format: "json" },
			});
			const headSha = (prData as { head: { sha: string } }).head.sha;

			const apiComments = comments.map((comment) => {
				const base: {
					path: string;
					line: number;
					body: string;
					side: string;
					start_line?: number;
					start_side?: string;
				} = {
					path: comment.path,
					line: comment.line,
					body: comment.body,
					side: comment.side ?? "RIGHT",
				};

				if (comment.start_line !== undefined) {
					base.start_line = comment.start_line;
					base.start_side = comment.start_side ?? comment.side ?? "RIGHT";
				}

				return base;
			});

			const reviewParams: {
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
			} = {
				owner,
				repo,
				pull_number: pullNumber,
				commit_id: headSha,
				event,
				comments: apiComments,
			};

			if (body !== undefined) {
				reviewParams.body = body;
			}

			const review = await octokit.rest.pulls.createReview(reviewParams);

			return {
				reviewId: review.data.id,
				reviewUrl: review.data.html_url,
				commentsAdded: comments.length,
			};
		},

		async createPullRequest(params: {
			owner: string;
			repo: string;
			title: string;
			body?: string;
			head: string;
			base: string;
		}): Promise<{ number: number; html_url: string }> {
			const { data: pr } = await octokit.rest.pulls.create({
				owner: params.owner,
				repo: params.repo,
				title: params.title,
				body: params.body,
				head: params.head,
				base: params.base,
			});
			return { number: pr.number, html_url: pr.html_url };
		},

		async getDefaultBranch(repoOwner: string, repoName: string): Promise<string> {
			const { data: repoData } = await octokit.rest.repos.get({
				owner: repoOwner,
				repo: repoName,
			});
			return repoData.default_branch;
		},

		async getCurrentBranch(): Promise<string> {
			try {
				const result = execSync("git rev-parse --abbrev-ref HEAD", {
					encoding: "utf-8",
					cwd: cwd,
				});
				return result.trim();
			} catch {
				return "main";
			}
		},
	};
}

export async function addReaction(
	client: GitHubClient,
	triggerInfo: TriggerInfo,
	reaction: GitHubReaction,
): Promise<void> {
	if (triggerInfo.isCommentEvent && triggerInfo.commentId) {
		await client.addReactionToComment(triggerInfo.commentId, reaction);
	} else {
		await client.addReactionToIssue(triggerInfo.issueNumber, reaction);
	}
}
