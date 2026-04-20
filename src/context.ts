import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import Handlebars from "handlebars";
import type { PromptContext, BuiltinTemplate } from "./templates.js";
import {
	buildPrDiffTemplate,
	buildPromptTemplate,
	loadToolPrompt,
} from "./templates.js";

const BUILTIN_TEMPLATE_NAMES: readonly string[] = [
	"main",
	"pr-review",
	"release-notes",
];

export function hasTrigger(text: string, trigger: string): boolean {
	return text.toLowerCase().includes(trigger.toLowerCase());
}

export function extractTask(comment: string, trigger: string): string {
	const idx = comment.toLowerCase().indexOf(trigger.toLowerCase());
	if (idx === -1) {
		return comment;
	}
	return comment.slice(idx + trigger.length).trim();
}

export interface PIContext {
	type: "issue" | "pull_request" | "direct";
	title: string;
	body: string;
	number: number;
	triggerComment: string;
	task: string;
	diff?: string;
	reviewComments?: string;
}

/**
 * Convert PIContext to PromptContext for Handlebars templates.
 */
function toPromptContext(
	context: PIContext,
	branchMode?: "branch" | "direct",
): PromptContext {
	return {
		type: context.type,
		type_display: context.type === "pull_request" ? "Pull Request" : "Issue",
		number: context.number.toString(),
		title: context.title,
		body: context.body,
		task: context.task,
		trigger_comment: context.triggerComment,
		diff: context.diff,
		reviewComments: context.reviewComments,
		isBranchMode: branchMode !== "direct",
	};
}

/** Result of loading a custom or builtin template. */
export interface ResolvedTemplate {
	content: string;
	name: BuiltinTemplate;
}

function loadCustomTemplate(
	customTemplate?: string,
	cwd?: string,
): ResolvedTemplate | null {
	if (customTemplate?.trim()) {
		// Check if it's a builtin template name
		if (BUILTIN_TEMPLATE_NAMES.includes(customTemplate.trim())) {
			const name = customTemplate.trim() as BuiltinTemplate;
			return { content: buildPromptTemplate("branch", name), name };
		}
		return { content: customTemplate, name: "main" };
	}

	const templateFile = process.env.INPUT_PROMPT_TEMPLATE_FILE;
	if (templateFile) {
		const fullPath = isAbsolute(templateFile)
			? templateFile
			: join(cwd || process.cwd(), templateFile);
		return { content: readFileSync(fullPath, "utf-8"), name: "main" };
	}

	return null;
}

export function buildPrompt(
	context: PIContext,
	customTemplate?: string,
	branchMode?: "branch" | "direct",
	cwd?: string,
	templateName?: BuiltinTemplate,
): string {
	// Direct mode without custom template: just return the task
	if (
		context.type === "direct" &&
		!customTemplate?.trim() &&
		!process.env.INPUT_PROMPT_TEMPLATE_FILE
	) {
		return context.task;
	}

	// Try to load custom template first
	const userTemplate = loadCustomTemplate(customTemplate, cwd);

	// Determine which template to use
	const resolvedName = userTemplate?.name ?? templateName ?? "main";
	const templateContent =
		userTemplate?.content ?? buildPromptTemplate(branchMode ?? "branch", resolvedName);

	// Compile with Handlebars
	const template = Handlebars.compile(templateContent, { noEscape: true });

	// Build and render the context
	const promptContext = toPromptContext(context, branchMode);
	let prompt = template(promptContext);

	// Add PR diff section if available AND the template doesn't handle diff inline
	// (pr-review and release-notes templates have {{diff}} built-in; main.hbs does not)
	if (context.diff && resolvedName === "main") {
		const prDiffTemplate = Handlebars.compile(buildPrDiffTemplate(), {
			noEscape: true,
		});
		prompt += prDiffTemplate(promptContext);
	}

	return prompt;
}

export { loadToolPrompt };
