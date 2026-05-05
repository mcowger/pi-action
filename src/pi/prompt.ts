/**
 * @file Central prompt management for the Pi GitHub Action.
 *
 * Contains the system prompt sent to the LLM and all prompt-related constants
 * (descriptions, guidelines, parameter descriptions) consumed by the tool
 * definitions in {@link ./tools.ts}.
 */

export const SYSTEM_PROMPT =
  'You are a non-interactive assistant running in GitHub Actions CI/CD environment. You are usually tasked with code reviews and generating code changes. You will not interact with the user directly. The output (or error) you generate will be sent back as comment to the user. Avoid if possible long preambles about what you are going to do to achieve the goal, focus on the final result instead, remember that the user is reading the output as comment in a GitHub PR or issue. IMPORTANT: Do NOT add any footer, signature, metadata, "View action run" text, or similar closing to your response. A footer will be appended automatically - only output your actual response content.';

//
// Create Pull Request
//
export const CREATE_PULL_REQUEST_PROMPT_SNIPPET =
  'Create a pull request with title and description. The tool will automatically determine the default base branch, create a new branch, push changes, and create the PR.';

export const CREATE_PULL_REQUEST_PROMPT_GUIDELINES = [
  'Always use the create_pull_request tool to create pull requests - do not use git commands or gh CLI directly.',
  'Make sure your changes are made (modified files exist) before calling this tool. The tool will detect changes, create branch, and create PR automatically. Do NOT use unless you have already applied changes and/or added new files.',
  'The tool will automatically generate a branch name in the format: pi/issue{number}-{timestamp}.',
  'Do NOT provide the "base" parameter unless the user explicitly requests a different target branch than the repository default. The tool will automatically detect the correct default branch.',
  'Use dryRun=true first to verify the PR configuration, then dryRun=false to create it.',
];

export const CREATE_PULL_REQUEST_DESCRIPTION =
  'Create a new pull request on GitHub. This tool handles everything: automatically determines the default base branch, creates a new branch, pushes changes, and creates the PR. The branch name is auto-generated following the pi/issue{number}-{timestamp} pattern.';

export const CREATE_PULL_REQUEST_PARAM_TITLE_DESCRIPTION =
  'Pull request title (should be descriptive and follow conventional commit format)';

export const CREATE_PULL_REQUEST_PARAM_BODY_DESCRIPTION =
  'Detailed description of changes in markdown format. If not provided, will auto-generate from issue context (e.g., "Fixes #27")';

export const CREATE_PULL_REQUEST_PARAM_BASE_DESCRIPTION =
  'EXPERT: Override the default target branch. Only use this if the user explicitly requests a different branch than the repository default. Do NOT guess or assume a branch name - leave this empty unless specifically instructed.';

export const CREATE_PULL_REQUEST_PARAM_DRY_RUN_DESCRIPTION =
  'Set to true to simulate PR creation without actually creating it (for testing). Set to false to create the actual PR.';

//
// Get Issue/PR Thread
//
export const GET_ISSUE_PR_THREAD_PROMPT_SNIPPET =
  'Get the full comment thread for a GitHub issue or pull request, including title, description, labels, and all comments. For PRs, also includes inline review comments.';

export const GET_ISSUE_PR_THREAD_PROMPT_GUIDELINES = [
  'Use get_issue_or_pr_thread to understand the context of an issue or PR before taking action.',
  'By default, the tool fetches the current issue/PR from the GitHub context. Only provide owner/repo/issue_number when you need to fetch a different one.',
  'Use max_comments to limit results for very long threads; defaults to 100 comments.',
  'For pull requests, the tool also returns inline review comments (comments on specific lines of the diff).',
];

export const GET_ISSUE_PR_THREAD_DESCRIPTION =
  'Retrieve the complete comment thread for a GitHub issue or pull request. Returns the title, description, labels, state, author, timestamps, and all comments. For pull requests, also includes inline review comments with file path and line information, plus branch names and merge status. Does NOT fetch code changes — use the get_pr_diff tool for that.';

export const GET_ISSUE_PR_THREAD_PARAM_OWNER_DESCRIPTION =
  'Repository owner (e.g., "octocat"). If not provided, uses the current repository from context.';

export const GET_ISSUE_PR_THREAD_PARAM_REPO_DESCRIPTION =
  'Repository name (e.g., "hello-world"). If not provided, uses the current repository from context.';

export const GET_ISSUE_PR_THREAD_PARAM_ISSUE_NUMBER_DESCRIPTION =
  'Issue or pull request number. If not provided, uses the current issue/PR from context.';

export const GET_ISSUE_PR_THREAD_PARAM_MAX_COMMENTS_DESCRIPTION =
  'Maximum number of comments to fetch. Defaults to 100. Use for limiting very long threads.';

