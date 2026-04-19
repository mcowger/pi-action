import { describe, expect, it } from "vitest";
import { parseInlineComments } from "./inline-comments.js";

describe("parseInlineComments", () => {
	it("returns empty comments when no pr-review blocks exist", () => {
		const response = "Here is my review: looks good!";
		const { comments, cleanResponse } = parseInlineComments(response);

		expect(comments).toEqual([]);
		expect(cleanResponse).toBe("Here is my review: looks good!");
	});

	it("parses a single inline comment from pr-review block", () => {
		const response = `Some review text

\`\`\`pr-review
[
  { "path": "src/foo.ts", "line": 10, "body": "Consider using const here" }
]
\`\`\`

End of review`;

		const { comments, cleanResponse } = parseInlineComments(response);

		expect(comments).toEqual([
			{ path: "src/foo.ts", line: 10, body: "Consider using const here" },
		]);
		expect(cleanResponse).not.toContain("pr-review");
		expect(cleanResponse).toContain("Some review text");
		expect(cleanResponse).toContain("End of review");
	});

	it("parses multiple inline comments", () => {
		const response = `\`\`\`pr-review
[
  { "path": "src/a.ts", "line": 5, "body": "Fix typo" },
  { "path": "src/b.ts", "line": 20, "body": "Missing error handling" }
]
\`\`\``;

		const { comments } = parseInlineComments(response);

		expect(comments).toHaveLength(2);
		expect(comments[0]).toEqual({
			path: "src/a.ts",
			line: 5,
			body: "Fix typo",
		});
		expect(comments[1]).toEqual({
			path: "src/b.ts",
			line: 20,
			body: "Missing error handling",
		});
	});

	it("parses multi-line comments with start_line", () => {
		const response = `\`\`\`pr-review
[
  { "path": "src/foo.ts", "line": 15, "start_line": 10, "body": "Refactor this block" }
]
\`\`\``;

		const { comments } = parseInlineComments(response);

		expect(comments).toEqual([
			{
				path: "src/foo.ts",
				line: 15,
				start_line: 10,
				body: "Refactor this block",
			},
		]);
	});

	it("parses comments with side and start_side", () => {
		const response = `\`\`\`pr-review
[
  { "path": "src/foo.ts", "line": 10, "body": "Old code issue", "side": "LEFT", "start_line": 5, "start_side": "LEFT" }
]
\`\`\``;

		const { comments } = parseInlineComments(response);

		expect(comments).toEqual([
			{
				path: "src/foo.ts",
				line: 10,
				body: "Old code issue",
				side: "LEFT",
				start_line: 5,
				start_side: "LEFT",
			},
		]);
	});

	it("skips invalid JSON in pr-review blocks", () => {
		const response = `\`\`\`pr-review
not valid json
\`\`\``;

		const { comments, cleanResponse } = parseInlineComments(response);

		expect(comments).toEqual([]);
		expect(cleanResponse).not.toContain("pr-review");
	});

	it("skips items missing required fields", () => {
		const response = `\`\`\`pr-review
[
  { "path": "src/foo.ts" },
  { "line": 10, "body": "Missing path" },
  { "path": "src/valid.ts", "line": 5, "body": "Valid comment" }
]
\`\`\``;

		const { comments } = parseInlineComments(response);

		expect(comments).toHaveLength(1);
		expect(comments[0].path).toBe("src/valid.ts");
	});

	it("handles multiple pr-review blocks in one response", () => {
		const response = `First part

\`\`\`pr-review
[{ "path": "src/a.ts", "line": 1, "body": "Comment A" }]
\`\`\`

Middle part

\`\`\`pr-review
[{ "path": "src/b.ts", "line": 2, "body": "Comment B" }]
\`\`\`

End part`;

		const { comments, cleanResponse } = parseInlineComments(response);

		expect(comments).toHaveLength(2);
		expect(comments[0].path).toBe("src/a.ts");
		expect(comments[1].path).toBe("src/b.ts");
		expect(cleanResponse).toContain("First part");
		expect(cleanResponse).toContain("Middle part");
		expect(cleanResponse).toContain("End part");
		expect(cleanResponse).not.toContain("pr-review");
	});

	it("collapses excessive newlines after removing blocks", () => {
		const response = `Review text

\`\`\`pr-review
[{ "path": "src/a.ts", "line": 1, "body": "A" }]
\`\`\`

More text`;

		const { cleanResponse } = parseInlineComments(response);

		// Should not have triple+ newlines
		expect(cleanResponse).not.toMatch(/\n{3,}/);
	});

	it("ignores non-array JSON in pr-review blocks", () => {
		const response = `\`\`\`pr-review
{ "path": "src/foo.ts", "line": 10, "body": "Not an array" }
\`\`\``;

		const { comments } = parseInlineComments(response);

		expect(comments).toEqual([]);
	});

	it("defaults side to RIGHT when not specified", () => {
		const response = `\`\`\`pr-review
[{ "path": "src/foo.ts", "line": 10, "body": "Comment" }]
\`\`\``;

		const { comments } = parseInlineComments(response);

		// side is not set on the comment since it was not in the input
		expect(comments[0].side).toBeUndefined();
	});
});
