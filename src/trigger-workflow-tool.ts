/**
 * Custom `trigger_workflow_dispatch` tool for the pi agent.
 *
 * Allows the agent to trigger a workflow_dispatch event on GitHub Actions,
 * enabling downstream workflows to run on bot-created PRs (which would otherwise
 * not trigger workflows due to GITHUB_TOKEN limitations).
 */

import {
	type AgentToolResult,
	defineTool,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { loadToolPrompt } from "./templates.js";

/**
 * Details returned by the trigger_workflow_dispatch tool.
 */
export interface TriggerWorkflowToolDetails {
	workflowFile: string;
	ref: string;
	dispatchUrl: string;
}

/**
 * Parameters schema for the trigger_workflow_dispatch tool.
 */
const triggerWorkflowPrompt = loadToolPrompt("trigger-workflow-dispatch");

const triggerWorkflowSchema = Type.Object({
	workflowFile: Type.String({
		description:
			"The workflow file to trigger (e.g., 'ci.yml', '.github/workflows/test.yml'). If no path is specified, assumes .github/workflows/",
	}),
	ref: Type.Optional(
		Type.String({
			description:
				"The git ref (branch, tag, or SHA) to run the workflow on. Defaults to the current branch.",
		}),
	),
	inputs: Type.Optional(
		Type.Record(Type.String(), Type.String(), {
			description:
				"Optional inputs to pass to the workflow_dispatch event. Must be key-value pairs with string values.",
		}),
	),
});

/**
 * GitHub client interface - only the methods this tool needs.
 */
interface WorkflowGitHubClient {
	triggerWorkflowDispatch(params: {
		owner: string;
		repo: string;
		workflowId: string;
		ref: string;
		inputs?: Record<string, string>;
	}): Promise<void>;
	getCurrentBranch(): Promise<string>;
}

/**
 * Callback invoked when a workflow is successfully triggered.
 */
export type OnWorkflowTriggered = (details: {
	workflowFile: string;
	ref: string;
	inputs?: Record<string, string>;
}) => void;

/**
 * Options for creating the trigger workflow tool.
 */
export interface TriggerWorkflowToolOptions {
	client: WorkflowGitHubClient;
	owner: string;
	repo: string;
	onWorkflowTriggered?: OnWorkflowTriggered;
}

/**
 * Create the `trigger_workflow_dispatch` tool bound to a GitHubClient.
 *
 * @param options - Tool options including client, owner, repo, and optional callback.
 */
export function triggerWorkflowDispatchTool(
	options: TriggerWorkflowToolOptions,
) {
	const { client, owner, repo, onWorkflowTriggered } = options;

	return defineTool({
		name: "trigger_workflow_dispatch",
		label: "Trigger Workflow Dispatch",
		description: triggerWorkflowPrompt.description,
		promptSnippet: triggerWorkflowPrompt.promptSnippet,
		promptGuidelines: triggerWorkflowPrompt.promptGuidelines,
		parameters: triggerWorkflowSchema,
		async execute(
			_toolCallId: string,
			params: {
				workflowFile: string;
				ref?: string;
				inputs?: Record<string, string>;
			},
			_signal?: AbortSignal,
		): Promise<AgentToolResult<TriggerWorkflowToolDetails>> {
			// Determine the ref (default to current branch)
			let ref: string;
			try {
				ref = params.ref ?? (await client.getCurrentBranch());
			} catch (error) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: Failed to determine current git branch: ${error instanceof Error ? error.message : String(error)}. You can specify the 'ref' parameter explicitly.`,
						},
					],
					details: {
						workflowFile: params.workflowFile,
						ref: params.ref ?? "",
						dispatchUrl: "",
					},
				};
			}

			// Normalize workflow file path
			let workflowId = params.workflowFile;
			if (!workflowId.includes("/")) {
				workflowId = `.github/workflows/${workflowId}`;
			}

			// Trigger the workflow dispatch
			try {
				await client.triggerWorkflowDispatch({
					owner,
					repo,
					workflowId,
					ref,
					inputs: params.inputs,
				});
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: Failed to trigger workflow dispatch: ${msg}\n\nWorkflow: ${workflowId}\nRef: ${ref}\nInputs: ${params.inputs ? JSON.stringify(params.inputs) : "none"}`,
						},
					],
					details: {
						workflowFile: params.workflowFile,
						ref,
						dispatchUrl: "",
					},
				};
			}

			// Notify callback if provided
			if (onWorkflowTriggered) {
				onWorkflowTriggered({
					workflowFile: params.workflowFile,
					ref,
					inputs: params.inputs,
				});
			}

			const dispatchUrl = `https://github.com/${owner}/${repo}/actions/workflows/${workflowId.replace(".github/workflows/", "")}`;
			const successMsg =
				`Workflow dispatch triggered successfully!\n\n` +
				`Workflow: ${workflowId}\n` +
				`Ref: ${ref}\n` +
				(params.inputs
					? `Inputs: ${JSON.stringify(params.inputs, null, 2)}\n`
					: "") +
				`\nView workflows: ${dispatchUrl}`;

			return {
				content: [{ type: "text" as const, text: successMsg }],
				details: {
					workflowFile: params.workflowFile,
					ref,
					dispatchUrl: dispatchUrl,
				},
			};
		},
	});
}
