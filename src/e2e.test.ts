/**
 * End-to-end tests for pi-action.
 *
 * These tests exercise the full agent pipeline (SDK → LLM → response)
 * and require real credentials. They are skipped unless a `.env.e2e` file
 * is present in the project root with the required configuration.
 *
 * Setup:
 *   1. Copy `.env.e2e.example` to `.env.e2e`
 *   2. Fill in PI_AUTH_JSON and/or PI_MODELS_JSON
 *   3. Optionally set E2E_PROVIDER, E2E_MODEL
 *   4. Run: npx vitest run --config vitest.e2e.config.ts
 *
 * The tests isolate themselves from your real environment by:
 * - Setting PI_CODING_AGENT_DIR to a temp directory (never touches ~/.pi/agent/)
 * - Scrubbing all LLM API key env vars so the SDK only uses .env.e2e config
 * - Restoring everything in afterAll
 */
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAgent } from "./agent.js";
import type { PIContext } from "./context.js";
import { DEFAULTS } from "./defaults.js";

interface E2EConfig {
	piAuthJson: string;
	piModelsJson: string;
	provider: string;
	model: string;
}

/**
 * Parse a .env file where:
 * - Lines starting with # are comments
 * - KEY=VALUE pairs where VALUE is everything after the first =
 * - Values may contain = signs (e.g. JSON)
 * - Blank lines are ignored
 */
function parseEnvFile(filePath: string): Record<string, string> {
	const env: Record<string, string> = {};
	if (!existsSync(filePath)) return env;
	const content = readFileSync(filePath, "utf-8");
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIdx = trimmed.indexOf("=");
		if (eqIdx === -1) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		const value = trimmed.slice(eqIdx + 1).trim();
		env[key] = value;
	}
	return env;
}

function loadE2EConfig(): E2EConfig | null {
	const envPath = join(import.meta.dirname, "..", ".env.e2e");
	if (!existsSync(envPath)) return null;
	const env = parseEnvFile(envPath);

	// Need at least one of PI_AUTH_JSON or PI_MODELS_JSON to run
	if (!env.PI_AUTH_JSON && !env.PI_MODELS_JSON) return null;

	return {
		piAuthJson: env.PI_AUTH_JSON ?? "",
		piModelsJson: env.PI_MODELS_JSON ?? "",
		provider: env.E2E_PROVIDER || DEFAULTS.provider,
		model: env.E2E_MODEL || DEFAULTS.model,
	};
}

/**
 * Environment variables that the pi SDK reads for API keys.
 * We save and scrub these so the e2e test only uses config from .env.e2e.
 */
const SDK_ENV_VARS = [
	// Provider API keys (from pi-ai/env-api-keys.js)
	"OPENAI_API_KEY",
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_OAUTH_TOKEN",
	"AZURE_OPENAI_API_KEY",
	"GEMINI_API_KEY",
	"GOOGLE_CLOUD_API_KEY",
	"GOOGLE_CLOUD_PROJECT",
	"GCLOUD_PROJECT",
	"GOOGLE_CLOUD_LOCATION",
	"GOOGLE_APPLICATION_CREDENTIALS",
	"GROQ_API_KEY",
	"CEREBRAS_API_KEY",
	"XAI_API_KEY",
	"OPENROUTER_API_KEY",
	"AI_GATEWAY_API_KEY",
	"ZAI_API_KEY",
	"MISTRAL_API_KEY",
	"MINIMAX_API_KEY",
	"MINIMAX_CN_API_KEY",
	"HF_TOKEN",
	"OPENCODE_API_KEY",
	"KIMI_API_KEY",
	"COPILOT_GITHUB_TOKEN",
	"GH_TOKEN",
	"GITHUB_TOKEN",
	"AWS_PROFILE",
	"AWS_ACCESS_KEY_ID",
	"AWS_SECRET_ACCESS_KEY",
	"AWS_BEARER_TOKEN_BEDROCK",
	"AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
	"AWS_CONTAINER_CREDENTIALS_FULL_URI",
	"AWS_WEB_IDENTITY_TOKEN_FILE",
	// Common proxy/base URL overrides
	"OPENAI_BASE_URL",
	"ANTHROPIC_BASE_URL",
	"OPENROUTER_BASE_URL",
	// Custom env vars that may resolve as API keys
	"AIHOME_API_KEY",
	"AIHOME_API_BASE",
	"APERTIS_API_KEY",
	"APERTIS_SUB_API_KEY",
	"NAGA_API_KEY",
	// Pi SDK config dir
	"PI_CODING_AGENT_DIR",
];

