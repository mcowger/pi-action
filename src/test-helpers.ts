/**
 * Test helper functions to reduce duplication in test files
 */
import { vi } from "vitest";
import type { GitHubClient } from "./github.js";
import type { TriggerInfo } from "./types.js";

/**
 * Creates a mock GitHub client with all required methods
 */
export function createMockGitHubClient(): GitHubClient {
	return {
		addReactionToComment: vi.fn(),
		addReactionToIssue: vi.fn(),
		createComment: vi.fn(),
		getPullRequestDiff: vi.fn().mockResolvedValue(""),
	};
}

/**
 * Creates a TriggerInfo object with sensible defaults and optional overrides
 */
export function createTriggerInfo(
	overrides: Partial<TriggerInfo> = {},
): TriggerInfo {
	return {
		isCommentEvent: false,
		triggerText: "@pi test",
		author: { login: "user", type: "User" },
		authorAssociation: "OWNER",
		issueNumber: 1,
		issueTitle: "Test",
		issueBody: "Body",
		commentId: undefined,
		isPullRequest: false,
		...overrides,
	};
}
