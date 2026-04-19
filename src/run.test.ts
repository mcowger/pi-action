import * as fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS } from "./defaults.js";
import { type ActionDependencies, run, setupAuth, setupModels } from "./run.js";
import {
	createMockGitHubClient,
	createModelConfig,
	createRepoRef,
} from "./test-helpers.js";

// Mock the agent module
vi.mock("./agent.js", () => ({
	runAgent: vi.fn(),
}));

// Mock the share module
vi.mock("./share.js", () => ({
	shareSession: vi.fn(),
}));

import { runAgent } from "./agent.js";
import { shareSession } from "./share.js";

// Mock fs and os for setupAuth tests
vi.mock("node:fs", () => ({
	mkdirSync: vi.fn(),
	writeFileSync: vi.fn(),
}));

vi.mock("node:os", () => ({
	homedir: vi.fn(() => "/home/testuser"),
}));

describe("setupAuth", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("does nothing when piAuthJson is undefined", () => {
		setupAuth(undefined);
		expect(fs.mkdirSync).not.toHaveBeenCalled();
		expect(fs.writeFileSync).not.toHaveBeenCalled();
	});

	it("does nothing when piAuthJson is empty string", () => {
		setupAuth("");
		expect(fs.mkdirSync).not.toHaveBeenCalled();
		expect(fs.writeFileSync).not.toHaveBeenCalled();
	});

	it("writes auth.json when piAuthJson is provided", () => {
		const authJson = '{"anthropic": {"key": "test"}}';
		setupAuth(authJson);

		expect(fs.mkdirSync).toHaveBeenCalledWith("/home/testuser/.pi/agent", {
			recursive: true,
		});
		expect(fs.writeFileSync).toHaveBeenCalledWith(
			"/home/testuser/.pi/agent/auth.json",
			authJson,
		);
	});
});

describe("setupModels", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("does nothing when piModelsJson is undefined", () => {
		setupModels(undefined);
		expect(fs.mkdirSync).not.toHaveBeenCalled();
		expect(fs.writeFileSync).not.toHaveBeenCalled();
	});

	it("does nothing when piModelsJson is empty string", () => {
		setupModels("");
		expect(fs.mkdirSync).not.toHaveBeenCalled();
		expect(fs.writeFileSync).not.toHaveBeenCalled();
	});

	it("writes models.json when piModelsJson is provided", () => {
		const modelsJson = '{"providers":{"openai":{"apiKey":"test"}}}';
		setupModels(modelsJson);

		expect(fs.mkdirSync).toHaveBeenCalledWith("/home/testuser/.pi/agent", {
			recursive: true,
		});
		expect(fs.writeFileSync).toHaveBeenCalledWith(
			"/home/testuser/.pi/agent/models.json",
			modelsJson,
		);
	});
});

