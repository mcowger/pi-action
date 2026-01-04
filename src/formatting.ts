/**
 * Response formatting utilities for consistent GitHub comment formatting
 */

export function formatSuccessComment(response: string): string {
	return `### 🤖 pi Response\n\n${response}`;
}

export function formatErrorComment(error: string): string {
	return `### ❌ pi Error\n\nFailed to process request: ${error}`;
}
