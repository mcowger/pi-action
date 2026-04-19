/**
 * Response formatting utilities for consistent GitHub comment formatting
 */

import type { GitHubUser } from "./types.js";

export function formatSuccessComment(
	response: string,
	shareUrl?: string,
): string {
	let comment = `### 🤖 pi Response\n\n${response}`;

	if (shareUrl) {
		comment += `\n\n---\n📎 [View full session](${shareUrl})`;
	}

	return comment;
}

export function formatErrorComment(error: string, shareUrl?: string): string {
	let comment = `### ❌ pi Error\n\nFailed to process request: ${error}`;

	if (shareUrl) {
		comment += `\n\n---\n📎 [View full session](${shareUrl})`;
	}

	return comment;
}

interface ReviewComment {
	id: number;
	body: string;
	user: GitHubUser;
	path?: string;
	line?: number;
	created_at: string;
}

/**
 * Formats PR review comments for inclusion in the prompt context.
 */
export function formatReviewComments(comments: ReviewComment[]): string {
	if (comments.length === 0) {
		return "";
	}

	const sections: string[] = ["## Existing PR Review Comments\n"];

	for (const comment of comments) {
		const author = comment.user.login;
		const date = new Date(comment.created_at).toISOString().split("T")[0];
		const location = comment.path && comment.line
			? ` (${comment.path}:${comment.line})`
			: "";

		sections.push(`**${author}** on ${date}${location}:`);
		sections.push(comment.body);
		sections.push(""); // Empty line between comments
	}

	return sections.join("\n");
}
