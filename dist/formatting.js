/**
 * Response formatting utilities for consistent GitHub comment formatting
 */
export function formatSuccessComment(response, shareUrl) {
    let comment = `### 🤖 pi Response\n\n${response}`;
    if (shareUrl) {
        comment += `\n\n---\n📎 [View full session](${shareUrl})`;
    }
    return comment;
}
export function formatErrorComment(error, shareUrl) {
    let comment = `### ❌ pi Error\n\nFailed to process request: ${error}`;
    if (shareUrl) {
        comment += `\n\n---\n📎 [View full session](${shareUrl})`;
    }
    return comment;
}
