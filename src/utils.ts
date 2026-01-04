/**
 * Safely extracts error message from unknown error value
 */
export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Unknown error";
}
