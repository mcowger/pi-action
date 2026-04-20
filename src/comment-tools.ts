import {
	type AgentToolResult,
	defineTool,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { GitHubClient } from "./github.js";
import { loadToolPrompt } from "./templates.js";

export interface CommentState {
	commentId: number;
	htmlUrl: string;
}

const createCommentPrompt = loadToolPrompt("create-progress-comment");

const createCommentSchema = Type.Object({
	body: Type.String({
		description:
			"The initial content of the progress comment (Markdown supported). " +
			"This will be posted as a new comment on the issue/PR.",
	}),
});

const updateCommentPrompt = loadToolPrompt("update-progress-comment");

const updateCommentSchema = Type.Object({
	comment_id: Type.Number({
		description:
			"The numeric ID of the comment to update (returned by create_progress_comment).",
	}),
	body: Type.String({
		description:
			"The new content for the comment (Markdown supported). This will completely replace the existing content.",
	}),
});

export interface CreateCommentToolDetails {
	commentId: number;
	htmlUrl: string;
}

export function createProgressCommentTool(
	client: Pick<GitHubClient, "createIssueComment">,
	_owner: string,
	_repo: string,
	issueNumber: number,
	onCommentCreated?: (comment: CommentState) => void,
) {
	return defineTool({
		name: "create_progress_comment",
		label: "Create Progress Comment",
		description: createCommentPrompt.description,
		promptSnippet: createCommentPrompt.promptSnippet,
		promptGuidelines: createCommentPrompt.promptGuidelines,
		parameters: createCommentSchema,
		async execute(
			_toolCallId: string,
			params: { body: string },
			_signal?: AbortSignal,
		): Promise<AgentToolResult<CreateCommentToolDetails>> {
			try {
				const result = await client.createIssueComment(
					issueNumber,
					params.body,
				);

				const commentState: CommentState = {
					commentId: result.id,
					htmlUrl: result.html_url,
				};

				if (onCommentCreated) {
					onCommentCreated(commentState);
				}

				return {
					content: [
						{
							type: "text" as const,
							text: `Created progress comment #${result.id}: ${result.html_url}\n\nStore the comment_id (${result.id}) to update it later with update_progress_comment.`,
						},
					],
					details: {
						commentId: result.id,
						htmlUrl: result.html_url,
					},
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Failed to create progress comment: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					details: { commentId: 0, htmlUrl: "" },
				};
			}
		},
	});
}

export interface UpdateCommentToolDetails {
	commentId: number;
}

export function createUpdateCommentTool(
	client: Pick<GitHubClient, "updateComment">,
	_owner: string,
	_repo: string,
) {
	return defineTool({
		name: "update_progress_comment",
		label: "Update Progress Comment",
		description: updateCommentPrompt.description,
		promptSnippet: updateCommentPrompt.promptSnippet,
		promptGuidelines: updateCommentPrompt.promptGuidelines,
		parameters: updateCommentSchema,
		async execute(
			_toolCallId: string,
			params: { comment_id: number; body: string },
			_signal?: AbortSignal,
		): Promise<AgentToolResult<UpdateCommentToolDetails>> {
			try {
				await client.updateComment(params.comment_id, params.body);

				return {
					content: [
						{
							type: "text" as const,
							text: `Updated comment #${params.comment_id} successfully.`,
						},
					],
					details: { commentId: params.comment_id },
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Failed to update comment #${params.comment_id}: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					details: { commentId: params.comment_id },
				};
			}
		},
	});
}
