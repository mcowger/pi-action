import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export interface ToolPrompt {
	description: string;
	promptSnippet: string;
	promptGuidelines: string[];
}

export interface PromptContext {
	type: string;
	type_display: string;
	number: string;
	title: string;
	body: string;
	task: string;
	trigger_comment?: string;
	diff?: string;
	reviewComments?: string;
	isBranchMode: boolean;
}

// Allow tests to override the prompts directory
let promptsDirOverride: string | null = null;

export function setPromptsDirOverride(dir: string | null): void {
	promptsDirOverride = dir;
}

/**
 * Get the prompts directory path.
 * Tries multiple locations to find the prompts directory.
 */
function getPromptsDir(): string {
	// Check for test override first
	if (promptsDirOverride) {
		return promptsDirOverride;
	}

	const paths = [
		join(__dirname, "..", "prompts"),
		join(__dirname, "..", "..", "prompts"),
		join(process.cwd(), "prompts"),
	];

	for (const path of paths) {
		if (existsSync(path)) {
			return path;
		}
	}

	throw new Error(
		`Could not find prompts directory. Tried: ${paths.join(", ")}`,
	);
}

/**
 * Register all partial templates from the partials directory.
 */
function registerPartials(promptsDir: string): void {
	const partialsDir = join(promptsDir, "partials");

	try {
		const files = readdirSync(partialsDir);
		for (const file of files) {
			if (file.endsWith(".hbs")) {
				const name = file.replace(".hbs", "");
				const content = readFileSync(join(partialsDir, file), "utf-8");
				Handlebars.registerPartial(name, content);
			}
		}
	} catch (_error) {}
}

/** Built-in template names that ship with pi-action. */
export type BuiltinTemplate = "main" | "pr-review" | "release-notes";

/**
 * Build a prompt template string by name (registers partials and returns template content).
 */
export function buildPromptTemplate(
	_branchMode: "branch" | "direct" = "branch",
	templateName: BuiltinTemplate = "main",
): string {
	const promptsDir = getPromptsDir();
	registerPartials(promptsDir);
	return readFileSync(join(promptsDir, `${templateName}.hbs`), "utf-8");
}

/**
 * Build the PR diff template string.
 */
export function buildPrDiffTemplate(): string {
	const promptsDir = getPromptsDir();
	return readFileSync(join(promptsDir, "partials", "pr-diff.hbs"), "utf-8");
}

/**
 * Parse a tool prompt markdown file into structured data.
 */
export function parseToolPrompt(content: string): ToolPrompt {
	const lines = content.split("\n");

	let description = "";
	let promptSnippet = "";
	const promptGuidelines: string[] = [];

	let currentSection: "description" | "usage" | "guidelines" | null =
		"description";
	const descriptionLines: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();

		if (trimmed.startsWith("# ")) {
			continue;
		}

		if (trimmed.toLowerCase().startsWith("## ")) {
			const sectionName = trimmed.slice(3).trim().toLowerCase();
			if (sectionName === "description") {
				currentSection = "description";
			} else if (sectionName === "usage") {
				currentSection = "usage";
			} else if (sectionName === "guidelines") {
				currentSection = "guidelines";
			}
			continue;
		}

		if (currentSection === "description" && trimmed) {
			descriptionLines.push(line);
		}

		if (currentSection === "usage" && trimmed) {
			if (!promptSnippet) {
				promptSnippet = trimmed;
			}
		}

		if (currentSection === "guidelines" && trimmed.startsWith("- ")) {
			promptGuidelines.push(trimmed.slice(2).trim());
		}
	}

	description = descriptionLines.join(" ").trim();

	return { description, promptSnippet, promptGuidelines };
}

/**
 * Load a tool prompt from file.
 */
export function loadToolPrompt(toolName: string): ToolPrompt {
	const promptsDir = getPromptsDir();
	const content = readFileSync(
		join(promptsDir, "tools", `${toolName}.md`),
		"utf-8",
	);
	return parseToolPrompt(content);
}
