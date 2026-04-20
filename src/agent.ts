import {
	type AuthStorage,
	AuthStorage as AuthStorageClass,
	createAgentSession,
	createCodingTools,
	type ModelRegistry,
	ModelRegistry as ModelRegistryClass,
	SessionManager,
	SettingsManager,
	type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import type { PIContext } from "./context.js";
import { buildPrompt } from "./context.js";
import type { BuiltinTemplate } from "./templates.js";
import type { AgentResult, ModelConfig, Session } from "./types.js";
import { getErrorMessage, withTimeout } from "./utils.js";

export interface AgentLogger {
	info: (msg: string) => void;
	debug?: (msg: string) => void;
}

export interface AgentConfig extends ModelConfig {
	cwd: string;
	logger?: AgentLogger;
	promptTemplate?: string;
	customTools?: ToolDefinition[];
	branchMode?: "branch" | "direct";
	templateName?: BuiltinTemplate;
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
	const debug = log.debug?.bind(log.debug) ?? (() => {});

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
					const delta = event.assistantMessageEvent.delta ?? "";
					onTextDelta(delta);
					debug(`📝 text_delta (${delta.length} chars)`);
				} else {
					debug(
						`message_update: assistantMessageEvent.type=${event.assistantMessageEvent?.type}`,
					);
				}
				break;
			case "message_start":
				debug(
					`message_start: role=${(event as unknown as Record<string, unknown>).message}`,
				);
				break;
			case "message_end":
				debug("message_end");
				break;
			case "agent_end":
				debug("agent_end");
				break;
			default:
				debug(`event: ${event.type}`);
				break;
		}
	};
}

/**
 * After session.prompt() resolves, the SDK's internal _agentEventQueue
 * (a promise chain) may not have finished processing the final events
 * (message_end, agent_end) that update the session's messages array.
 *
 * Poll getLastAssistantText() for up to 2 seconds to give the queue
 * time to drain. Falls back to the streaming text accumulator if the
 * session still returns nothing.
 */
async function resolveResponse(
	session: { getLastAssistantText(): string | undefined; messages: unknown[] },
	streamedText: string,
	debug: (msg: string) => void,
): Promise<string> {
	// Try immediately first (common case in non-CI environments)
	const immediate = session.getLastAssistantText();
	if (immediate) {
		debug(
			`resolveResponse: got ${immediate.length} chars from getLastAssistantText() immediately`,
		);
		return immediate;
	}

	debug(
		`resolveResponse: getLastAssistantText() returned undefined, messages count=${session.messages.length}, streamedText length=${streamedText.length}`,
	);
	debug(`resolveResponse: polling for up to 2s...`);

	// Poll for up to 2 seconds (CI environments may need this)
	for (let i = 0; i < 20; i++) {
		await new Promise((resolve) => setTimeout(resolve, 100));
		const text = session.getLastAssistantText();
		if (text) {
			debug(
				`resolveResponse: got ${text.length} chars from getLastAssistantText() after ${(i + 1) * 100}ms`,
			);
			return text;
		}
	}

	debug(
		`resolveResponse: polling timed out, falling back to streamedText (${streamedText.length} chars)`,
	);
	// Final fallback: streaming text_delta accumulator
	return streamedText;
}

export async function runAgent(
	piContext: PIContext,
	config: AgentConfig,
	authStorage?: AuthStorage,
	modelRegistry?: ModelRegistry,
): Promise<AgentResult> {
	const prompt = buildPrompt(
		piContext,
		config.promptTemplate,
		config.branchMode,
		config.cwd,
		config.templateName,
	);

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

	// Collect response text from streaming text_delta events
	let streamedText = "";
	let streamedDeltaCount = 0;
	let session: Session | undefined;

	// Set up logging — debug channel is only active when config.debug is true
	// biome-ignore lint/suspicious/noEmptyBlockStatements: noop logger
	const log = config.logger ?? { info: () => {} };
	const debug = config.debug
		? (log.debug?.bind(log.debug) ?? log.info.bind(log))
		: () => {};

	debug(
		`runAgent: provider=${config.provider}, model=${config.model}, timeout=${config.timeout}s`,
	);
	debug(`runAgent: prompt length=${prompt.length} chars`);
	debug(`runAgent: cwd=${config.cwd}`);

	try {
		const { session: createdSession } = await createAgentSession({
			cwd: config.cwd,
			model,
			thinkingLevel: "off",
			authStorage: auth,
			modelRegistry: models,
			tools: createCodingTools(config.cwd),
			customTools: config.customTools,
			sessionManager: SessionManager.create(config.cwd),
			settingsManager: SettingsManager.inMemory({
				compaction: { enabled: false },
				retry: { enabled: true, maxRetries: 2 },
			}),
		});

		session = createdSession;

		const eventHandler = createSessionEventHandler(log, (delta) => {
			streamedText += delta;
			streamedDeltaCount++;
		});

		createdSession.subscribe(eventHandler);

		debug("runAgent: starting session.prompt()");

		// Run with timeout
		await withTimeout(
			createdSession.prompt(prompt),
			config.timeout * 1000,
			`Timeout after ${config.timeout} seconds`,
		);

		debug(
			`runAgent: session.prompt() resolved, messages=${createdSession.messages.length}, streamedDeltas=${streamedDeltaCount}, streamedText=${streamedText.length} chars`,
		);

		// Log message details in debug mode
		if (config.debug) {
			for (let i = 0; i < createdSession.messages.length; i++) {
				const msg = createdSession.messages[i] as {
					role?: string;
					content?: unknown;
				};
				const contentPreview =
					typeof msg.content === "string"
						? msg.content.slice(0, 80)
						: Array.isArray(msg.content)
							? `[${msg.content.length} blocks, first: ${(msg.content[0] as { type?: string })?.type ?? "unknown"}]`
							: String(msg.content).slice(0, 80);
				debug(
					`  message[${i}]: role=${msg.role ?? "unknown"}, content=${contentPreview}`,
				);
			}
		}

		debug(
			`runAgent: getLastAssistantText() = ${JSON.stringify(createdSession.getLastAssistantText()?.slice(0, 100) ?? undefined)}`,
		);

		// Wait for the SDK's internal event queue to finalize messages,
		// then read the response. Falls back to streaming accumulator.
		const response = await resolveResponse(createdSession, streamedText, debug);
		const trimmedResponse = response.trim();

		debug(
			`runAgent: final response length=${trimmedResponse.length} chars, source=${createdSession.getLastAssistantText() ? "session" : streamedText ? "streaming" : "none"}`,
		);

		if (!trimmedResponse) {
			log.info(
				`⚠️ Empty response (sessionText=${JSON.stringify(createdSession.getLastAssistantText()?.slice(0, 50))}, streamedDeltas=${streamedDeltaCount}, streamedText=${streamedText.length} chars, messages=${createdSession.messages.length})`,
			);
			return {
				success: false,
				error: "Agent returned empty response",
				session,
			};
		}

		return { success: true, response: trimmedResponse, session };
	} catch (error) {
		debug(`runAgent: caught error: ${getErrorMessage(error)}`);
		return { success: false, error: getErrorMessage(error), session };
	}
}
