import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GitHubClient } from "./github.js";
import type { Session } from "./types.js";

export interface ShareResult {
	gistUrl: string;
	previewUrl: string;
	logGistUrl?: string;
}

export interface SessionMetadata {
	date: string;
	time: string;
	gistId: string;
	previewUrl: string;
	prNumber?: number;
	prUrl?: string;
	result: "success" | "error";
	description: string;
}

const LOG_FILENAME = "pi-action-sessions.md";

interface GistData {
	files: Record<string, { content: string }>;
	description: string;
}

/**
 * Get or create the master log gist ID by searching for a gist with description "{repo}-session-log".
 * Creates a new private gist if one doesn't exist.
 */
async function getOrCreateLogGist(
	githubClient: GitHubClient,
	repo: string,
): Promise<string | null> {
	const expectedDescription = `${repo}-session-log`;

	// First try to find existing gist by description
	const existingId = await githubClient.findGistByDescription(expectedDescription);
	if (existingId) {
		return existingId;
	}

	// Create new private log gist with the expected description
	try {
		const initialContent = `# pi-action Session Log - ${repo}

This gist tracks pi-action agent sessions with links to full session logs.

<!-- SESSION_LOG_START -->
<!-- SESSION_LOG_END -->
`;
		const gistUrl = await githubClient.createGist(
			initialContent,
			LOG_FILENAME,
			expectedDescription,
			false, // private gist
		);

		// Extract gist ID
		const match = gistUrl.match(/github\.com\/[^/]+\/([a-f0-9]+)$/);
		if (match) {
			return match[1];
		}
		return null;
	} catch (error) {
		console.warn(`Failed to create log gist: ${error instanceof Error ? error.message : error}`);
		return null;
	}
}

/**
 * Append session metadata to the master log gist.
 */
async function updateSessionLog(
	githubClient: GitHubClient,
	logGistId: string,
	metadata: SessionMetadata,
): Promise<string | null> {
	try {
		// Get current log content
		const gist = await githubClient.getGist(logGistId);
		const currentContent = gist.files[LOG_FILENAME]?.content || "";

		// Parse date sections
		const today = metadata.date;
		const timeStr = metadata.time;

		// Format new entry
		const entry = `- ${timeStr} - [Session](${metadata.previewUrl})` +
			(metadata.prNumber ? ` - [PR #${metadata.prNumber}](${metadata.prUrl})` : "") +
			` - ${metadata.result === "success" ? "✅" : "❌"} - ${metadata.description}`;

		// Check if we already have a section for today
		const todayHeader = `\n## ${today}\n`;
		let newContent: string;

		if (currentContent.includes(todayHeader)) {
			// Add to existing today's section
			newContent = currentContent.replace(
				todayHeader,
				`${todayHeader}${entry}\n`,
			);
		} else {
			// Create new section for today (after the markers or at end)
			const markerEnd = "<!-- SESSION_LOG_END -->";
			if (currentContent.includes(markerEnd)) {
				newContent = currentContent.replace(
					markerEnd,
					`${todayHeader}${entry}\n\n${markerEnd}`,
				);
			} else {
				newContent = currentContent + todayHeader + entry + '\n';
			}
		}

		// Update the gist
		return await githubClient.updateGist(logGistId, LOG_FILENAME, newContent);
	} catch (error) {
		console.warn(`Failed to update session log: ${error instanceof Error ? error.message : error}`);
		return null;
	}
}

/**
 * Share a session as an HTML gist and update the master log.
 * The session is exported to HTML, uploaded as a secret gist,
 * the master log is updated with metadata, and a preview URL is returned.
 *
 * @param session The agent session to share
 * @param githubClient The GitHub client for gist operations
 * @param repo Optional repo name for the log gist description
 * @param metadata Optional session metadata (PR info, result, etc.)
 * @returns ShareResult with URLs, or null if sharing fails
 */
export async function shareSession(
	session: Session,
	githubClient: GitHubClient,
	repo?: string,
	metadata?: Partial<SessionMetadata>,
): Promise<ShareResult | null> {
	const tmpFile = join(tmpdir(), `pi-session-${Date.now()}.html`);

	try {
		// Export session to HTML
		await session.exportToHtml(tmpFile);

		// Read the HTML content
		const htmlContent = readFileSync(tmpFile, "utf-8");

		// Create secret gist for the session
		const description = metadata?.description || "pi-action session";
		const gistUrl = await githubClient.createGist(
			htmlContent,
			"session.html",
			description,
			false, // secret gist
		);

		// Extract gist ID from URL
		const gistIdMatch = gistUrl.match(/github\.com\/[^/]+\/([a-f0-9]+)$/);
		if (!gistIdMatch) {
			return null;
		}
		const gistId = gistIdMatch[1];

		// Build metadata
		const now = new Date();
		const sessionMeta: SessionMetadata = {
			date: now.toISOString().split("T")[0],
			time: now.toTimeString().slice(0, 5),
			gistId,
			previewUrl: `https://shittycodingagent.ai/session?${gistId}`,
			prNumber: metadata?.prNumber,
			prUrl: metadata?.prUrl,
			result: metadata?.result || "success",
			description,
		};

		// Get or create master log gist
		const logGistId = await getOrCreateLogGist(githubClient, repo || "unknown");
		let logGistUrl = "";

		if (logGistId) {
			logGistUrl = await updateSessionLog(githubClient, logGistId, sessionMeta) || "";
		}

		return {
			gistUrl,
			previewUrl: sessionMeta.previewUrl,
			logGistUrl,
		};
	} catch (error) {
		// biome-ignore lint/suspicious/noConsole: intentional warning log for non-fatal failure
		console.warn(`Failed to share session: ${error instanceof Error ? error.message : error}`);
		return null;
	} finally {
		// Clean up temp file
		try {
			unlinkSync(tmpFile);
		} catch {
			// Ignore cleanup errors
		}
	}
}
