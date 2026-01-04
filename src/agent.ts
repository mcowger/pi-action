import { execSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PIContext } from "./context.js";
import { buildPrompt } from "./context.js";

export interface AgentConfig {
	provider: string;
	model: string;
	timeout: number;
	cwd: string;
}

export interface AgentResult {
	success: boolean;
	response?: string;
	error?: string;
}

export function runAgent(
	piContext: PIContext,
	config: AgentConfig,
): AgentResult {
	const prompt = buildPrompt(piContext);

	// Write prompt to temp file
	const promptFile = join(tmpdir(), `pi-prompt-${Date.now()}.md`);
	writeFileSync(promptFile, prompt);

	try {
		const cmd = `pi --provider ${config.provider} --model ${config.model} -p @${promptFile}`;
		const response = execSync(cmd, {
			encoding: "utf-8",
			timeout: config.timeout * 1000,
			maxBuffer: 10 * 1024 * 1024,
			cwd: config.cwd,
		});

		return {
			success: true,
			response: response.trim(),
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	} finally {
		try {
			unlinkSync(promptFile);
		} catch {
			// Ignore cleanup errors
		}
	}
}
