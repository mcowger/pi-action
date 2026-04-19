import { readFileSync } from "node:fs";

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
}

const DEFAULT_MAIN_PROMPT_TEMPLATE = `# GitHub {{type_display}} #{{number}}

## Title
{{title}}

## Description
{{body}}

## Task
{{task}}

## Important: Environment Setup (DO NOT reconfigure)

The git repository is already initialized and configured for you:
- \`git init\` has already been run
- \`git config user.name\` and \`git config user.email\` are already set
- You are already on a feature branch (NOT the default branch)

**Do NOT run \`git init\`, \`git config\`, or \`git checkout\` to the default branch.** Start working on the task immediately.

## Important: Artifact and Script Requirements

**CRITICAL:** After the GitHub Action finishes running, all files modified or created are lost, and the GitHub Action runner is destroyed. Therefore:

1. **All generated code and artifacts MUST be committed** - Any files you create, modify, or generate must be committed and pushed to the repository before the action completes. Nothing will persist otherwise.

2. **Any throw-away scripts generated MUST be run immediately** - If you create temporary scripts (like \`/tmp/create-issues.sh\` or similar), you must execute them during the same session. They will be lost when the runner terminates.

3. **Commit and push all work** - Always end your work by committing and pushing changes to ensure they persist beyond the GitHub Action execution.

**NEVER push directly to the main/default branch.** You are working on a dedicated branch (already checked out). After committing and pushing your changes, use the \`create_pull_request\` tool to open a pull request. Do NOT use \`gh pr create\` or any other shell command.

If this task is related to an issue, reference it in the PR body (e.g., "Fixes #123").

Do NOT merge the PR yourself — let the reviewer handle that.

## Important: Final Response Requirement

**You MUST end your response with a plain-text summary of what you did.** This summary is posted as a comment on the issue/PR, so it must be informative and stand alone without any tool output context. Do NOT assume the reader can see tool execution logs.

Your summary should include:
- What changes were made and why
- Which files were modified/created/deleted
- The pull request URL (if one was created)
- Any follow-up actions the reviewer should take

If you completed the task successfully, say so clearly. If you were unable to complete the task, explain what went wrong and what was attempted.

**CRITICAL -- DO NOT END WITH ONLY A TOOL CALL:**
If your last action is calling a tool (like \`create_pull_request\`), you MUST immediately follow it with a written summary in plain text. Send additional text AFTER the tool call completes.
- INCORRECT: Tool call → stop
- CORRECT: Tool call → text summary explaining what happened
`;

const PR_DIFF_TEMPLATE = `
## PR Diff
\`\`\`diff
{{diff}}
\`\`\`

## PR Review Guidelines
When reviewing this PR, you can provide inline comments on specific lines by including a \`\`\`pr-review code block in your response:

\`\`\`pr-review
[
  { "path": "src/file.ts", "line": 10, "body": "Consider using const here" },
  { "path": "src/other.ts", "line": 25, "start_line": 20, "body": "This block could be simplified" }
]
\`\`\`

Each comment requires:
- \`path\`: File path relative to repository root
- \`line\`: End line number (1-indexed)
- \`body\`: Comment text in Markdown

Optional fields:
- \`side\`: "LEFT" (old code) or "RIGHT" (new code, default)
- \`start_line\`: Start line for multi-line comments
- \`start_side\`: Side for start_line (defaults to \`side\`)
`;

export function renderTemplate(template: string, context: PIContext): string {
	const variables: Record<string, string> = {
		type: context.type,
		type_display: context.type === "pull_request" ? "Pull Request" : "Issue",
		number: context.number.toString(),
		title: context.title,
		body: context.body,
		task: context.task,
		diff: context.diff || "",
		trigger_comment: context.triggerComment,
	};

	let rendered = template;
	for (const [key, value] of Object.entries(variables)) {
		const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "g");
		rendered = rendered.replace(placeholder, value);
	}

	return rendered;
}

function loadTemplate(customTemplate?: string): string {
	// If inline template provided, use it
	if (customTemplate?.trim()) {
		return customTemplate;
	}

	// Check for file-based template
	const templateFile = process.env.INPUT_PROMPT_TEMPLATE_FILE;
	if (templateFile) {
		try {
			return readFileSync(templateFile, "utf-8");
		} catch (error) {
			console.warn(`Failed to load prompt template from ${templateFile}: ${error}. Using default.`);
		}
	}

	return DEFAULT_MAIN_PROMPT_TEMPLATE;
}

export function buildPrompt(
	context: PIContext,
	customTemplate?: string,
	branchMode?: "branch" | "direct",
): string {
	// For direct mode, the task IS the prompt
	if (context.type === "direct") {
		return context.task;
	}

	// Load template (from file, inline, or default)
	const template = loadTemplate(customTemplate);
	let prompt = renderTemplate(template, context);

	// Add branch mode instructions if running in direct push mode
	if (branchMode === "direct") {
		prompt += `

## Branch Mode: Direct Push
You are in "direct" branch mode. Commit and push your changes directly to the current branch. Do NOT create a pull request.
`;
	}

	// Add PR diff section if available
	if (context.diff) {
		prompt += renderTemplate(PR_DIFF_TEMPLATE, context);
	}

	return prompt;
}
