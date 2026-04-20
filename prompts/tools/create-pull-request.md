# create_pull_request

Create a pull request on GitHub. Use this tool after committing and pushing your changes to a branch. This is the ONLY way to create pull requests - do NOT use `gh pr create` or any other shell command. The tool uses the GitHub API directly with the action's authenticated token.

## Usage

create_pull_request: Create a pull request on GitHub (use after committing and pushing changes)

## Guidelines

- Always use the `create_pull_request` tool to open PRs - never use `gh pr create` via bash.
- Commit and push your changes before calling create_pull_request.
- Include issue references in the PR body (e.g., "Fixes #123").
