import * as core from "@actions/core";
import * as github from "@actions/github";
import { DEFAULTS } from "./defaults.js";
import { createGitHubClient } from "./github.js";
import { run } from "./run.js";
import { getErrorMessage } from "./utils.js";

function getInputOrDefault(name: string, defaultValue: string): string {
	const value = core.getInput(name);
	return value || defaultValue;
}

	const isDebug = getInputOrDefault("debug", "false").toLowerCase() === "true";

run({
	inputs: {
		triggerPhrase: getInputOrDefault("trigger_phrase", DEFAULTS.triggerPhrase),
		allowedBots: (core.getInput("allowed_bots") || "")
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean),
		modelConfig: {
			timeout: Number.parseInt(
				getInputOrDefault("timeout", String(DEFAULTS.timeout)),
				10,
			),
			provider: getInputOrDefault("provider", DEFAULTS.provider),
			model: getInputOrDefault("model", DEFAULTS.model),
			debug: getInputOrDefault("debug", "false").toLowerCase() === "true",
		},
		githubToken: core.getInput("github_token") || process.env.GITHUB_TOKEN,
		gistToken: core.getInput("gist_token") || undefined,
		piAuthJson: core.getInput("pi_auth_json"),
		piModelsJson: core.getInput("pi_models_json"),
		promptTemplate: core.getInput("prompt_template"),
		promptTemplateFile: core.getInput("prompt_template_file"),
		shareSession:
			getInputOrDefault("share_session", "true").toLowerCase() === "true",
		outputMode: (getInputOrDefault("output_mode", "comment") === "output"
			? "output"
			: "comment") as "comment" | "output",
		prompt: core.getInput("prompt") || undefined,
		prNumber: core.getInput("pr_number") ? Number.parseInt(core.getInput("pr_number"), 10) : undefined,
		branchMode: (getInputOrDefault("branch_mode", "branch") === "direct"
			? "direct"
			: "branch") as "branch" | "direct",
	},
	context: {
		payload: github.context.payload,
		repo: {
			owner: github.context.repo.owner,
			name: github.context.repo.repo,
		},
	},
	createClient: (token: string) =>
		createGitHubClient(github.getOctokit(token), {
			repo: {
				owner: github.context.repo.owner,
				name: github.context.repo.repo,
			},
			cwd: process.cwd(),
		}),
	log: {
		info: core.info,
		warning: core.warning,
		error: core.error,
		setFailed: core.setFailed,
		setOutput: core.setOutput,
		debug: isDebug ? core.info : undefined,
	},
	cwd: process.cwd(),
}).catch((error) => {
	core.setFailed(getErrorMessage(error));
});