//
// Update Pull Request
//
export const UPDATE_PULL_REQUEST_PROMPT_SNIPPET =
  'Update an existing pull request by pushing new commits to the PR branch and optionally updating the title and/or body.';

export const UPDATE_PULL_REQUEST_PROMPT_GUIDELINES = [
  'Use update_pull_request when working within an existing PR flow to push new commits and/or update PR metadata.',
  'Make sure your changes are made (modified files exist) before calling this tool. The tool will detect changes and create a new commit on the PR branch.',
  'By default, the tool works with the current PR from the GitHub context. Only provide pull_number when you need to update a different PR.',
  'The tool commits changes with the provided message (or generates a default message) and pushes them to the existing PR branch.',
  'You can update the PR title and/or body using the title and body parameters.',
  'Use dryRun=true first to verify the update configuration, then dryRun=false to apply the changes.',
];

export const UPDATE_PULL_REQUEST_DESCRIPTION =
  'Update an existing pull request by pushing new commits to the PR branch. Optionally updates the PR title and/or description. The tool detects changes in the working tree, creates a new commit on the PR branch, and updates the PR metadata if provided.';

export const UPDATE_PULL_REQUEST_PARAM_PULL_NUMBER_DESCRIPTION =
  'Pull request number. If not provided, uses the current PR from context.';

export const UPDATE_PULL_REQUEST_PARAM_TITLE_DESCRIPTION =
  'New pull request title. If not provided, the title is not changed.';

export const UPDATE_PULL_REQUEST_PARAM_BODY_DESCRIPTION =
  'New pull request description in markdown format. If not provided, the description is not changed.';

export const UPDATE_PULL_REQUEST_PARAM_MESSAGE_DESCRIPTION =
  'Commit message for the new commit. If not provided, a descriptive message will be auto-generated based on the changes.';

export const UPDATE_PULL_REQUEST_PARAM_DRY_RUN_DESCRIPTION =
  'Set to true to simulate the PR update without actually modifying anything (for testing). Set to false to apply the actual changes.';

//
// Get PR Diff
//
export const GET_PR_DIFF_PROMPT_SNIPPET =
  'Get the diff of a pull request. Use this to understand what code changes a PR introduces.';

export const GET_PR_DIFF_PROMPT_GUIDELINES = [
  'Use get_pr_diff to fetch the diff of a pull request when you need to understand what changed.',
  'By default, the tool fetches the diff for the current PR from the GitHub context. Only provide owner/repo/pull_number when you need to fetch a different PR.',
  'The diff is truncated at 1000 lines by default. Use max_lines to increase or decrease this limit.',
];

export const GET_PR_DIFF_DESCRIPTION =
  'Fetch the diff of a GitHub pull request. Returns the diff as a string, truncated if too large. Useful for understanding what code changes a PR introduces before reviewing or modifying them.';

export const GET_PR_DIFF_PARAM_OWNER_DESCRIPTION =
  'Repository owner (e.g., "octocat"). If not provided, uses the current repository from context.';

export const GET_PR_DIFF_PARAM_REPO_DESCRIPTION =
  'Repository name (e.g., "hello-world"). If not provided, uses the current repository from context.';

export const GET_PR_DIFF_PARAM_PULL_NUMBER_DESCRIPTION =
  'Pull request number. If not provided, uses the current PR from context.';

export const GET_PR_DIFF_PARAM_MAX_LINES_DESCRIPTION =
  'Maximum number of diff lines to return. Defaults to 1000. Use for limiting very large diffs.';

export const GET_PR_DIFF_PARAM_IGNORE_FILES_DESCRIPTION =
  'List of file paths to exclude from the diff. Supports exact file paths (e.g. "package-lock.json") and directory prefixes (e.g. "dist/" to exclude everything under dist/). Matching is literal — glob patterns (e.g. "*.min.js") are NOT supported. Useful for filtering out generated files, build artifacts, or vendored dependencies.';

//
// Add Issue Comment
//
export const ADD_ISSUE_COMMENT_PROMPT_SNIPPET = 'Add a comment to a GitHub issue or pull request.';

export const ADD_ISSUE_COMMENT_PROMPT_GUIDELINES = [
  'Use add_issue_comment to post a new comment on an issue or PR.',
  'The issue_number defaults to the current issue/PR from context if not provided.',
  'Works for both issues and PRs since every PR is also an issue.',
];

export const ADD_ISSUE_COMMENT_DESCRIPTION =
  "Add a comment to a GitHub issue or pull request. Works for both issues and PRs since every PR is also an issue in GitHub's data model.";

export const ADD_ISSUE_COMMENT_PARAM_ISSUE_NUMBER_DESCRIPTION =
  'Issue or pull request number. If not provided, uses the current issue/PR from context.';

export const ADD_ISSUE_COMMENT_PARAM_BODY_DESCRIPTION = 'The comment body in markdown format.';

