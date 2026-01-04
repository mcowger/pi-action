export function hasTrigger(text: string, trigger: string): boolean {
	return text.toLowerCase().includes(trigger.toLowerCase());
}

export function extractTask(comment: string, trigger: string): string {
	const idx = comment.toLowerCase().indexOf(trigger.toLowerCase());
	if (idx === -1) return comment;
	return comment.slice(idx + trigger.length).trim();
}

export interface PIContext {
	type: "issue" | "pull_request";
	title: string;
	body: string;
	number: number;
	triggerComment: string;
	task: string;
	diff?: string;
}

export function buildPrompt(context: PIContext): string {
	let prompt = `# GitHub ${context.type === "pull_request" ? "Pull Request" : "Issue"} #${context.number}

## Title
${context.title}

## Description
${context.body}

## Task
${context.task}

## Important: Artifact and Script Requirements

**CRITICAL:** After the GitHub Action finishes running, all files modified or created are lost, and the GitHub Action runner is destroyed. Therefore:

1. **All generated code and artifacts MUST be committed** - Any files you create, modify, or generate must be committed and pushed to the repository before the action completes. Nothing will persist otherwise.

2. **Any throw-away scripts generated MUST be run immediately** - If you create temporary scripts (like \`/tmp/create-issues.sh\` or similar), you must execute them during the same session. They will be lost when the runner terminates.

3. **Commit and push all work** - Always end your work by committing and pushing changes to ensure they persist beyond the GitHub Action execution.
`;

	if (context.diff) {
		prompt += `\n## PR Diff\n\`\`\`diff\n${context.diff}\n\`\`\`\n`;
	}

	return prompt;
}
