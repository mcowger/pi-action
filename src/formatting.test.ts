import { describe, expect, it } from "vitest";
import { formatErrorComment, formatSuccessComment } from "./formatting.js";

describe("formatSuccessComment", () => {
	it("formats response with pi emoji header", () => {
		const result = formatSuccessComment("Here is the answer");
		expect(result).toBe("### 🤖 pi Response\n\nHere is the answer");
	});

	it("formats response with session link", () => {
		const result = formatSuccessComment(
			"Here is the answer",
			"https://shittycodingagent.ai/session?abc123",
		);
		expect(result).toBe(
			"### 🤖 pi Response\n\nHere is the answer\n\n---\n📎 [View full session](https://shittycodingagent.ai/session?abc123)",
		);
	});

	it("handles multiline responses", () => {
		const result = formatSuccessComment("Line 1\nLine 2\nLine 3");
		expect(result).toBe("### 🤖 pi Response\n\nLine 1\nLine 2\nLine 3");
	});

	it("handles empty response", () => {
		const result = formatSuccessComment("");
		expect(result).toBe("### 🤖 pi Response\n\n");
	});
});

describe("formatErrorComment", () => {
	it("formats error with error emoji header", () => {
		const result = formatErrorComment("Something went wrong");
		expect(result).toBe(
			"### ❌ pi Error\n\nFailed to process request: Something went wrong",
		);
	});

	it("formats error with session link", () => {
		const result = formatErrorComment(
			"Something went wrong",
			"https://shittycodingagent.ai/session?def456",
		);
		expect(result).toBe(
			"### ❌ pi Error\n\nFailed to process request: Something went wrong\n\n---\n📎 [View full session](https://shittycodingagent.ai/session?def456)",
		);
	});

	it("handles multiline errors", () => {
		const result = formatErrorComment("Error line 1\nError line 2");
		expect(result).toBe(
			"### ❌ pi Error\n\nFailed to process request: Error line 1\nError line 2",
		);
	});

	it("handles empty error", () => {
		const result = formatErrorComment("");
		expect(result).toBe("### ❌ pi Error\n\nFailed to process request: ");
	});
});
