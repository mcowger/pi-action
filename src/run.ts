import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { runAgent } from "./agent.js";
import { buildPrompt, extractTask, hasTrigger } from "./context.js";
import type { PIContext } from "./context.js";
import { createPullRequestTool } from "./create-pr-tool.js";
import { formatErrorComment, formatSuccessComment } from "./formatting.js";
import {
	addReaction,
	extractTriggerInfo,
	type GitHubClient,
} from "./github.js";
import { parseInlineComments } from "./inline-comments.js";
import type { SecurityContext } from "./security.js";
import { sanitizeInput, validatePermissions } from "./security.js";
import { shareSession } from "./share.js";
import type { ModelConfig, RepoRef, Session, TriggerInfo } from "./types.js";

export interface ActionInputs {
	triggerPhrase: string;
	allowedBots: string[];
	modelConfig: ModelConfig;
	githubToken: string | undefined;
	gistToken: string | undefined;
	piAuthJson: string | undefined;
	piModelsJson: string | undefined;
	promptTemplate: string | undefined;
	shareSession: boolean;
	outputMode: "comment" | "output";
	prompt: string | undefined;
	branchMode: "branch" | "direct";
}

export interface ActionContext {
	payload: Record<string, unknown>;
	repo: RepoRef;
}

export interface Logger {
	info: (msg: string) => void;
	warning: (msg: string) => void;
	error: (msg: string) => void;
	setFailed: (msg: string) => void;
	setOutput: (name: string, value: string) => void;
	debug?: (msg: string) => void;
}

export interface ActionDependencies {
	inputs: ActionInputs;
	context: ActionContext;
	createClient: (token: string) => GitHubClient;
	log: Logger;
	cwd: string;
}

export function setupAuth(piAuthJson: string | undefined): void {
	if (piAuthJson) {
		const authDir = join(homedir(), ".pi", "agent");
		mkdirSync(authDir, { recursive: true });
		writeFileSync(join(authDir, "auth.json"), piAuthJson);
	}
}

export function setupModels(piModelsJson: string | undefined): void {
	if (piModelsJson) {
		const authDir = join(homedir(), ".pi", "agent");
		mkdirSync(authDir, { recursive: true });
		writeFileSync(join(authDir, "models.json"), piModelsJson);
	}
}

/**
 * Validates that the trigger is authorized to run the agent.
 * Returns the trigger info if valid, null otherwise.
 */
function validateTrigger(
	deps: ActionDependencies,
): { triggerInfo: TriggerInfo; ghClient: GitHubClient } | null {
	const { inputs, context, createClient, log } = deps;

	// Extract trigger info from payload
	const triggerInfo = extractTriggerInfo(context.payload);
	if (!triggerInfo) {
		log.info("No issue or pull_request in payload, skipping");
		return null;
	}

	// Only require trigger phrase on comment events.
	// For creation events (PR opened, issue opened), the event itself is the trigger.
	if (triggerInfo.isCommentEvent && !hasTrigger(triggerInfo.triggerText, inputs.triggerPhrase)) {
		log.info(`No trigger phrase "${inputs.triggerPhrase}" found, skipping`);
		return null;
	}

	// Only validate author permissions on comment-triggered invocations.
	// For creation events (PR opened, issue opened), the workflow itself
	// is the gate — the event is the intent.
	if (triggerInfo.isCommentEvent) {
		const securityContext: SecurityContext = {
			authorAssociation: triggerInfo.authorAssociation,
			authorLogin: triggerInfo.author.login,
			isBot: triggerInfo.author.type === "Bot",
			allowedBots: inputs.allowedBots,
		};

		if (!validatePermissions(securityContext)) {
			log.warning(
				`User ${triggerInfo.author.login} (${triggerInfo.authorAssociation}) does not have permission`,
			);
			return null;
		}
	}

	if (!inputs.githubToken) {
		log.setFailed("github_token is required");
		return null;
	}

	const ghClient = createClient(inputs.githubToken);
	return { triggerInfo, ghClient };
}

/**
 * Builds the PI context from trigger info and inputs.
 */
async function buildPIContext(
	triggerInfo: TriggerInfo,
	ghClient: GitHubClient,
	triggerPhrase: string,
): Promise<PIContext> {
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

	return piContext;
}

/**
 * Posts the agent result as a comment with appropriate reaction.
 */
