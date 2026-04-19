/**
 * End-to-end tests for pi-action.
 *
 * These tests exercise the full agent pipeline (SDK → LLM → response)
 * and require real credentials. They are skipped unless a `.env.e2e` file
 * is present in the project root with the required configuration.
 *
 * Setup:
 *   1. Copy `.env.e2e.example` to `.env.e2e`
 *   2. Fill in PI_AUTH_JSON (contents of ~/.pi/agent/auth.json)
 *   3. Optionally set PI_MODELS_JSON, E2E_PROVIDER, E2E_MODEL
 *   4. Run: npx vitest run --config vitest.e2e.config.ts
 *
 * The tests set PI_CODING_AGENT_DIR to a temp directory so your real
 * ~/.pi/agent/ is never modified.
 */
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { runAgent } from "./agent.js";
import type { PIContext } from "./context.js";
import { DEFAULTS } from "./defaults.js";
import { setupAuth, setupModels } from "./run.js";

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
		// Everything after the first = is the value (may contain = for JSON)
		const value = trimmed.slice(eqIdx + 1).trim();
		env[key] = value;
	}
	return env;
}

function loadE2EConfig(): E2EConfig | null {
	const envPath = join(import.meta.dirname, "..", ".env.e2e");
	const env = parseEnvFile(envPath);

	if (!env.PI_AUTH_JSON) return null;

	return {
		piAuthJson: env.PI_AUTH_JSON,
		piModelsJson: env.PI_MODELS_JSON ?? "",
		provider: env.E2E_PROVIDER || DEFAULTS.provider,
		model: env.E2E_MODEL || DEFAULTS.model,
	};
}

const config = loadE2EConfig();
const skipE2E = !config;

describe.skipIf(skipE2E)("e2e: runAgent", () => {
	let e2eConfig: E2EConfig;
	let tmpDir: string;
	let savedAgentDir: string | undefined;

	beforeAll(() => {
		e2eConfig = config!;

		// Create an isolated temp directory for pi agent config
		tmpDir = mkdtempSync(join(import.meta.dirname, "..", ".e2e-tmp-"));
		console.log(`  E2E temp dir: ${tmpDir}`);
		console.log(`  E2E provider: ${e2eConfig.provider}`);
		console.log(`  E2E model: ${e2eConfig.model}`);

		// Point the SDK at our temp dir instead of ~/.pi/agent/
		savedAgentDir = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = tmpDir;

		// Write auth/models into the temp dir (same as the action does)
		setupAuth(e2eConfig.piAuthJson || undefined);
		setupModels(e2eConfig.piModelsJson || undefined);
	});

	afterAll(() => {
		// Restore original env var
		if (savedAgentDir !== undefined) {
			process.env.PI_CODING_AGENT_DIR = savedAgentDir;
		} else {
			delete process.env.PI_CODING_AGENT_DIR;
		}

		// Clean up temp dir
		try {
			rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// Best effort
		}
	});

	it("returns a non-empty response for a simple prompt", async () => {
		const context: PIContext = {
			type: "direct",
			title: "",
			body: "",
			number: 0,
			triggerComment: "What is 2+2? Reply with just the number.",
			task: "What is 2+2? Reply with just the number.",
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
		}

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.response).toBeTruthy();
			expect(result.response.length).toBeGreaterThan(0);
			expect(result.response).toContain("4");
		}
	}, 180_000);

	it("returns a non-empty response for an issue-style prompt", async () => {
		const context: PIContext = {
			type: "issue",
			title: "Test Issue",
			body: "This is a test issue for e2e testing.",
			number: 1,
			triggerComment: "@pi Explain what this issue is about in one sentence.",
			task: "Explain what this issue is about in one sentence.",
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
		}

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.response).toBeTruthy();
			expect(result.response.toLowerCase()).toContain("test");
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
			expect(config!.piAuthJson).toBeTruthy();
		}
	});
});
