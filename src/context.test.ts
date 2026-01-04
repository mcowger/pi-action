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
	it("builds issue prompt", () => {
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

	it("builds PR prompt with diff", () => {
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
});
