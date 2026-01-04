"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTriggerInfo = extractTriggerInfo;
exports.createGitHubClient = createGitHubClient;
exports.addReaction = addReaction;
function extractTriggerInfo(payload) {
    const comment = payload.comment;
    const issue = (payload.issue || payload.pull_request);
    if (!issue) {
        return null;
    }
    const isCommentEvent = !!comment;
    const triggerText = isCommentEvent
        ? comment?.body
        : issue.body;
    const author = isCommentEvent
        ? comment?.user
        : issue.user;
    const authorAssociation = isCommentEvent
        ? comment?.author_association
        : issue.author_association;
    if (!triggerText || !author) {
        return null;
    }
    return {
        isCommentEvent,
        triggerText,
        author,
        authorAssociation,
        issueNumber: issue.number,
        issueTitle: issue.title,
        issueBody: issue.body || "",
        commentId: comment?.id,
        isPullRequest: !!payload.pull_request,
    };
}
function createGitHubClient(octokit, context) {
    return {
        async addReactionToComment(commentId, reaction) {
            await octokit.rest.reactions.createForIssueComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: commentId,
                content: reaction,
            });
        },
        async addReactionToIssue(issueNumber, reaction) {
            await octokit.rest.reactions.createForIssue({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: issueNumber,
                content: reaction,
            });
        },
        async createComment(issueNumber, body) {
            await octokit.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: issueNumber,
                body,
            });
        },
        async getPullRequestDiff(pullNumber) {
            const { data: diff } = await octokit.rest.pulls.get({
                owner: context.repo.owner,
                repo: context.repo.repo,
                pull_number: pullNumber,
                mediaType: { format: "diff" },
            });
            return diff;
        },
    };
}
async function addReaction(client, triggerInfo, reaction) {
    if (triggerInfo.isCommentEvent && triggerInfo.commentId) {
        await client.addReactionToComment(triggerInfo.commentId, reaction);
    }
    else {
        await client.addReactionToIssue(triggerInfo.issueNumber, reaction);
    }
}
