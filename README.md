# Pi Coding Agent GitHub Action

This is a GitHub action that uses the [pi coding agent](https://pi.dev) to integrate with GitHub workflows (issues, pull requests, etc.).

Inspired by OpenCode's [GitHub action](https://opencode.ai/docs/github/).

## Features

- **Issue assistance**: Type `/pi` in an issue comment to have the agent analyze the issue and create a fix
- **PR assistance**: Type `/pi` in a PR comment to have the agent review and improve the pull request
- **Automated commits**: The agent can make changes, commit them, and create PRs automatically
- **Flexible LLM support**: Support for various providers

## Usage

- create a GitHub workflow e.g. [triggered by `if`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idif)
- add `actions/checkout` and `actions/setup-node` as pre-requisite steps
- finally, add `shaftoe/pi-coding-agent-action` 

Example:

```yaml
      - name: Run Pi agent
        uses: shaftoe/pi-coding-agent-action@v2
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          provider: my-provider
          model: some-model
          token: ${{ secrets.MODEL_API_KEY }}
          thinking_level: high # defaults to 'off'
```

### Quick Start

Create a workflow file, e.g. `.github/workflows/pi-agent.yml`. See the [example](./.github/workflows/pi.yml) file in this very repository to get started.

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github_token` | GitHub token for API access | Yes | - |
| `provider` | LLM provider (anthropic, openai, google, etc.) | Yes | - |
| `model` | Model to use (e.g., claude-sonnet-4-5, gpt-4o, gemini-2.5-pro) | Yes | - |
| `token` | Provider API token | Yes | - |
| `thinking_level` | Model thinking level | No | off |
| `trigger` | Trigger phrase to invoke the action | No | /pi |

## How It Works

1. User comments `/pi [instructions]` in an issue
2. Action fetches issue context via GitHub CLI
3. Creates a new branch: `pi/issue{number}-{timestamp}`
4. Runs `pi` agent with the issue context
5. If changes are made:
   - Stages all modified files
   - Commits with AI-generated summary
   - Pushes to remote
   - Creates a new PR
6. Posts result as a comment

## Architecture

The action is built on top of the [Pi coding agent](https://pi.dev) framework and consists of several key components:

### Core Components

- **`run.ts`** - Main entry point that orchestrates the GitHub workflow integration, manages the agent lifecycle, and handles user prompts
- **`pi.ts`** - Pi integration, setup the agent using its [SDK](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md)
- **`github.ts`** - GitHub API interaction layer that provides context enrichment, issue/PR thread retrieval, reaction management, and pull request creation
- **`tools.ts`** - Extension factory that registers custom tools with the Pi agent
- **`prompt.ts`** - Prompt definitions including system prompts and tool-specific guidelines

### Custom Tools

The action extends Pi with two internal tools:

| Tool | Description |
|------|-------------|
| `create_pull_request` | Creates a new pull request by detecting file changes, creating a branch, committing changes via GitHub API, and opening the PR. Supports `dry_run` mode for testing without actual PR creation. |
| `get_issue_or_pr_thread` | Retrieves the full thread of an issue or pull request including title, body, state, labels, branch info (for PRs), and all comments. Useful for understanding the full context before making changes. |

## Development

### Validation

Before committing, the following checks run automatically (via Lefthook):
- Code formatting (Prettier)
- Linting (ESLint)
- Type checking (TypeScript)
- Tests
- Building

To run all validations manually:

```bash
bun run validate
```

## License

See [LICENSE](./LICENSE)
