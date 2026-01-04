import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { runAgent } from "./agent.js";
import { extractTask, hasTrigger } from "./context.js";
import type { PIContext } from "./context.js";
import {
	addReaction,
	createGitHubClient,
	extractTriggerInfo,
} from "./github.js";
import { sanitizeInput, validatePermissions } from "./security.js";
import type { SecurityContext } from "./security.js";

function setupAuth(): void {
	const authJson = core.getInput("pi_auth_json");
	if (authJson) {
		const authDir = join(homedir(), ".pi", "agent");
		mkdirSync(authDir, { recursive: true });
		writeFileSync(join(authDir, "auth.json"), authJson);
		core.info("Wrote pi auth.json");
	}
}

async function run(): Promise<void> {
	setupAuth();

	const triggerPhrase = core.getInput("trigger_phrase") || "@pi";
	const allowedBots = (core.getInput("allowed_bots") || "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	const timeout = Number.parseInt(core.getInput("timeout") || "300", 10);
	const provider = core.getInput("provider") || "anthropic";
	const model = core.getInput("model") || "claude-sonnet-4-20250514";

	const { context } = github;
	const { payload } = context;

	// Extract trigger info from payload
	const triggerInfo = extractTriggerInfo(payload);
	if (!triggerInfo) {
		core.info("No issue or pull_request in payload, skipping");
		return;
	}

	// Check if trigger phrase is present
	if (!hasTrigger(triggerInfo.triggerText, triggerPhrase)) {
		core.info(`No trigger phrase "${triggerPhrase}" found, skipping`);
		return;
	}

	// Validate permissions
	const securityContext: SecurityContext = {
		authorAssociation: triggerInfo.authorAssociation,
		authorLogin: triggerInfo.author.login,
		isBot: triggerInfo.author.type === "Bot",
		allowedBots,
	};

	if (!validatePermissions(securityContext)) {
		core.warning(
			`User ${triggerInfo.author.login} (${triggerInfo.authorAssociation}) does not have permission`,
		);
		return;
	}

	const token = core.getInput("github_token") || process.env.GITHUB_TOKEN;
	if (!token) {
		core.setFailed("github_token is required");
		return;
	}
	const octokit = github.getOctokit(token);
	const ghClient = createGitHubClient(octokit, context);

	// Add eyes reaction to acknowledge
	await addReaction(ghClient, triggerInfo, "eyes");

	// Build context
	const sanitizedBody = sanitizeInput(triggerInfo.triggerText);
	const task = extractTask(sanitizedBody, triggerPhrase);

	const piContext: PIContext = {
		type: triggerInfo.isPullRequest ? "pull_request" : "issue",
		title: triggerInfo.issueTitle,
		body: triggerInfo.issueBody,
		number: triggerInfo.issueNumber,
		triggerComment: sanitizedBody,
		task,
	};

	// Get PR diff if applicable
	if (triggerInfo.isPullRequest) {
		piContext.diff = await ghClient.getPullRequestDiff(triggerInfo.issueNumber);
	}

	core.info(`Running pi agent for: ${task}`);

	// Run the agent
	const result = await runAgent(piContext, {
		provider,
		model,
		timeout,
		cwd: process.cwd(),
	});

	if (result.success) {
		await addReaction(ghClient, triggerInfo, "rocket");
		await ghClient.createComment(
			triggerInfo.issueNumber,
			`### 🤖 pi Response\n\n${result.response}`,
		);
	} else {
		core.error(`pi execution failed: ${result.error}`);
		await addReaction(ghClient, triggerInfo, "confused");
		await ghClient.createComment(
			triggerInfo.issueNumber,
			`### ❌ pi Error\n\nFailed to process request: ${result.error}`,
		);
	}
}

run().catch((error) => {
	core.setFailed(error instanceof Error ? error.message : "Unknown error");
});
