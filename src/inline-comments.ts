import type { InlineComment } from "./types.js";

/**
 * Parse inline comments from the agent's markdown response.
 *
 * Looks for fenced code blocks with the `pr-review` language tag containing
 * JSON arrays of InlineComment objects:
 *
 * ```pr-review
 * [
 *   { "path": "src/foo.ts", "line": 10, "body": "Consider using const here" }
 * ]
 * ```
 *
 * Returns the parsed inline comments and the remaining response text with
 * the pr-review blocks removed.
 */
export function parseInlineComments(response: string): {
	comments: InlineComment[];
	cleanResponse: string;
} {
	const comments: InlineComment[] = [];

	// Match ```pr-review ... ``` blocks
	const prReviewRegex = /```pr-review\s*\n([\s\S]*?)```/g;

	let match: RegExpExecArray | null;
	const matches: { fullMatch: string; json: string }[] = [];

	while ((match = prReviewRegex.exec(response)) !== null) {
		matches.push({ fullMatch: match[0], json: match[1].trim() });
	}

	for (const m of matches) {
		try {
			const parsed: unknown = JSON.parse(m.json);
			if (Array.isArray(parsed)) {
				for (const item of parsed) {
					if (
						typeof item === "object" &&
						item !== null &&
						typeof (item as Record<string, unknown>).path === "string" &&
						typeof (item as Record<string, unknown>).line === "number" &&
						typeof (item as Record<string, unknown>).body === "string"
					) {
						const comment: InlineComment = {
							path: (item as Record<string, unknown>).path as string,
							line: (item as Record<string, unknown>).line as number,
							body: (item as Record<string, unknown>).body as string,
						};
						if (
							(item as Record<string, unknown>).side === "LEFT" ||
							(item as Record<string, unknown>).side === "RIGHT"
						) {
							comment.side = (item as Record<string, unknown>).side as
								| "LEFT"
								| "RIGHT";
						}
						if (
							typeof (item as Record<string, unknown>).start_line === "number"
						) {
							comment.start_line = (item as Record<string, unknown>)
								.start_line as number;
						}
						if (
							(item as Record<string, unknown>).start_side === "LEFT" ||
							(item as Record<string, unknown>).start_side === "RIGHT"
						) {
							comment.start_side = (item as Record<string, unknown>)
								.start_side as "LEFT" | "RIGHT";
						}
						comments.push(comment);
					}
				}
			}
		} catch {
			// Invalid JSON in pr-review block — skip it
		}
	}

	// Remove pr-review blocks from the response
	const cleanResponse = matches
		.reduce((acc, m) => acc.replace(m.fullMatch, ""), response)
		.replace(/\n{3,}/g, "\n\n")
		.trim();

	return { comments, cleanResponse };
}
