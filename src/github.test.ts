import { describe, expect, it } from "vitest";
import { extractTriggerInfo } from "./github.js";

describe("extractTriggerInfo", () => {
	describe("comment events", () => {
		it("extracts info from issue comment", () => {
			const payload = {
				comment: {
					id: 123,
					body: "@pi do something",
					user: { login: "testuser", type: "User" },
					author_association: "MEMBER",
				},
				issue: {
					number: 42,
					title: "Test Issue",
					body: "Issue body",
					user: { login: "issueauthor", type: "User" },
					author_association: "OWNER",
				},
			};

			const result = extractTriggerInfo(payload);
			expect(result).toEqual({
				isCommentEvent: true,
				triggerText: "@pi do something",
				author: { login: "testuser", type: "User" },
				authorAssociation: "MEMBER",
				issueNumber: 42,
				issueTitle: "Test Issue",
				issueBody: "Issue body",
				commentId: 123,
				isPullRequest: false,
			});
		});

		it("extracts info from PR comment", () => {
			const payload = {
				comment: {
					id: 456,
					body: "@pi review this",
					user: { login: "reviewer", type: "User" },
					author_association: "COLLABORATOR",
				},
				pull_request: {
					number: 99,
					title: "Add feature",
					body: "PR description",
					user: { login: "prauthor", type: "User" },
					author_association: "CONTRIBUTOR",
				},
			};

			const result = extractTriggerInfo(payload);
			expect(result).toEqual({
				isCommentEvent: true,
				triggerText: "@pi review this",
				author: { login: "reviewer", type: "User" },
				authorAssociation: "COLLABORATOR",
				issueNumber: 99,
				issueTitle: "Add feature",
				issueBody: "PR description",
				commentId: 456,
				isPullRequest: true,
			});
		});
	});

	describe("opened events", () => {
		it("extracts info from opened issue", () => {
			const payload = {
				issue: {
					number: 1,
					title: "New Issue",
					body: "@pi help me with this",
					user: { login: "creator", type: "User" },
					author_association: "OWNER",
				},
			};

			const result = extractTriggerInfo(payload);
			expect(result).toEqual({
				isCommentEvent: false,
				triggerText: "@pi help me with this",
				author: { login: "creator", type: "User" },
				authorAssociation: "OWNER",
				issueNumber: 1,
				issueTitle: "New Issue",
				issueBody: "@pi help me with this",
				commentId: undefined,
				isPullRequest: false,
			});
		});

		it("extracts info from opened PR", () => {
			const payload = {
				pull_request: {
					number: 5,
					title: "New PR",
					body: "@pi please review",
					user: { login: "contributor", type: "User" },
					author_association: "CONTRIBUTOR",
				},
			};

			const result = extractTriggerInfo(payload);
			expect(result).toEqual({
				isCommentEvent: false,
				triggerText: "@pi please review",
				author: { login: "contributor", type: "User" },
				authorAssociation: "CONTRIBUTOR",
				issueNumber: 5,
				issueTitle: "New PR",
				issueBody: "@pi please review",
				commentId: undefined,
				isPullRequest: true,
			});
		});
	});

	describe("edge cases", () => {
		it("returns null for empty payload", () => {
			expect(extractTriggerInfo({})).toBeNull();
		});

		it("returns null when issue body is missing", () => {
			const payload = {
				issue: {
					number: 1,
					title: "No body",
					body: null,
					user: { login: "user", type: "User" },
					author_association: "OWNER",
				},
			};
			expect(extractTriggerInfo(payload)).toBeNull();
		});

		it("handles empty issue body", () => {
			const payload = {
				issue: {
					number: 1,
					title: "Empty body",
					body: "",
					user: { login: "user", type: "User" },
					author_association: "OWNER",
				},
			};
			// Empty string is falsy, so returns null
			expect(extractTriggerInfo(payload)).toBeNull();
		});

		it("handles bot users", () => {
			const payload = {
				comment: {
					id: 789,
					body: "@pi automated task",
					user: { login: "dependabot[bot]", type: "Bot" },
					author_association: "NONE",
				},
				issue: {
					number: 10,
					title: "Dependency update",
					body: "Update deps",
					user: { login: "dependabot[bot]", type: "Bot" },
					author_association: "NONE",
				},
			};

			const result = extractTriggerInfo(payload);
			expect(result?.author.type).toBe("Bot");
			expect(result?.author.login).toBe("dependabot[bot]");
		});
	});
});