function scrubSdkEnvVars(): Record<string, string | undefined> {
	const saved: Record<string, string | undefined> = {};
	for (const key of SDK_ENV_VARS) {
		saved[key] = process.env[key];
		delete process.env[key];
	}
	return saved;
}

function restoreSdkEnvVars(saved: Record<string, string | undefined>): void {
	for (const key of SDK_ENV_VARS) {
		if (saved[key] !== undefined) {
			process.env[key] = saved[key];
		} else {
			delete process.env[key];
		}
	}
}

const config = loadE2EConfig();
const skipE2E = !config;

describe.skipIf(skipE2E)("e2e: runAgent", () => {
	let e2eConfig: E2EConfig;
	let tmpDir: string;
	let savedEnv: Record<string, string | undefined>;

	beforeAll(() => {
		e2eConfig = config!;

		// Create an isolated temp directory for pi agent config
		tmpDir = mkdtempSync(join(import.meta.dirname, "..", ".e2e-tmp-"));
		console.log(`  E2E temp dir: ${tmpDir}`);
		console.log(`  E2E provider: ${e2eConfig.provider}`);
		console.log(`  E2E model: ${e2eConfig.model}`);

		// Scrub all SDK env vars so the test only uses .env.e2e config
		savedEnv = scrubSdkEnvVars();

		// Point the SDK at our temp dir
		process.env.PI_CODING_AGENT_DIR = tmpDir;

		// Write auth/models directly into the temp dir.
		// We can't use setupAuth/setupModels because those hardcode ~/.pi/agent/
		// and don't respect PI_CODING_AGENT_DIR.
		mkdirSync(tmpDir, { recursive: true });
		if (e2eConfig.piAuthJson) {
			writeFileSync(join(tmpDir, "auth.json"), e2eConfig.piAuthJson);
		}
		if (e2eConfig.piModelsJson) {
			writeFileSync(join(tmpDir, "models.json"), e2eConfig.piModelsJson);
		}
	});

	afterAll(() => {
		// Restore all env vars
		restoreSdkEnvVars(savedEnv);

		// Clean up temp dir
		try {
			rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// Best effort
		}
	});

	it("captures a long streaming response from a direct prompt", async () => {
		// Deliberately request a multi-paragraph response to exercise
		// the full streaming pipeline (text_delta events → response capture)
		const context: PIContext = {
			type: "direct",
			title: "",
			body: "",
			number: 0,
			triggerComment:
				"Write a short essay (3-4 paragraphs) about why automated testing is important for software development. Include specific examples. Do NOT use any tools - just respond with text.",
			task: "Write a short essay (3-4 paragraphs) about why automated testing is important for software development. Include specific examples. Do NOT use any tools - just respond with text.",
		};

		const logMessages: string[] = [];
		const result = await runAgent(context, {
			provider: e2eConfig.provider,
			model: e2eConfig.model,
			timeout: 120,
			cwd: join(import.meta.dirname, ".."),
			logger: { info: (msg: string) => logMessages.push(msg) },
		});

		console.log("  Agent log:");
		for (const msg of logMessages) {
			console.log(`    ${msg}`);
		}

		if (!result.success) {
			console.log(`  Error: ${result.error}`);
		} else {
			console.log(`  Response length: ${result.response.length}`);
			console.log(`  Response (first 300 chars): ${result.response.slice(0, 300)}`);
			console.log(`  Response (last 100 chars): ...${result.response.slice(-100)}`);
		}

		expect(result.success).toBe(true);
		if (result.success) {
			// A 3-4 paragraph essay must be at least 200 characters
			expect(result.response.length).toBeGreaterThan(200);
			const wordCount = result.response.split(/\s+/).filter((w: string) => w.length > 0).length;
			expect(wordCount).toBeGreaterThan(50);
		}
	}, 180_000);

	it("captures a long streaming response from an issue-style prompt", async () => {
		// Use type: "direct" to prevent the agent from trying to commit/push.
		// The prompt simulates an issue analysis task that requires
		// a detailed multi-paragraph response with no tool usage.
		const context: PIContext = {
			type: "direct",
			title: "",
			body: "",
			number: 0,
			triggerComment: `Analyze this API gateway performance issue and provide a detailed investigation plan with at least 5 specific debugging steps. Do NOT use any tools - just respond with text.

Symptoms:
- P99 latency increased from 200ms to 2.5s
- Intermittent 503 errors during peak hours (2-4 PM EST)
- Memory usage on gateway pods has doubled
- Connection pool exhaustion alerts firing every 30 minutes

Environment:
- Kubernetes 1.29 with 6 gateway replicas
- Each pod: 4 CPU, 8GB RAM
- Handling ~10k requests/second at peak`,
			task: `Analyze this API gateway performance issue and provide a detailed investigation plan with at least 5 specific debugging steps. Do NOT use any tools - just respond with text.

Symptoms:
- P99 latency increased from 200ms to 2.5s
- Intermittent 503 errors during peak hours (2-4 PM EST)
- Memory usage on gateway pods has doubled
- Connection pool exhaustion alerts firing every 30 minutes

Environment:
- Kubernetes 1.29 with 6 gateway replicas
- Each pod: 4 CPU, 8GB RAM
- Handling ~10k requests/second at peak`,
		};

		const logMessages: string[] = [];
		const result = await runAgent(context, {
			provider: e2eConfig.provider,
			model: e2eConfig.model,
			timeout: 120,
			cwd: join(import.meta.dirname, ".."),
			logger: { info: (msg: string) => logMessages.push(msg) },
		});

		console.log("  Agent log:");
		for (const msg of logMessages) {
			console.log(`    ${msg}`);
		}

		if (!result.success) {
			console.log(`  Error: ${result.error}`);
		} else {
			console.log(`  Response length: ${result.response.length}`);
			console.log(`  Response (first 300 chars): ${result.response.slice(0, 300)}`);
			console.log(`  Response (last 100 chars): ...${result.response.slice(-100)}`);
		}

		expect(result.success).toBe(true);
		if (result.success) {
			// A detailed investigation plan with 5+ steps must be at least 300 characters
			expect(result.response.length).toBeGreaterThan(300);
			const wordCount = result.response.split(/\s+/).filter((w: string) => w.length > 0).length;
			expect(wordCount).toBeGreaterThan(75);
		}
	}, 180_000);

	it("returns error for an invalid model", async () => {
		const context: PIContext = {
			type: "direct",
			title: "",
			body: "",
			number: 0,
			triggerComment: "Hello",
			task: "Hello",
		};

		const result = await runAgent(context, {
			provider: "nonexistent-provider",
			model: "nonexistent-model",
			timeout: 30,
			cwd: join(import.meta.dirname, ".."),
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain("Model not found");
		}
	}, 60_000);
});

describe("e2e: config detection", () => {
	it("correctly detects whether .env.e2e is present and valid", () => {
		if (skipE2E) {
			expect(skipE2E).toBe(true);
		} else {
			expect(config!.piAuthJson || config!.piModelsJson).toBeTruthy();
		}
	});
});
