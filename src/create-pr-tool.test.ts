import { describe, expect, it, vi } from "vitest";
import { createPullRequestTool } from "./create-pr-tool.js";

function createMockPRClient() {
	return {
		createPullRequest: vi.fn().mockResolvedValue({
			number: 42,
			html_url: "https://github.com/testowner/testrepo/pull/42",
		}),
		getDefaultBranch: vi.fn().mockResolvedValue("main"),
		getCurrentBranch: vi.fn().mockResolvedValue("pi-action/20260419-120000"),
	};
}

describe("createPullRequestTool", () => {
	it("creates a tool with the correct name and label", () => {
		const client = createMockPRClient();
		const tool = createPullRequestTool({ client, owner: "testowner", repo: "testrepo" });

		expect(tool.name).toBe("create_pull_request");
		expect(tool.label).toBe("Create Pull Request");
	});

	it("has description and prompt guidance", () => {
		const client = createMockPRClient();
		const tool = createPullRequestTool({ client, owner: "testowner", repo: "testrepo" });

		expect(tool.description).toContain("Create a pull request");
		expect(tool.description).toContain("do NOT use `gh pr create`");
		expect(tool.promptSnippet).toBeDefined();
		expect(tool.promptGuidelines).toBeDefined();
		expect(tool.promptGuidelines?.length).toBeGreaterThan(0);
	});

	it("creates a PR successfully", async () => {
		const client = createMockPRClient();
		const tool = createPullRequestTool({ client, owner: "testowner", repo: "testrepo" });

		const result = await tool.execute(
			"call-1",
			{ title: "Fix bug", body: "Fixes #123" },
			undefined,
		);

		expect(result.content).toHaveLength(1);
		expect(result.content[0].type).toBe("text");
		expect(result.content[0].text).toContain("#42");
		expect(result.content[0].text).toContain(
			"https://github.com/testowner/testrepo/pull/42",
		);
		expect(result.details.pullRequestNumber).toBe(42);
		expect(result.details.headBranch).toBe("pi-action/20260419-120000");
		expect(result.details.baseBranch).toBe("main");

		expect(client.createPullRequest).toHaveBeenCalledWith({
			owner: "testowner",
			repo: "testrepo",
			title: "Fix bug",
			body: "Fixes #123\n\n---\n*Created by pi-action 🤖*",
			head: "pi-action/20260419-120000",
			base: "main",
		});
	});

	it("uses default branch when base not specified", async () => {
		const client = createMockPRClient();
		const tool = createPullRequestTool({ client, owner: "testowner", repo: "testrepo" });

		await tool.execute("call-1", { title: "Fix bug" }, undefined);

		expect(client.getDefaultBranch).toHaveBeenCalledWith("testowner", "testrepo");
		expect(client.createPullRequest).toHaveBeenCalledWith(
			expect.objectContaining({ base: "main" }),
		);
	});

	it("uses provided base branch", async () => {
		const client = createMockPRClient();
		const tool = createPullRequestTool({ client, owner: "testowner", repo: "testrepo" });

		await tool.execute("call-1", { title: "Fix bug", base: "develop" }, undefined);

		expect(client.getDefaultBranch).not.toHaveBeenCalled();
		expect(client.createPullRequest).toHaveBeenCalledWith(
			expect.objectContaining({ base: "develop" }),
		);
	});

	it("auto-appends attribution to PR body", async () => {
		const client = createMockPRClient();
		const tool = createPullRequestTool({ client, owner: "testowner", repo: "testrepo" });

		await tool.execute("call-1", { title: "Fix", body: "My changes" }, undefined);

		expect(client.createPullRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				body: "My changes\n\n---\n*Created by pi-action 🤖*",
			}),
		);
	});

	it("does not append attribution if already present", async () => {
		const client = createMockPRClient();
		const tool = createPullRequestTool({ client, owner: "testowner", repo: "testrepo" });

		await tool.execute(
			"call-1",
			{ title: "Fix", body: "Fixes #1\nCreated by pi-action 🤖" },
			undefined,
		);

		expect(client.createPullRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				body: "Fixes #1\nCreated by pi-action 🤖",
			}),
		);
	});

	it("errors when head branch equals base branch", async () => {
		const client = createMockPRClient();
		client.getCurrentBranch = vi.fn().mockResolvedValue("main");
		const tool = createPullRequestTool({ client, owner: "testowner", repo: "testrepo" });

		const result = await tool.execute(
			"call-1",
			{ title: "Fix bug" },
			undefined,
		);

		expect(result.content[0].text).toContain("Error");
		expect(result.content[0].text).toContain("base branch");
		expect(result.content[0].text).toContain("git checkout -b");
		expect(result.details.pullRequestNumber).toBe(0);
		expect(client.createPullRequest).not.toHaveBeenCalled();
	});

	it("uses empty body when not provided", async () => {
		const client = createMockPRClient();
		const tool = createPullRequestTool({ client, owner: "testowner", repo: "testrepo" });

		await tool.execute("call-1", { title: "Fix" }, undefined);

		expect(client.createPullRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				body: "\n\n---\n*Created by pi-action 🤖*",
			}),
		);
	});

	it("invokes onPRCreated callback when PR is created", async () => {
		const client = createMockPRClient();
		const onPRCreated = vi.fn();
		const tool = createPullRequestTool({ client, owner: "testowner", repo: "testrepo", onPRCreated });

		await tool.execute("call-1", { title: "Fix bug" }, undefined);

		expect(onPRCreated).toHaveBeenCalledWith({
			number: 42,
			url: "https://github.com/testowner/testrepo/pull/42",
			headBranch: "pi-action/20260419-120000",
			baseBranch: "main",
		});
	});
});