async function postResult(
	ghClient: GitHubClient,
	gistClient: GitHubClient | undefined,
	triggerInfo: TriggerInfo,
	result:
		| { success: true; response: string; session?: Session }
		| { success: false; error: string; session?: Session },
	shareSessionEnabled: boolean,
	outputMode: "comment" | "output",
	log: Logger,
): Promise<void> {
	let shareUrl: string | undefined;

	// Try to share session if enabled and session exists
	// Use gistClient if available, otherwise fall back to ghClient
	if (shareSessionEnabled && result.session) {
		const clientForGist = gistClient ?? ghClient;
		try {
			const shareResult = await shareSession(
				result.session,
				clientForGist,
				`pi-action session for ${result.success ? "success" : "error"}: ${triggerInfo.issueTitle}`,
			);
			if (shareResult) {
				shareUrl = shareResult.previewUrl;
				log.info(`Session shared: ${shareUrl}`);
			}
		} catch (error) {
			log.warning(`Failed to share session: ${error}`);
		}
	}

	// In output mode, just set action outputs and return
	if (outputMode === "output") {
		log.setOutput("success", String(result.success));
		if (result.success) {
			let responseText = result.response;
			if (triggerInfo.isPullRequest) {
				const { comments, cleanResponse } = parseInlineComments(result.response);
				responseText = cleanResponse;
				if (comments.length > 0) {
					log.info(`Parsed ${comments.length} inline comment(s) from response (not posted in output mode)`);
				}
			}
			log.setOutput("response", responseText);
		} else {
			log.error(`pi execution failed: ${result.error}`);
			log.setOutput("response", result.error);
		}
		if (shareUrl) {
			log.setOutput("share_url", shareUrl);
		}
		return;
	}

	// Comment mode: post to issue/PR
	if (result.success) {
		// Parse inline comments from response for PRs
		let responseText = result.response;
		if (triggerInfo.isPullRequest) {
			const { comments, cleanResponse } = parseInlineComments(result.response);
			responseText = cleanResponse;

			if (comments.length > 0) {
				try {
					const reviewResult = await ghClient.createPRReview(
						triggerInfo.issueNumber,
						comments,
					);
					log.info(
						`Created PR review with ${reviewResult.commentsAdded} inline comment(s): ${reviewResult.reviewUrl}`,
					);
				} catch (error) {
					log.warning(`Failed to create PR review comments: ${error}`);
				}
			}
		}

		await addReaction(ghClient, triggerInfo, "rocket");
		await ghClient.createComment(
			triggerInfo.issueNumber,
			formatSuccessComment(responseText, shareUrl),
		);
	} else {
		log.error(`pi execution failed: ${result.error}`);
		await addReaction(ghClient, triggerInfo, "confused");
		await ghClient.createComment(
			triggerInfo.issueNumber,
			formatErrorComment(result.error, shareUrl),
		);
	}
}

export async function run(deps: ActionDependencies): Promise<void> {
	const { inputs, log, cwd, createClient } = deps;

	setupAuth(inputs.piAuthJson);
	setupModels(inputs.piModelsJson);

	// Direct prompt mode: run agent with a literal prompt, no issue/PR needed
	if (inputs.outputMode === "output" && inputs.prompt) {
		log.info(`Running pi agent with direct prompt`);

		const piContext: PIContext = {
			type: "direct",
			title: "",
			body: "",
			number: 0,
			triggerComment: inputs.prompt,
			task: inputs.prompt,
		};

	const result = await runAgent(piContext, {
			...inputs.modelConfig,
			cwd,
			logger: log,
			promptTemplate: inputs.promptTemplate,
		});

		// Set outputs
		log.setOutput("success", String(result.success));
		if (result.success) {
			log.setOutput("response", result.response);
		} else {
			log.error(`pi execution failed: ${result.error}`);
			log.setOutput("response", result.error);
		}

		// Share session if enabled
		if (inputs.shareSession && result.session && inputs.githubToken) {
			try {
				const ghClient = createClient(inputs.githubToken);
				const gistClient = inputs.gistToken
					? createClient(inputs.gistToken)
					: ghClient;
				const shareResult = await shareSession(
					result.session,
					gistClient,
					"pi-action direct prompt session",
				);
				if (shareResult) {
					log.setOutput("share_url", shareResult.previewUrl);
					log.info(`Session shared: ${shareResult.previewUrl}`);
				}
			} catch (error) {
				log.warning(`Failed to share session: ${error}`);
			}
		}

		return;
	}

	// Issue/PR mode: validate and extract trigger info
	const validated = validateTrigger(deps);
	if (!validated) {
		return;
	}

	const { triggerInfo, ghClient } = validated;

	// Create separate gist client if gist token is provided
	const gistClient = inputs.gistToken
		? createClient(inputs.gistToken)
		: undefined;

	// Add eyes reaction to acknowledge (only in comment mode)
	if (inputs.outputMode === "comment") {
		await addReaction(ghClient, triggerInfo, "eyes");
	}

	// Build context
	const piContext = await buildPIContext(
		triggerInfo,
		ghClient,
		inputs.triggerPhrase,
	);

	log.info(`Running pi agent for: ${piContext.task}`);

	// Run the agent
	const result = await runAgent(piContext, {
		...inputs.modelConfig,
		cwd,
		logger: log,
		promptTemplate: inputs.promptTemplate,
		branchMode: inputs.branchMode,
		customTools:
			inputs.branchMode === "branch" && inputs.githubToken
				? [createPullRequestTool(ghClient, deps.context.repo.owner, deps.context.repo.name)]
				: undefined,
	});

	// Post result (use gistClient for session sharing if available)
	await postResult(
		ghClient,
		gistClient,
		triggerInfo,
		result,
		inputs.shareSession,
		inputs.outputMode,
		log,
	);
}
