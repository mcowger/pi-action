/**
 * Response formatting utilities for consistent GitHub comment formatting
 */
export function formatSuccessComment(response) {
    return `### 🤖 pi Response\n\n${response}`;
}
export function formatErrorComment(error) {
    return `### ❌ pi Error\n\nFailed to process request: ${error}`;
}
