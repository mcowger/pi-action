/**
 * Safely extracts error message from unknown error value
 */
export function getErrorMessage(error) {
    return error instanceof Error ? error.message : "Unknown error";
}
