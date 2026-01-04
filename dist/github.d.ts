import type { GitHub } from "@actions/github/lib/utils";
export interface GitHubContext {
    repo: {
        owner: string;
        repo: string;
    };
}
export interface TriggerInfo {
    isCommentEvent: boolean;
    triggerText: string;
    author: {
        login: string;
        type: string;
    };
    authorAssociation: string;
    issueNumber: number;
    issueTitle: string;
    issueBody: string;
    commentId?: number;
    isPullRequest: boolean;
}
export declare function extractTriggerInfo(payload: Record<string, unknown>): TriggerInfo | null;
export interface GitHubClient {
    addReactionToComment(commentId: number, reaction: string): Promise<void>;
    addReactionToIssue(issueNumber: number, reaction: string): Promise<void>;
    createComment(issueNumber: number, body: string): Promise<void>;
    getPullRequestDiff(pullNumber: number): Promise<string>;
}
export declare function createGitHubClient(octokit: InstanceType<typeof GitHub>, context: GitHubContext): GitHubClient;
export declare function addReaction(client: GitHubClient, triggerInfo: TriggerInfo, reaction: string): Promise<void>;
