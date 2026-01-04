import type { GitHubClient } from "./github.js";
import type { Session } from "./types.js";
export interface ShareResult {
    gistUrl: string;
    previewUrl: string;
}
/**
 * Share a session as an HTML gist and return the preview URL.
 * The session is exported to HTML, uploaded as a secret gist, and a preview URL is returned.
 *
 * @param session The agent session to share
 * @param githubClient The GitHub client for gist creation
 * @param description Optional description for the gist
 * @returns ShareResult with URLs, or null if sharing fails
 */
export declare function shareSession(session: Session, githubClient: GitHubClient, description?: string): Promise<ShareResult | null>;
