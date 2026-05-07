# Pi Coding Agent Action

A CI/CD action that integrates [Pi coding agent](https://pi.dev) with GitHub Actions workflows.

Inspired by OpenCode's [GitHub action](https://opencode.ai/docs/github/).

## Features

- **Issue assistance**: Prefix any issue comment with `/pi` to have the agent analyze the issue, generate a report, and/or create a PR with the fix
- **PR assistance**: Prefix any PR comment, review comment, or review with `/pi` to have the agent review or update the pull request
- **Automated code reviews**: Have Pi review every new pull request automatically
- **Non-interactive workflows**: Generate prompts from upstream steps and run Pi in background anywhere in your pipeline

## Quick Start

Create a workflow file, e.g. `.github/workflows/pi.yml`:

```yaml
name: Pi Agent

on:
  issue_comment:
    types: [created]

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  pi-agent:
    if: contains(github.event.comment.body, '/pi')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: mcowger/pi-action@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          provider: anthropic
          model: claude-sonnet-4-5
          token: ${{ secrets.ANTHROPIC_API_KEY }}
```

> [!IMPORTANT]
> The `main` branch is in active development. Pin to a specific release tag for production use:
> ```yaml
>    uses: mcowger/pi-action@main
> ```

## Usage

### Interactive Workflows

Trigger on comments containing `/pi`:

```yaml
on:
  issue_comment:
    types: [created]

jobs:
  pi-agent:
    if: contains(github.event.comment.body, '/pi')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: mcowger/pi-action@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          provider: openai
          model: gpt-5.4
          token: ${{ secrets.OPENAI_API_KEY }}
```

The action automatically checks out the repository, installs dependencies, and runs Pi with native Bun support — no Node.js setup needed.

### Non-Interactive Workflows

Use the `prompt` input to run the agent without requiring a comment trigger:

```yaml
- uses: mcowger/pi-action@main
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    provider: openai
    model: gpt-5.4
    token: ${{ secrets.OPENAI_API_KEY }}
    prompt: 'Review this pull request for security issues'
```

The prompt is enriched with issue/PR context (title and description) when available.

### Prompt from a File

Use `prompt_file` to load the prompt from a Markdown or text file in your repository. This is ideal for long or complex prompts that are easier to manage as a standalone file.

The file supports `{{dot.notation.path}}` placeholders resolved against two namespaces:

| Namespace | What it contains | Example placeholder |
|-----------|-----------------|--------------------|
| `context.*` | The raw [`@actions/github` context](https://github.com/actions/toolkit/tree/main/packages/github) — event payload, actor, SHA, ref, repo, etc. | `{{context.payload.comment.body}}` |
| `env.*` | All environment variables — `GITHUB_*` / `RUNNER_*` runner vars plus anything you set in the step's `env:` block | `{{env.GITHUB_SHA}}`, `{{env.MY_CUSTOM_VAR}}` |

**`.github/prompts/my-agent.md`:**
```markdown
You are a coding assistant.

You were triggered by this comment from {{context.payload.comment.user.login}}:
> {{context.payload.comment.body}}

The progress comment ID is **{{env.INITIAL_COMMENT_ID}}**.
Repository: {{context.payload.repository.full_name}}
```

**Workflow step:**
```yaml
- uses: mcowger/pi-action@main
  env:
    INITIAL_COMMENT_ID: ${{ steps.initial_comment.outputs.comment_id }}
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    provider: openai
    model: gpt-5.4
    token: ${{ secrets.OPENAI_API_KEY }}
    prompt_file: .github/prompts/my-agent.md
```

Most GitHub context data (comment body, issue/PR fields, actor, repo, etc.) is available automatically via `context.*` without any `env:` mapping. Only values derived from previous step outputs — like a comment ID you created earlier — need to be passed explicitly via `env:`.

- Unresolved placeholders are left unchanged and a warning is emitted.
- Values are substituted as plain strings with no shell involvement, so special characters (quotes, `$`, backticks, newlines) are always safe.
- `prompt` and `prompt_file` are mutually exclusive — setting both is an error.

### Custom Extensions

Load custom Pi extensions to add tools or modify agent behavior:

```yaml
- uses: mcowger/pi-action@main
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    provider: openai
    model: gpt-5.4
    token: ${{ secrets.OPENAI_API_KEY }}
    extensions: |
      npm:pi-subagents
      git:github.com/user/pi-custom-tools
      ./my-local-extension.ts
```

Supported extension sources:
- **npm packages**: `npm:package-name` or `npm:package@version`
- **git repositories**: `git:github.com/user/repo` (supports branches with `#branch`)
- **local files**: Relative paths to `.ts` extension files

### Disabling Built-in Extensions

Built-in GitHub tools (`create_pull_request`, `update_pull_request`, `get_issue_or_pr_thread`, `get_pr_diff`) are loaded by default. Disable them if you want only custom extensions:

```yaml
- uses: mcowger/pi-action@main
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    provider: openai
    model: gpt-5.4
    token: ${{ secrets.OPENAI_API_KEY }}
    load_builtin_extensions: false
    extensions: |
      npm:my-custom-github-tools
```

### Environment Variables for Extensions

Pass environment variables to Pi extensions using the native `env:` key:

```yaml
- uses: mcowger/pi-action@main
  env:
    MY_API_KEY: ${{ secrets.MY_API_KEY }}
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    provider: openai
    model: gpt-5.4
    token: ${{ secrets.OPENAI_API_KEY }}
```

### Provider Auth via Environment

The `token` input is optional — you can use environment variables instead:

```yaml
- uses: mcowger/pi-action@main
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    provider: openai
    model: gpt-5.4
```

### Using Outputs in Downstream Jobs

```yaml
jobs:
  pi-agent:
    steps:
      - uses: actions/checkout@v6
      - uses: mcowger/pi-action@main
        id: pi
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          provider: openai
          model: gpt-5.4
          token: ${{ secrets.OPENAI_API_KEY }}
          prompt: 'Generate release notes'

  publish:
    needs: pi-agent
    if: ${{ needs.pi-agent.outputs.success == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo "Cost: ${{ needs.pi-agent.outputs.cost }} USD"
          echo "Tokens: ${{ needs.pi-agent.outputs.input_tokens }} in / ${{ needs.pi-agent.outputs.output_tokens }} out"
```

### Export Session HTML

```yaml
- uses: mcowger/pi-action@main
  id: pi
  with:
    export_session_html: true
    github_token: ${{ secrets.GITHUB_TOKEN }}
    provider: openai
    model: gpt-5.4
    token: ${{ secrets.OPENAI_API_KEY }}

- uses: actions/upload-artifact@v7
  if: ${{ steps.pi.outputs.session_html_path }}
  with:
    name: pi-session-${{ github.run_number }}
    path: ${{ steps.pi.outputs.session_html_path }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github_token` | GitHub token for API access | Yes | - |
| `provider` | LLM provider (openai, anthropic, google, etc.) | Yes | - |
| `model` | Model to use (e.g. claude-sonnet-4-5, gpt-5.4, gemini-2.5-pro) | Yes | - |
| `token` | Provider API token | No | - |
| `thinking_level` | Model thinking level (off, low, medium, high) | No | `off` |
| `trigger` | Trigger phrase to invoke the action | No | `/pi` |
| `prompt` | Inline prompt text (skips comment extraction). Mutually exclusive with `prompt_file`. | No | - |
| `prompt_file` | Path to a prompt template file (relative to repo root). Supports `{{dot.notation.path}}` placeholders resolved via `context.*` (GitHub context) and `env.*` (environment variables). Mutually exclusive with `prompt`. | No | - |
| `extensions` | Custom extensions (one per line) | No | - |
| `load_builtin_extensions` | Load built-in GitHub tools | No | `true` |
| `base_url` | Override provider base URL (proxies, gateways) | No | - |
| `export_session_html` | Export session as HTML file | No | `false` |
| `suppress_final_comment` | Don't post final summary comment | No | `false` |

## Outputs

| Output | Description |
|--------|-------------|
| `response` | Agent response text (or error message on failure) |
| `success` | Whether the agent completed successfully (`true` / `false`) |
| `input_tokens` | Input tokens consumed |
| `output_tokens` | Output tokens generated |
| `cost` | Cost in USD |
| `duration_seconds` | Wall-clock execution duration |
| `session_html_path` | Path to exported session HTML file |

## Custom Tools

| Tool | Description |
|------|-------------|
| `create_pull_request` | Creates a new PR by detecting changes, creating a branch, committing via git CLI, and opening the PR. Supports `dry_run` mode. |
| `update_pull_request` | Updates an existing PR by pushing commits and optionally updating title/description. Supports `dry_run` mode. |
| `get_issue_or_pr_thread` | Retrieves the full thread of an issue or PR including comments, review comments, labels, and branch info. |
| `get_pr_diff` | Fetches the diff of a pull request on demand. Supports `max_lines` truncation and file filtering. |

## Development

### Prerequisites

- [Bun](https://bun.sh) package manager

### Validation

```bash
bun run validate
```

Runs: Prettier formatting, ESLint linting, TypeScript type checking.

### Testing

```bash
bun test                 # Run all tests
bun run test:coverage    # With coverage
bun run test:watch       # Watch mode
```

## License

See [LICENSE](./LICENSE)
