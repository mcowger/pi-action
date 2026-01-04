import type { GitHubClient } from "./github.js";
import type { TriggerInfo } from "./types.js";
/**
 * Creates a mock GitHub client with all required methods
 */
export declare function createMockGitHubClient(): GitHubClient;
/**
 * Creates a TriggerInfo object with sensible defaults and optional overrides
 */
export declare function createTriggerInfo(overrides?: Partial<TriggerInfo>): TriggerInfo;
