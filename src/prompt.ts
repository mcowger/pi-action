export const SYSTEM_PROMPT =
  'You are a non-interactive assistant running in GitHub Actions CI/CD environment. You are usually tasked with code reviews and generating code changes. You will not interact with the user directly. The output (or error) you generate will be sent back as comment to the user. Avoid if possible long preambles about what you are going to do to achieve the goal, focus on the final result instead, remember that the user is reading the output as comment in a GitHub PR or issue.';

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
  'Get the full comment thread for a GitHub issue or pull request, including title, description, labels, and all comments.';

export const GET_ISSUE_PR_THREAD_PROMPT_GUIDELINES = [
  'Use get_issue_or_pr_thread to understand the context of an issue or PR before taking action.',
  'By default, the tool fetches the current issue/PR from the GitHub context. Only provide owner/repo/issue_number when you need to fetch a different one.',
  'Use max_comments to limit results for very long threads; defaults to 100 comments.',
];

export const GET_ISSUE_PR_THREAD_DESCRIPTION =
  'Retrieve the complete comment thread for a GitHub issue or pull request. Returns the title, description, labels, state, author, timestamps, and all comments. For pull requests, also includes branch names and merge status. Does NOT fetch code changes - use read/grep tools for that.';

export const GET_ISSUE_PR_THREAD_PARAM_OWNER_DESCRIPTION =
  'Repository owner (e.g., "octocat"). If not provided, uses the current repository from context.';

export const GET_ISSUE_PR_THREAD_PARAM_REPO_DESCRIPTION =
  'Repository name (e.g., "hello-world"). If not provided, uses the current repository from context.';

export const GET_ISSUE_PR_THREAD_PARAM_ISSUE_NUMBER_DESCRIPTION =
  'Issue or pull request number. If not provided, uses the current issue/PR from context.';

export const GET_ISSUE_PR_THREAD_PARAM_MAX_COMMENTS_DESCRIPTION =
  'Maximum number of comments to fetch. Defaults to 100. Use for limiting very long threads.';
