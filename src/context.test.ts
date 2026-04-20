import { describe, expect, it } from "vitest";
import { buildPrompt, extractTask, hasTrigger } from "./context.js";

describe("hasTrigger", () => {
	it("detects @pi at start", () => {
		expect(hasTrigger("@pi please help", "@pi")).toBe(true);
	});

	it("detects @pi in middle", () => {
		expect(hasTrigger("Hey @pi can you help?", "@pi")).toBe(true);
	});

	it("is case insensitive", () => {
		expect(hasTrigger("Hey @PI help me", "@pi")).toBe(true);
		expect(hasTrigger("Hey @Pi help me", "@pi")).toBe(true);
	});

	it("returns false when no trigger", () => {
		expect(hasTrigger("Hello world", "@pi")).toBe(false);
	});

	it("works with custom triggers", () => {
		expect(hasTrigger("Hey @assistant help", "@assistant")).toBe(true);
	});
});

describe("extractTask", () => {
	it("extracts text after trigger", () => {
		expect(extractTask("@pi please review this code", "@pi")).toBe(
			"please review this code",
		);
	});

	it("handles trigger at end", () => {
		expect(extractTask("Hey @pi", "@pi")).toBe("");
	});

	it("is case insensitive", () => {
		expect(extractTask("@PI do something", "@pi")).toBe("do something");
	});

	it("returns full text if no trigger", () => {
		expect(extractTask("no trigger here", "@pi")).toBe("no trigger here");
	});

	it("handles multiline", () => {
		expect(extractTask("@pi first line\nsecond line", "@pi")).toBe(
			"first line\nsecond line",
		);
	});
});

describe("buildPrompt", () => {
	it("builds default issue prompt when no template provided", () => {
		const prompt = buildPrompt({
			type: "issue",
			title: "Bug Report",
			body: "Something is broken",
			number: 42,
			triggerComment: "@pi help",
			task: "help",
		});

		expect(prompt).toContain("# GitHub Issue #42");
		expect(prompt).toContain("## Title\nBug Report");
		expect(prompt).toContain("## Description\nSomething is broken");
		expect(prompt).toContain("## Task\nhelp");
	});

	it("builds default PR prompt with diff", () => {
		const prompt = buildPrompt({
			type: "pull_request",
			title: "Add feature",
			body: "New feature",
			number: 99,
			triggerComment: "@pi review",
			task: "review",
			diff: "+ new line\n- old line",
		});

		expect(prompt).toContain("# GitHub Pull Request #99");
		expect(prompt).toContain("```diff\n+ new line\n- old line\n```");
	});

	it("uses custom template when provided", () => {
		const customTemplate = "Task: {{task}} for {{type_display}} #{{number}}";
		const prompt = buildPrompt(
			{
				type: "issue",
				title: "Bug Report",
				body: "Something is broken",
				number: 42,
				triggerComment: "@pi help",
				task: "help",
			},
			customTemplate,
		);

		expect(prompt).toBe("Task: help for Issue #42");
	});

	it("ignores empty custom template", () => {
		const prompt = buildPrompt(
			{
				type: "issue",
				title: "Bug Report",
				body: "Something is broken",
				number: 42,
				triggerComment: "@pi help",
				task: "help",
			},
			"",
		);

		expect(prompt).toContain("# GitHub Issue #42");
	});

	it("ignores whitespace-only custom template", () => {
		const prompt = buildPrompt(
			{
				type: "issue",
				title: "Bug Report",
				body: "Something is broken",
				number: 42,
				triggerComment: "@pi help",
				task: "help",
			},
			"   \n  ",
		);

		expect(prompt).toContain("# GitHub Issue #42");
	});

	it("includes PR creation instructions in branch mode", () => {
		const prompt = buildPrompt(
			{
				type: "issue",
				title: "Bug Report",
				body: "Something is broken",
				number: 42,
				triggerComment: "@pi help",
				task: "help",
			},
			undefined,
			"branch",
		);
		expect(prompt).toContain("create_pull_request");
		expect(prompt).toContain("NEVER push directly to the main/default branch");
	});

	it("includes direct push instructions in direct mode", () => {
		const prompt = buildPrompt(
			{
				type: "issue",
				title: "Bug Report",
				body: "Something is broken",
				number: 42,
				triggerComment: "@pi help",
				task: "help",
			},
			undefined,
			"direct",
		);
		expect(prompt).toContain("NEVER create a pull request.");
		expect(prompt).toContain("already an existing PR branch");
	});

	it("returns task only in direct mode without custom template", () => {
		const prompt = buildPrompt({
			type: "direct",
			title: "",
			body: "",
			number: 0,
			triggerComment: "Generate tests",
			task: "Generate tests",
		});

		expect(prompt).toBe("Generate tests");
	});

	it("handles Handlebars conditionals for review comments", () => {
		const contextWithoutComments = {
			type: "pull_request" as const,
			title: "PR Title",
			body: "PR Body",
			number: 42,
			triggerComment: "@pi review",
			task: "review",
		};

		const prompt = buildPrompt(contextWithoutComments);

		// Should NOT contain review comments section when no comments
		expect(prompt).not.toContain("PR Review Comments");
	});

	it("uses custom template with Handlebars in direct mode", () => {
		const customTemplate = "Custom: {{task}} - {{type}}";
		const prompt = buildPrompt(
			{
				type: "direct",
				title: "",
				body: "",
				number: 0,
				triggerComment: "Do something",
				task: "Do something",
			},
			customTemplate,
		);

		expect(prompt).toBe("Custom: Do something - direct");
	});
});
