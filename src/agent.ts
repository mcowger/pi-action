import {
	type AuthStorage,
	AuthStorage as AuthStorageClass,
	createAgentSession,
	createCodingTools,
	type ModelRegistry,
	ModelRegistry as ModelRegistryClass,
	SessionManager,
	SettingsManager,
} from "@mariozechner/pi-coding-agent";
import type { PIContext } from "./context.js";
import { buildPrompt } from "./context.js";
import type { AgentResult, ModelConfig, Session } from "./types.js";
import { getErrorMessage, withTimeout } from "./utils.js";

export interface AgentLogger {
	info: (msg: string) => void;
}

export interface AgentConfig extends ModelConfig {
	cwd: string;
	logger?: AgentLogger;
	promptTemplate?: string;
}

/**
 * Session event types from the pi SDK
 */
interface SessionEvent {
	type: string;
	toolName?: string;
	args?: Record<string, unknown>;
	isError?: boolean;
	assistantMessageEvent?: {
		type: string;
		delta?: string;
	};
}

/**
 * Creates a session event handler that logs tool executions and collects response text.
 */
function createSessionEventHandler(
	log: AgentLogger,
	onTextDelta: (delta: string) => void,
): (event: SessionEvent) => void {
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: switch statement handling many event types
	return (event: SessionEvent) => {
		switch (event.type) {
			case "turn_start":
				log.info("🔄 Turn started");
				break;
			case "turn_end":
				log.info("✅ Turn completed");
				break;
			case "tool_execution_start":
				log.info(`🔧 Tool: ${event.toolName}`);
				if (event.toolName === "bash" && event.args?.command) {
					log.info(`   $ ${event.args.command}`);
				} else if (event.toolName === "read" && event.args?.path) {
					log.info(`   📖 ${event.args.path}`);
				} else if (event.toolName === "write" && event.args?.path) {
					log.info(`   ✏️ ${event.args.path}`);
				} else if (event.toolName === "edit" && event.args?.path) {
					log.info(`   📝 ${event.args.path}`);
				}
				break;
			case "tool_execution_end":
				if (event.isError) {
					log.info(`   ❌ Tool error: ${event.toolName}`);
				}
				break;
			case "message_update":
				if (event.assistantMessageEvent?.type === "text_delta") {
					onTextDelta(event.assistantMessageEvent.delta ?? "");
				}
				break;
		}
	};
}

export async function runAgent(
	piContext: PIContext,
	config: AgentConfig,
	authStorage?: AuthStorage,
	modelRegistry?: ModelRegistry,
): Promise<AgentResult> {
	const prompt = buildPrompt(piContext, config.promptTemplate);

	// Use provided or create auth/models
	const auth = authStorage ?? AuthStorageClass.create();
	const models = modelRegistry ?? ModelRegistryClass.create(auth);

	// Find the model
	const model = models.find(config.provider, config.model);
	if (!model) {
		return {
			success: false,
			error: `Model not found: ${config.provider}/${config.model}`,
		};
	}

	// Collect response text
	let response = "";
	let session: Session | undefined;

	try {
		const { session: createdSession } = await createAgentSession({
			cwd: config.cwd,
			model,
			thinkingLevel: "off",
			authStorage: auth,
			modelRegistry: models,
			tools: createCodingTools(config.cwd),
			sessionManager: SessionManager.create(config.cwd),
			settingsManager: SettingsManager.inMemory({
				compaction: { enabled: false },
				retry: { enabled: true, maxRetries: 2 },
			}),
		});

		session = createdSession;

		// biome-ignore lint/suspicious/noEmptyBlockStatements: noop logger
		const log = config.logger ?? { info: () => {} };
		const eventHandler = createSessionEventHandler(log, (delta) => {
			response += delta;
		});

		createdSession.subscribe(eventHandler);

		// Run with timeout
		await withTimeout(
			createdSession.prompt(prompt),
			config.timeout * 1000,
			`Timeout after ${config.timeout} seconds`,
		);

		// Get response from the session's last assistant message
		// This is more reliable than streaming text_delta events,
		// which may not fire for all providers/event structures
		const sessionResponse = createdSession.getLastAssistantText();
		const trimmedResponse = (sessionResponse ?? response).trim();
		if (!trimmedResponse) {
			return {
				success: false,
				error: "Agent returned empty response",
				session,
			};
		}

		return { success: true, response: trimmedResponse, session };
	} catch (error) {
		return { success: false, error: getErrorMessage(error), session };
	}
}
