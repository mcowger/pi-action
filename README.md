# Pi Coding Agent GitHub Action

This is a GitHub action that uses the [pi coding agent](https://pi.dev) to integrate with GitHub workflows (issues, pull requests, etc.).

Inspired by OpenCode's [GitHub action](https://opencode.ai/docs/github/).

## Features

- **Issue assistance**: Type `/pi` in an issue comment to have the agent analyze the issue and create a fix
- **PR assistance**: Type `/pi` in a PR comment to have the agent review and improve the pull request
- **Automated commits**: The agent can make changes, commit them, and create PRs automatically
- **Flexible LLM support**: Support for various providers via custom environment variable injection

## Usage

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

Create a workflow file like `.github/workflows/pi-agent.yml`. See the [example](./.github/workflows/pi.yml) file in this very repository to get started.

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