//
// Update Comment
//
export const UPDATE_COMMENT_PROMPT_SNIPPET =
  'Update an existing comment on a GitHub issue or pull request.';

export const UPDATE_COMMENT_PROMPT_GUIDELINES = [
  'Use update_comment to edit an existing comment by its numeric ID.',
  'Set is_review_comment=true when updating a PR inline review comment; leave false (default) for issue/PR general comments.',
  'Use list_comments first to find the comment ID you want to update.',
];

export const UPDATE_COMMENT_DESCRIPTION =
  'Update an existing comment on a GitHub issue or pull request. Can update both issue-level comments and PR inline review comments.';

export const UPDATE_COMMENT_PARAM_COMMENT_ID_DESCRIPTION =
  'The numeric ID of the comment to update.';

export const UPDATE_COMMENT_PARAM_BODY_DESCRIPTION = 'The new comment body in markdown format.';

export const UPDATE_COMMENT_PARAM_IS_REVIEW_COMMENT_DESCRIPTION =
  'Set to true if updating a PR inline review comment. Defaults to false (issue/PR general comment).';

//
// Create Inline Comment
//
export const CREATE_INLINE_COMMENT_PROMPT_SNIPPET =
  'Create an inline review comment on a specific line of a pull request diff.';

export const CREATE_INLINE_COMMENT_PROMPT_GUIDELINES = [
  'Use create_inline_comment to leave feedback on a specific line of code in a PR diff.',
  'The pull_number defaults to the current PR from context if not provided.',
  'Use start_line together with line for multi-line comments spanning a range.',
  'side defaults to RIGHT (new code); use LEFT to comment on the old version of the code.',
  'commit_id defaults to the PR head commit if not provided.',
];

export const CREATE_INLINE_COMMENT_DESCRIPTION =
  'Create an inline review comment on a specific line of a pull request diff. Supports single-line and multi-line comments. The comment is attached to a specific file path and line number in the diff.';

export const CREATE_INLINE_COMMENT_PARAM_PULL_NUMBER_DESCRIPTION =
  'Pull request number. If not provided, uses the current PR from context.';

export const CREATE_INLINE_COMMENT_PARAM_BODY_DESCRIPTION = 'The comment body in markdown format.';

export const CREATE_INLINE_COMMENT_PARAM_PATH_DESCRIPTION =
  "The relative file path to comment on (e.g., 'src/index.ts').";

export const CREATE_INLINE_COMMENT_PARAM_LINE_DESCRIPTION =
  'The line number in the diff to comment on. For multi-line comments, this is the last line of the range.';

export const CREATE_INLINE_COMMENT_PARAM_SIDE_DESCRIPTION =
  'Which side of the diff to comment on: RIGHT for new code (default), LEFT for old code.';

export const CREATE_INLINE_COMMENT_PARAM_COMMIT_ID_DESCRIPTION =
  'The commit SHA to attach the comment to. Defaults to the PR head commit if not provided.';

export const CREATE_INLINE_COMMENT_PARAM_START_LINE_DESCRIPTION =
  'For multi-line comments, the first line of the range. Must be used together with line (the end line).';

export const CREATE_INLINE_COMMENT_PARAM_START_SIDE_DESCRIPTION =
  'For multi-line comments, the side of the diff for the start line. Defaults to RIGHT.';

//
// List Comments
//
export const LIST_COMMENTS_PROMPT_SNIPPET = 'List comments on a GitHub issue or pull request.';

export const LIST_COMMENTS_PROMPT_GUIDELINES = [
  'Use list_comments to retrieve existing comments before deciding to add or update one.',
  'For PRs, set include_review_comments=true to also fetch inline review comments.',
  'Either issue_number or pull_number must be provided; defaults to the current issue/PR from context.',
  'include_review_comments requires pull_number to be set.',
];

export const LIST_COMMENTS_DESCRIPTION =
  'List comments on a GitHub issue or pull request. Can fetch issue-level comments, PR inline review comments, or both. Returns comment IDs, authors, timestamps, and bodies.';

export const LIST_COMMENTS_PARAM_ISSUE_NUMBER_DESCRIPTION =
  'Issue number. Use for issues or when fetching general PR comments. Defaults to the current issue/PR from context.';

export const LIST_COMMENTS_PARAM_PULL_NUMBER_DESCRIPTION =
  'Pull request number. Required when include_review_comments is true.';

export const LIST_COMMENTS_PARAM_INCLUDE_ISSUE_COMMENTS_DESCRIPTION =
  'Whether to include issue-level (general) comments. Defaults to true.';

export const LIST_COMMENTS_PARAM_INCLUDE_REVIEW_COMMENTS_DESCRIPTION =
  'Whether to include PR inline review comments. Defaults to false. Requires pull_number to be set.';