describe("run", () => {
	function createMockDeps(
		overrides: Partial<ActionDependencies> = {},
	): ActionDependencies {
		return {
			inputs: {
				triggerPhrase: DEFAULTS.triggerPhrase,
				allowedBots: [],
				modelConfig: createModelConfig(),
				githubToken: "test-token",
				gistToken: undefined,
				piAuthJson: undefined,
				piModelsJson: undefined,
				promptTemplate: undefined,
				shareSession: true,
				outputMode: "comment" as const,
				prompt: undefined,
			},
			context: {
				payload: {},
				repo: createRepoRef(),
			},
			createClient: vi.fn(() => createMockGitHubClient()),
			log: {
				info: vi.fn(),
				warning: vi.fn(),
				error: vi.fn(),
				setFailed: vi.fn(),
				setOutput: vi.fn(),
			},
			cwd: "/test/cwd",
			...overrides,
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("skips when no issue or PR in payload", async () => {
		const deps = createMockDeps();
		await run(deps);
		expect(deps.log.info).toHaveBeenCalledWith(
			"No issue or pull_request in payload, skipping",
		);
	});

	it("skips when trigger phrase not found", async () => {
		const deps = createMockDeps({
			context: {
				payload: {
					issue: {
						number: 1,
						title: "Test",
						body: "No trigger here",
						user: { login: "user", type: "User" },
						author_association: "OWNER",
					},
				},
				repo: { owner: "testowner", repo: "testrepo" },
			},
		});

		await run(deps);
		expect(deps.log.info).toHaveBeenCalledWith(
			'No trigger phrase "@pi" found, skipping',
		);
	});

	it("warns and skips when user lacks permission", async () => {
		const deps = createMockDeps({
			context: {
				payload: {
					issue: {
						number: 1,
						title: "Test",
						body: "@pi do something",
						user: { login: "stranger", type: "User" },
						author_association: "NONE",
					},
				},
				repo: { owner: "testowner", repo: "testrepo" },
			},
		});

		await run(deps);
		expect(deps.log.warning).toHaveBeenCalledWith(
			"User stranger (NONE) does not have permission",
		);
	});

	it("allows bots in allowedBots list", async () => {
		const mockClient = createMockGitHubClient();
		const deps = createMockDeps({
			inputs: {
				...createMockDeps().inputs,
				allowedBots: ["dependabot[bot]"],
			},
			context: {
				payload: {
					comment: {
						id: 123,
						body: "@pi update deps",
						user: { login: "dependabot[bot]", type: "Bot" },
						author_association: "NONE",
					},
					issue: {
						number: 1,
						title: "Dependency Update",
						body: "Update deps",
						user: { login: "dependabot[bot]", type: "Bot" },
						author_association: "NONE",
					},
				},
				repo: createRepoRef(),
			},
			createClient: vi.fn(() => mockClient),
		});

		vi.mocked(runAgent).mockResolvedValue({
			success: true,
			response: "Done",
		});

		await run(deps);

		// Should not have logged a warning about permissions
		expect(deps.log.warning).not.toHaveBeenCalled();
		// Should have proceeded to add reaction
		expect(mockClient.addReactionToComment).toHaveBeenCalledWith(123, "eyes");
	});

	it("fails when github_token is missing", async () => {
		const deps = createMockDeps({
			inputs: {
				...createMockDeps().inputs,
				githubToken: undefined,
			},
			context: {
				payload: {
					issue: {
						number: 1,
						title: "Test",
						body: "@pi do something",
						user: { login: "user", type: "User" },
						author_association: "OWNER",
					},
				},
				repo: createRepoRef(),
			},
		});

		await run(deps);
		expect(deps.log.setFailed).toHaveBeenCalledWith("github_token is required");
	});

	it("runs agent and posts success response", async () => {
		const mockClient = createMockGitHubClient();
		const deps = createMockDeps({
			context: {
				payload: {
					issue: {
						number: 42,
						title: "Test Issue",
						body: "@pi help me",
						user: { login: "user", type: "User" },
						author_association: "OWNER",
					},
				},
				repo: createRepoRef(),
			},
			createClient: vi.fn(() => mockClient),
		});

		vi.mocked(runAgent).mockResolvedValue({
			success: true,
			response: "Here is your help!",
		});

		await run(deps);

		expect(mockClient.addReactionToIssue).toHaveBeenCalledWith(42, "eyes");
		expect(runAgent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "issue",
				title: "Test Issue",
				task: "help me",
			}),
			expect.objectContaining({
				provider: DEFAULTS.provider,
				model: DEFAULTS.model,
				timeout: DEFAULTS.timeout,
				cwd: "/test/cwd",
			}),
		);
		expect(mockClient.addReactionToIssue).toHaveBeenCalledWith(42, "rocket");
		expect(mockClient.createComment).toHaveBeenCalledWith(
			42,
			"### 🤖 pi Response\n\nHere is your help!",
		);
	});

	it("runs agent and posts error response on failure", async () => {
		const mockClient = createMockGitHubClient();
		const deps = createMockDeps({
			context: {
				payload: {
					issue: {
						number: 42,
						title: "Test Issue",
						body: "@pi do something",
						user: { login: "user", type: "User" },
						author_association: "MEMBER",
					},
				},
				repo: createRepoRef(),
			},
			createClient: vi.fn(() => mockClient),
		});

		vi.mocked(runAgent).mockResolvedValue({
			success: false,
			error: "Model not found",
		});

		await run(deps);

		expect(deps.log.error).toHaveBeenCalledWith(
			"pi execution failed: Model not found",
		);
		expect(mockClient.addReactionToIssue).toHaveBeenCalledWith(42, "confused");
		expect(mockClient.createComment).toHaveBeenCalledWith(
			42,
			"### ❌ pi Error\n\nFailed to process request: Model not found",
		);
	});

	it("fetches PR diff for pull requests", async () => {
		const mockClient = createMockGitHubClient();
		mockClient.getPullRequestDiff = vi
			.fn()
			.mockResolvedValue("+added\n-removed");
		const deps = createMockDeps({
			context: {
				payload: {
					pull_request: {
						number: 99,
						title: "Add Feature",
						body: "@pi review",
						user: { login: "contributor", type: "User" },
						author_association: "COLLABORATOR",
					},
				},
				repo: createRepoRef(),
			},
			createClient: vi.fn(() => mockClient),
		});

		vi.mocked(runAgent).mockResolvedValue({
			success: true,
			response: "LGTM!",
		});

		await run(deps);

		expect(mockClient.getPullRequestDiff).toHaveBeenCalledWith(99);
		expect(runAgent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "pull_request",
				diff: "+added\n-removed",
			}),
			expect.anything(),
		);
	});

	it("handles comment events", async () => {
		const mockClient = createMockGitHubClient();
		const deps = createMockDeps({
			context: {
				payload: {
					comment: {
						id: 123,
						body: "@pi format code",
						user: { login: "reviewer", type: "User" },
						author_association: "MEMBER",
					},
					issue: {
						number: 42,
						title: "Code Review",
						body: "Please review",
						user: { login: "author", type: "User" },
						author_association: "OWNER",
					},
				},
				repo: createRepoRef(),
			},
			createClient: vi.fn(() => mockClient),
		});

		vi.mocked(runAgent).mockResolvedValue({
			success: true,
			response: "Code formatted!",
		});

		await run(deps);

		// Should add reaction to comment, not issue
		expect(mockClient.addReactionToComment).toHaveBeenCalledWith(123, "eyes");
		expect(mockClient.addReactionToComment).toHaveBeenCalledWith(123, "rocket");
		expect(mockClient.addReactionToIssue).not.toHaveBeenCalled();
	});

	it("sanitizes input before processing", async () => {
		const mockClient = createMockGitHubClient();
		const deps = createMockDeps({
			context: {
				payload: {
					issue: {
						number: 1,
						title: "Test",
						body: "@pi <!-- hidden --> do something\u200B",
						user: { login: "user", type: "User" },
						author_association: "OWNER",
					},
				},
				repo: createRepoRef(),
			},
			createClient: vi.fn(() => mockClient),
		});

		vi.mocked(runAgent).mockResolvedValue({
			success: true,
			response: "Done",
		});

		await run(deps);

		expect(runAgent).toHaveBeenCalledWith(
			expect.objectContaining({
				task: "do something",
				triggerComment: "@pi  do something", // HTML comment and invisible char removed
			}),
			expect.anything(),
		);
	});

	it("shares session when shareSession is enabled", async () => {
		const mockClient = createMockGitHubClient();
		const mockSession = { exportToHtml: vi.fn() };

		// Mock shareSession to return a result
		vi.mocked(shareSession).mockResolvedValue({
			gistUrl: "https://gist.github.com/user/abc123",
			previewUrl: "https://shittycodingagent.ai/session?abc123",
		});

		const deps = createMockDeps({
			context: {
				payload: {
					issue: {
						number: 1,
						title: "Test Issue",
						body: "@pi test task",
						user: { login: "user", type: "User" },
						author_association: "OWNER",
					},
				},
				repo: createRepoRef(),
			},
			createClient: vi.fn(() => mockClient),
			inputs: {
				...createMockDeps().inputs,
				shareSession: true,
			},
		});

		vi.mocked(runAgent).mockResolvedValue({
			success: true,
			response: "Task completed!",
			session: mockSession,
		});

		await run(deps);

		// Check that comment includes session link
		expect(mockClient.createComment).toHaveBeenCalledWith(
			1,
			expect.stringContaining(
				"📎 [View full session](https://shittycodingagent.ai/session?abc123)",
			),
		);
	});

	it("works without session sharing when shareSession is disabled", async () => {
		const mockClient = createMockGitHubClient();

		const deps = createMockDeps({
			context: {
				payload: {
					issue: {
						number: 1,
						title: "Test Issue",
						body: "@pi test task",
						user: { login: "user", type: "User" },
						author_association: "OWNER",
					},
				},
				repo: createRepoRef(),
			},
			createClient: vi.fn(() => mockClient),
			inputs: {
				...createMockDeps().inputs,
				shareSession: false,
			},
		});

		vi.mocked(runAgent).mockResolvedValue({
			success: true,
			response: "Task completed!",
		});

		await run(deps);

		// Check that comment does not include session link
		expect(mockClient.createComment).toHaveBeenCalledWith(
			1,
			"### 🤖 pi Response\n\nTask completed!",
		);
	});

	it("shares session on error response when session is available", async () => {
		const mockClient = createMockGitHubClient();
		const mockSession = { exportToHtml: vi.fn() };

		// Mock shareSession to return a result
		vi.mocked(shareSession).mockResolvedValue({
			gistUrl: "https://gist.github.com/user/error123",
			previewUrl: "https://shittycodingagent.ai/session?error123",
		});

		const deps = createMockDeps({
			context: {
				payload: {
					issue: {
						number: 1,
						title: "Test Issue",
						body: "@pi test task",
						user: { login: "user", type: "User" },
						author_association: "OWNER",
					},
				},
				repo: createRepoRef(),
			},
			createClient: vi.fn(() => mockClient),
			inputs: {
				...createMockDeps().inputs,
				shareSession: true,
			},
		});

		vi.mocked(runAgent).mockResolvedValue({
			success: false,
			error: "Something went wrong",
			session: mockSession,
		});

		await run(deps);

		// Check that error comment includes session link
		expect(mockClient.createComment).toHaveBeenCalledWith(
			1,
			expect.stringContaining(
				"📎 [View full session](https://shittycodingagent.ai/session?error123)",
			),
		);
		expect(mockClient.createComment).toHaveBeenCalledWith(
			1,
			expect.stringContaining("### ❌ pi Error"),
		);
	});

	it("posts response without session link when sharing fails", async () => {
		const mockClient = createMockGitHubClient();
		const mockSession = { exportToHtml: vi.fn() };

		// Mock shareSession to return null (failure)
		vi.mocked(shareSession).mockResolvedValue(null);

		const deps = createMockDeps({
			context: {
				payload: {
					issue: {
						number: 1,
						title: "Test Issue",
						body: "@pi test task",
						user: { login: "user", type: "User" },
						author_association: "OWNER",
					},
				},
				repo: createRepoRef(),
			},
			createClient: vi.fn(() => mockClient),
			inputs: {
				...createMockDeps().inputs,
				shareSession: true,
			},
		});

		vi.mocked(runAgent).mockResolvedValue({
			success: true,
			response: "Task completed!",
			session: mockSession,
		});

		await run(deps);

		// Should still post the response without session link
		expect(mockClient.createComment).toHaveBeenCalledWith(
			1,
			"### 🤖 pi Response\n\nTask completed!",
		);
	});

	it("posts response without session link when no session is returned", async () => {
		const mockClient = createMockGitHubClient();

		const deps = createMockDeps({
			context: {
				payload: {
					issue: {
						number: 1,
						title: "Test Issue",
						body: "@pi test task",
						user: { login: "user", type: "User" },
						author_association: "OWNER",
					},
				},
				repo: createRepoRef(),
			},
			createClient: vi.fn(() => mockClient),
			inputs: {
				...createMockDeps().inputs,
				shareSession: true,
			},
		});

		// No session returned (undefined)
		vi.mocked(runAgent).mockResolvedValue({
			success: true,
			response: "Task completed!",
		});

		await run(deps);

		// shareSession should not be called when no session
		expect(shareSession).not.toHaveBeenCalled();
		// Should still post the response without session link
		expect(mockClient.createComment).toHaveBeenCalledWith(
			1,
			"### 🤖 pi Response\n\nTask completed!",
		);
	});

	it("logs warning when session sharing throws", async () => {
		const mockClient = createMockGitHubClient();
		const mockSession = { exportToHtml: vi.fn() };

		// Mock shareSession to throw an error
		vi.mocked(shareSession).mockRejectedValue(new Error("Gist API error"));

		const deps = createMockDeps({
			context: {
				payload: {
					issue: {
						number: 1,
						title: "Test Issue",
						body: "@pi test task",
						user: { login: "user", type: "User" },
						author_association: "OWNER",
					},
				},
				repo: createRepoRef(),
			},
			createClient: vi.fn(() => mockClient),
			inputs: {
				...createMockDeps().inputs,
				shareSession: true,
			},
		});

		vi.mocked(runAgent).mockResolvedValue({
			success: true,
			response: "Task completed!",
			session: mockSession,
		});

		await run(deps);

		// Should log warning
		expect(deps.log.warning).toHaveBeenCalledWith(
			expect.stringContaining("Failed to share session"),
		);
		// Should still post the response without session link
		expect(mockClient.createComment).toHaveBeenCalledWith(
			1,
			"### 🤖 pi Response\n\nTask completed!",
		);
	});

	it("in output mode, sets outputs instead of posting comments on success", async () => {
		const mockClient = createMockGitHubClient();
		const deps = createMockDeps({
			context: {
				payload: {
					issue: {
						number: 42,
						title: "Test Issue",
						body: "@pi help me",
						user: { login: "user", type: "User" },
						author_association: "OWNER",
					},
				},
				repo: createRepoRef(),
			},
			createClient: vi.fn(() => mockClient),
			inputs: {
				...createMockDeps().inputs,
				outputMode: "output" as const,
			},
		});

		vi.mocked(runAgent).mockResolvedValue({
			success: true,
			response: "Here is your help!",
		});

		await run(deps);

		// Should NOT post any comments or reactions
		expect(mockClient.createComment).not.toHaveBeenCalled();
		expect(mockClient.addReactionToIssue).not.toHaveBeenCalled();
		expect(mockClient.addReactionToComment).not.toHaveBeenCalled();

		// Should set outputs
		expect(deps.log.setOutput).toHaveBeenCalledWith("success", "true");
		expect(deps.log.setOutput).toHaveBeenCalledWith("response", "Here is your help!");
	});

	it("in output mode, sets outputs on failure", async () => {
		const mockClient = createMockGitHubClient();
		const deps = createMockDeps({
			context: {
				payload: {
					issue: {
						number: 42,
						title: "Test Issue",
						body: "@pi do something",
						user: { login: "user", type: "User" },
						author_association: "OWNER",
					},
				},
				repo: createRepoRef(),
			},
			createClient: vi.fn(() => mockClient),
			inputs: {
				...createMockDeps().inputs,
				outputMode: "output" as const,
			},
		});

		vi.mocked(runAgent).mockResolvedValue({
			success: false,
			error: "Model not found",
		});

		await run(deps);

		// Should NOT post any comments or reactions
		expect(mockClient.createComment).not.toHaveBeenCalled();

		// Should set outputs
		expect(deps.log.setOutput).toHaveBeenCalledWith("success", "false");
		expect(deps.log.setOutput).toHaveBeenCalledWith("response", "Model not found");
	});

	it("in output mode, sets share_url output when session is shared", async () => {
		const mockClient = createMockGitHubClient();
		const mockSession = { exportToHtml: vi.fn() };

		vi.mocked(shareSession).mockResolvedValue({
			gistUrl: "https://gist.github.com/user/abc123",
			previewUrl: "https://shittycodingagent.ai/session?abc123",
		});

		const deps = createMockDeps({
			context: {
				payload: {
					issue: {
						number: 1,
						title: "Test Issue",
						body: "@pi test task",
						user: { login: "user", type: "User" },
						author_association: "OWNER",
					},
				},
				repo: createRepoRef(),
			},
			createClient: vi.fn(() => mockClient),
			inputs: {
				...createMockDeps().inputs,
				outputMode: "output" as const,
				shareSession: true,
			},
		});

		vi.mocked(runAgent).mockResolvedValue({
			success: true,
			response: "Task completed!",
			session: mockSession,
		});

		await run(deps);

		// Should set share_url output
		expect(deps.log.setOutput).toHaveBeenCalledWith(
			"share_url",
			"https://shittycodingagent.ai/session?abc123",
		);
		// Should NOT post comments
		expect(mockClient.createComment).not.toHaveBeenCalled();
	});

	it("in output mode, does not add eyes reaction", async () => {
		const mockClient = createMockGitHubClient();
		const deps = createMockDeps({
			context: {
				payload: {
					issue: {
						number: 42,
						title: "Test Issue",
						body: "@pi help me",
						user: { login: "user", type: "User" },
						author_association: "OWNER",
					},
				},
				repo: createRepoRef(),
			},
			createClient: vi.fn(() => mockClient),
			inputs: {
				...createMockDeps().inputs,
				outputMode: "output" as const,
			},
		});

		vi.mocked(runAgent).mockResolvedValue({
			success: true,
			response: "Done",
		});

		await run(deps);

		// Should NOT add eyes reaction in output mode
		expect(mockClient.addReactionToIssue).not.toHaveBeenCalled();
	});

	it("in direct prompt mode, runs agent with prompt and sets outputs", async () => {
		const deps = createMockDeps({
			inputs: {
				...createMockDeps().inputs,
				outputMode: "output" as const,
				prompt: "Generate release notes for the last 10 commits",
			},
		});

		vi.mocked(runAgent).mockResolvedValue({
			success: true,
			response: "## Release Notes\n- Fixed bug X\n- Added feature Y",
		});

		await run(deps);

		// Should run agent with the direct prompt
		expect(runAgent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "direct",
				task: "Generate release notes for the last 10 commits",
			}),
			expect.anything(),
		);

		// Should set outputs
		expect(deps.log.setOutput).toHaveBeenCalledWith("success", "true");
		expect(deps.log.setOutput).toHaveBeenCalledWith(
			"response",
			"## Release Notes\n- Fixed bug X\n- Added feature Y",
		);

		// Should NOT validate trigger or post comments
		expect(deps.log.info).toHaveBeenCalledWith(
			"Running pi agent with direct prompt",
		);
	});

	it("in direct prompt mode, handles agent failure", async () => {
		const deps = createMockDeps({
			inputs: {
				...createMockDeps().inputs,
				outputMode: "output" as const,
				prompt: "Generate release notes",
			},
		});

		vi.mocked(runAgent).mockResolvedValue({
			success: false,
			error: "Agent timeout",
		});

		await run(deps);

		expect(deps.log.setOutput).toHaveBeenCalledWith("success", "false");
		expect(deps.log.setOutput).toHaveBeenCalledWith("response", "Agent timeout");
		expect(deps.log.error).toHaveBeenCalledWith(
			"pi execution failed: Agent timeout",
		);
	});

	it("direct prompt mode requires output_mode: output", async () => {
		const mockClient = createMockGitHubClient();
		const deps = createMockDeps({
			context: {
				payload: {},
				repo: createRepoRef(),
			},
			inputs: {
				...createMockDeps().inputs,
				outputMode: "comment" as const,
				prompt: "Generate release notes",
			},
		});

		await run(deps);

		// Should NOT enter direct prompt mode — should fall through to normal validation
		expect(runAgent).not.toHaveBeenCalled();
		expect(deps.log.info).toHaveBeenCalledWith(
			"No issue or pull_request in payload, skipping",
		);
	});
});
