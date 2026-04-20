import { describe, expect, it, vi } from "vitest";
import {
	type CommentState,
	createProgressCommentTool,
	createUpdateCommentTool,
} from "./comment-tools.js";
import type { GitHubClient } from "./github.js";

function createMockClient(): Pick<
	GitHubClient,
	"createIssueComment" | "updateComment"
> {
	return {
		createIssueComment: vi.fn(),
		updateComment: vi.fn(),
	};
}

describe("createProgressCommentTool", () => {
	it("should create a comment and return success", async () => {
		const mockClient = createMockClient();
		vi.mocked(mockClient.createIssueComment).mockResolvedValue({
			id: 12345,
			html_url: "https://github.com/test/repo/issues/1#issuecomment-12345",
		});

		let capturedComment: CommentState | undefined;
		const tool = createProgressCommentTool(
			mockClient,
			"test-owner",
			"test-repo",
			42,
			(comment) => {
				capturedComment = comment;
			},
		);

		const result = await tool.execute("tool-1", { body: "Starting work..." });

		expect(mockClient.createIssueComment).toHaveBeenCalledWith(
			42,
			"Starting work...",
		);
		expect(result.content[0]).toMatchObject({
			type: "text",
			text: expect.stringContaining("Created progress comment #12345"),
		});
		expect(result.details).toEqual({
			commentId: 12345,
			htmlUrl: "https://github.com/test/repo/issues/1#issuecomment-12345",
		});
		expect(capturedComment).toEqual({
			commentId: 12345,
			htmlUrl: "https://github.com/test/repo/issues/1#issuecomment-12345",
		});
	});

	it("should handle errors gracefully", async () => {
		const mockClient = createMockClient();
		vi.mocked(mockClient.createIssueComment).mockRejectedValue(
			new Error("API Error"),
		);

		const tool = createProgressCommentTool(
			mockClient,
			"test-owner",
			"test-repo",
			42,
		);

		const result = await tool.execute("tool-1", { body: "Test" });

		expect(result.content[0]).toMatchObject({
			type: "text",
			text: expect.stringContaining("Failed to create progress comment"),
		});
		expect(result.details).toEqual({ commentId: 0, htmlUrl: "" });
	});

	it("should work without callback", async () => {
		const mockClient = createMockClient();
		vi.mocked(mockClient.createIssueComment).mockResolvedValue({
			id: 12345,
			html_url: "https://github.com/test/repo/issues/1#issuecomment-12345",
		});

		const tool = createProgressCommentTool(
			mockClient,
			"test-owner",
			"test-repo",
			42,
		);

		const result = await tool.execute("tool-1", {
			body: "Test without callback",
		});

		expect(result.content[0]).toMatchObject({
			type: "text",
			text: expect.stringContaining("Created progress comment"),
		});
	});
});

describe("createUpdateCommentTool", () => {
	it("should update a comment and return success", async () => {
		const mockClient = createMockClient();
		vi.mocked(mockClient.updateComment).mockResolvedValue(undefined);

		const tool = createUpdateCommentTool(mockClient, "test-owner", "test-repo");

		const result = await tool.execute("tool-1", {
			comment_id: 12345,
			body: "Updated progress...",
		});

		expect(mockClient.updateComment).toHaveBeenCalledWith(
			12345,
			"Updated progress...",
		);
		expect(result.content[0]).toMatchObject({
			type: "text",
			text: "Updated comment #12345 successfully.",
		});
		expect(result.details).toEqual({ commentId: 12345 });
	});

	it("should handle errors gracefully", async () => {
		const mockClient = createMockClient();
		vi.mocked(mockClient.updateComment).mockRejectedValue(
			new Error("Not Found"),
		);

		const tool = createUpdateCommentTool(mockClient, "test-owner", "test-repo");

		const result = await tool.execute("tool-1", {
			comment_id: 12345,
			body: "Test",
		});

		expect(result.content[0]).toMatchObject({
			type: "text",
			text: expect.stringContaining("Failed to update comment #12345"),
		});
		expect(result.details).toEqual({ commentId: 12345 });
	});
});
