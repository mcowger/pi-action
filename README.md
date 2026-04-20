# pi-action

A GitHub Action that invokes the [pi coding agent](https://github.com/mariozechner/pi-coding-agent) on issues and pull requests via comment triggers.

## Features

- 🤖 Trigger pi agent with customizable phrases (default: `@pi`)
- 🔒 Security-first: Only allows repo owners, members, and collaborators
- 🤝 Bot allowlist for automation workflows
- 📝 Works on both issues and pull requests
- 🆕 Trigger on issue/PR creation, not just comments
- 🔀 Automatically includes PR diffs for code review tasks
- 💬 Includes PR review comments in context for agent awareness
- 📦 Uses the pi SDK directly - no separate installation needed
- 🌿 Branch mode: Create feature branches and PRs (default) or push directly
- 📤 Output mode for non-interactive workflows (release notes, automation)
- 🎯 Direct prompt mode — invoke the agent without an issue/PR
- 🎨 Customizable prompt templates via inline or file-based configuration
- 💬 Agent progress comments — create and update comments during execution
- 🔕 Suppress final comment — let the agent manage all communication
- 🛠️ Common CLI tools included — jq and yq pre-installed for JSON/YAML processing

## Usage

### Basic Setup

Create `.github/workflows/pi-assistant.yml`:

```yaml
name: pi Assistant

on:
  issues:
    types: [opened]
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

jobs:
  pi-response:
    if: contains(github.event.comment.body || github.event.issue.body || '', '@pi')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
      pull-requests: write

    steps:
      - uses: actions/checkout@v4

      - name: Run pi-action
        uses: mcowger/pi-action@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

### Authentication

pi requires authentication with your LLM provider. Set up the `PI_AUTH_JSON` secret:

1. Run `pi` locally and complete OAuth authentication
2. Copy the contents of `~/.pi/agent/auth.json`
3. Add as repository secret `PI_AUTH_JSON`

Alternatively, set provider-specific environment variables (e.g., `ANTHROPIC_API_KEY`).

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github_token` | GitHub token for API access | Yes | - |
| `gist_token` | GitHub token with gist scope for session sharing | No | - |
| `pi_auth_json` | Contents of `~/.pi/agent/auth.json` | No | - |
| `pi_models_json` | Contents of `~/.pi/agent/models.json` | No | - |
| `trigger_phrase` | Phrase to trigger pi | No | `@pi` |
| `allowed_bots` | Comma-separated list of allowed bot usernames | No | - |
| `timeout` | Execution timeout in seconds | No | `1800` |
| `provider` | LLM provider | No | `anthropic` |
| `model` | Model ID | No | `claude-sonnet-4-20250514` |
| `prompt_template` | Custom prompt template (inline) | No | - |
| `prompt_template_file` | Path to prompt template file | No | - |
| `share_session` | Share session to log gist (creates/updates `{owner}/{repo}-session-log`) | No | `true` |
| `output_mode` | `comment` or `output` | No | `comment` |
| `prompt` | Direct prompt (requires `output_mode: output`) | No | - |
| `pr_number` | PR number to review (for workflow_dispatch) | No | - |
| `branch_mode` | `branch` (create PR) or `direct` (push) | No | `branch` |
| `suppress_final_comment` | Suppress final action comment (agent manages own) | No | `false` |

### Outputs

| Output | Description |
|--------|-------------|
| `response` | Agent's response text |
| `success` | `true` or `false` |
| `share_url` | Session share URL |
| `pr_created` | `true` if PR was created |
| `pr_number` | PR number |
| `pr_url` | PR URL |

### Prompt Templates

pi-action uses [Handlebars](https://handlebarsjs.com/) templates to build the prompt sent to the LLM. Templates are composed from a main layout plus reusable partials.

#### Built-in Templates

Three templates ship with pi-action:

| Name | File | Description |
|------|------|-------------|
| `main` | [`prompts/main.hbs`](https://github.com/mcowger/pi-action/blob/main/prompts/main.hbs) | Default for issue/PR tasks — progress comments, efficiency guidelines, reading files, action guidance, branch/direct mode |
| `pr-review` | [`prompts/pr-review.hbs`](https://github.com/mcowger/pi-action/blob/main/prompts/pr-review.hbs) | Structured code review — inline comments, review focus areas, output format |
| `release-notes` | [`prompts/release-notes.hbs`](https://github.com/mcowger/pi-action/blob/main/prompts/release-notes.hbs) | Release notes generation — version headings, categorized changes, auto-excludes CI |

The `main` template is composed from these partials:

| Partial | File | Purpose |
|---------|------|---------|
| `efficiency-guidelines` | [`prompts/partials/efficiency-guidelines.hbs`](https://github.com/mcowger/pi-action/blob/main/prompts/partials/efficiency-guidelines.hbs) | Batch reads/edits/tool calls, plan before acting |
| `progress-comments` | [`prompts/partials/progress-comments.hbs`](https://github.com/mcowger/pi-action/blob/main/prompts/partials/progress-comments.hbs) | Mandatory progress comment workflow and task tracking pattern |
| `reading-files` | [`prompts/partials/reading-files.hbs`](https://github.com/mcowger/pi-action/blob/main/prompts/partials/reading-files.hbs) | Only read relevant files, prefer source code over docs |
| `action-guidance` | [`prompts/partials/action-guidance.hbs`](https://github.com/mcowger/pi-action/blob/main/prompts/partials/action-guidance.hbs) | When to respond with text vs make code changes; PR comments = code change |
| `environment-setup` | [`prompts/partials/environment-setup.hbs`](https://github.com/mcowger/pi-action/blob/main/prompts/partials/environment-setup.hbs) | Git repo already configured, don't re-init |
| `artifact-requirements` | [`prompts/partials/artifact-requirements.hbs`](https://github.com/mcowger/pi-action/blob/main/prompts/partials/artifact-requirements.hbs) | Commit and push all work, run throw-away scripts immediately |
| `branch-mode-branch` | [`prompts/partials/branch-mode-branch.hbs`](https://github.com/mcowger/pi-action/blob/main/prompts/partials/branch-mode-branch.hbs) | Create a PR, never push to main |
| `branch-mode-direct` | [`prompts/partials/branch-mode-direct.hbs`](https://github.com/mcowger/pi-action/blob/main/prompts/partials/branch-mode-direct.hbs) | Push directly to current PR branch |
| `trigger-downstream` | [`prompts/partials/trigger-downstream.hbs`](https://github.com/mcowger/pi-action/blob/main/prompts/partials/trigger-downstream.hbs) | Trigger pi-pr-review.yml after PR creation |
| `final-response-requirement` | [`prompts/partials/final-response-requirement.hbs`](https://github.com/mcowger/pi-action/blob/main/prompts/partials/final-response-requirement.hbs) | Must end with plain-text summary |
| `pr-diff` | [`prompts/partials/pr-diff.hbs`](https://github.com/mcowger/pi-action/blob/main/prompts/partials/pr-diff.hbs) | PR diff display and inline comment format (appended to `main` for PRs) |

The `pr-review` template uses `{{> efficiency-guidelines}}` and handles `{{diff}}` inline. The `release-notes` template uses `{{> efficiency-guidelines}}` and instructs the LLM not to use tools.

#### Selecting a Template

**Use a built-in template by name:**

```yaml
- uses: mcowger/pi-action@v1
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    prompt_template: pr-review
```

Valid names: `main`, `pr-review`, `release-notes`. When `pr_number` is set, `pr-review` is used automatically unless you override with `prompt_template` or `prompt_template_file`.

**Inline custom template:**

```yaml
- uses: mcowger/pi-action@v1
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    prompt_template: |
      # Task: {{title}}
      
      {{task}}
      
      Please analyze and provide recommendations.
```

**File-based custom template:**

```yaml
- uses: mcowger/pi-action@v1
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    prompt_template_file: '.github/pi-prompt.md'
```

#### Overriding and Supplementing the Defaults

Since templates are Handlebars, you can use the built-in partials in your own custom templates. This lets you keep the default guidance while adding project-specific instructions.

**Add project-specific review conventions** (keeps all default review behavior from `pr-review`):

```yaml
- uses: mcowger/pi-action@v1
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    pr_number: ${{ github.event.inputs.pr_number }}
    prompt_template: |
      {{> efficiency-guidelines }}

      ## Review Guidelines

      Perform a thorough code review. Focus on the areas above, plus:

      - **Project conventions:**
        - Use Bun runtime (not Node.js-specific APIs)
        - Zod for validation, Drizzle ORM for DB
        - Never commit migration files — only schema `.ts` changes

      {{#if diff}}
      ## Changes
      ```diff
      {{diff}}
      ```
      {{/if}}

      ## Inline Comments
      To leave comments on specific lines, include a ```pr-review code block in your response:

      ```pr-review
      [
        { "path": "src/file.ts", "line": 10, "body": "Consider using const here" }
      ]
      ```

      Each comment requires `path`, `line`, and `body`. Optional: `side`, `start_line`, `start_side`.

      ## Output Format
      Start with an overall summary paragraph, then organize findings by category:
      - [❌] Issues that must be addressed
      - [⚠️] Concerns or suggestions worth considering
      - [❓] Questions about the implementation
      
      If everything looks good, a brief "LGTM" is sufficient.
```

**Add project-specific context to the main template:**

```yaml
- uses: mcowger/pi-action@v1
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    prompt_template: |
      # GitHub {{type_display}} #{{number}}

      ## Title
      {{title}}

      ## Description
      {{body}}

      ## Task
      {{task}}

      {{> efficiency-guidelines }}
      {{> progress-comments }}
      {{> reading-files }}
      {{> action-guidance }}

      ## Project Conventions

      - Always run `npm test` before committing
      - Use conventional commits (feat:, fix:, chore:)
      - Never modify files in `generated/`

      {{> environment-setup }}
      {{> artifact-requirements }}

      {{#if isBranchMode}}
      {{> branch-mode-branch }}
      {{else}}
      {{> branch-mode-direct }}
      {{/if}}

      {{> trigger-downstream }}
      {{> final-response-requirement }}
```

This approach lets you pick and choose which built-in partials to include and where to insert your own sections.

#### Template Variables

All templates have access to these Handlebars variables:

| Variable | Description |
|----------|-------------|
| `{{type}}` | `issue`, `pull_request`, or `direct` |
| `{{type_display}}` | `Issue` or `Pull Request` |
| `{{number}}` | Issue/PR number |
| `{{title}}` | Issue/PR title |
| `{{body}}` | Issue/PR body |
| `{{task}}` | Extracted task text (comment after the trigger phrase) |
| `{{trigger_comment}}` | Full trigger comment text |
| `{{diff}}` | PR diff (PRs only) |
| `{{reviewComments}}` | PR review comments (PRs only) |
| `{{isBranchMode}}` | `true` if branch mode, `false` if direct mode |

### Session Log Gist

Sessions are automatically logged to a private gist for reference:

- **Gist name:** `{owner}/{repo}-session-log` (e.g., `mcowger/plexus-session-log`)
- **Auto-discovered:** Reuses existing gist or creates new one
- **Organized by date:** Entries grouped under `## YYYY-MM-DD` headers
- **Each entry:** Time, session link (viewable at shittycodingagent.ai), PR info, result status, brief description

**Requirement:** Needs `gist_token` with gist scope (or use `github_token` if it has gist scope)

**To disable:** Set `share_session: false`

### Pre-installed CLI Tools

The action includes these CLI tools pre-installed for the agent to use:

- **jq** — Command-line JSON processor
  - Parse and query JSON: `cat config.json | jq '.key'`
  - Transform data: `jq '{name: .firstName, age}' users.json`

- **yq** — Command-line YAML processor
  - Parse YAML: `yq '.apiVersion' deployment.yaml`
  - Convert JSON to YAML: `cat file.json | yq -P`
  - Modify YAML: `yq '.key = "value"' file.yaml`

These are available in the action environment without any setup required.

### Branch Mode

Default (`branch_mode: branch`): Creates feature branch and PR.

Push directly without PR:

```yaml
- uses: mcowger/pi-action@main
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    branch_mode: direct
```

### PR Attribution Customization

Disable or customize the PR attribution suffix:

```yaml
# Disable attribution
- uses: mcowger/pi-action@main
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
  env:
    INPUT_PR_TOOL_ATTRIBUTION: "false"

# Custom attribution
- uses: mcowger/pi-action@main
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
  env:
    INPUT_PR_TOOL_ATTRIBUTION: |
      ---
      *Generated by My Bot*
```

### Using PR Outputs

Trigger downstream workflows when a PR is created:

```yaml
- name: Run pi-action
  id: pi
  uses: mcowger/pi-action@main
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    branch_mode: branch

- name: Dispatch review workflow
  if: steps.pi.outputs.pr_created == 'true'
  uses: actions/github-script@v9
  with:
    script: |
      await github.rest.actions.createWorkflowDispatch({
        owner: context.repo.owner,
        repo: context.repo.repo,
        workflow_id: 'pr-review.yml',
        ref: context.ref,
        inputs: {
          pr_number: '${{ steps.pi.outputs.pr_number }}'
        }
      });
```

### Session Sharing

By default, pi-action shares the complete session as a secret GitHub gist:

```yaml
- uses: mcowger/pi-action@main
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    share_session: true
```

To enable, provide a PAT with `gist` scope via `gist_token`:

```yaml
- uses: mcowger/pi-action@main
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    gist_token: ${{ secrets.PAT_WITH_GIST_SCOPE }}
    share_session: true
```

### Output Mode & Direct Prompts

Use `output_mode: output` with `prompt` for non-interactive workflows:

```yaml
on:
  workflow_dispatch:
    inputs:
      task:
        description: 'What should pi do?'
        required: true

jobs:
  pi:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mcowger/pi-action@main
        id: pi
        with:
          output_mode: output
          prompt: ${{ github.event.inputs.task }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
      - run: echo "${{ steps.pi.outputs.response }}"
```

### PR Review Mode (workflow_dispatch)

Review a PR when triggered via `workflow_dispatch` (no PR event context available):

```yaml
on:
  workflow_dispatch:
    inputs:
      pr_number:
        description: 'PR number to review'
        required: true
      task:
        description: 'Review instructions'
        required: false
        default: 'Please review this PR'

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: mcowger/pi-action@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          pr_number: ${{ github.event.inputs.pr_number }}
          prompt: ${{ github.event.inputs.task }}
```

Use this for:
- Manual PR reviews on demand
- Scheduled PR review workflows
- CI workflows triggered by other events that need to review PRs

### Agent Progress Comments

The pi agent can create and update its own comments during execution for progress reporting:

**`create_progress_comment`** — Create a new comment
```markdown
The agent can call: create_progress_comment(body)
Returns: comment_id (save this to update later)
```

**`update_progress_comment`** — Update an existing comment
```markdown
The agent can call: update_progress_comment(comment_id, body)
Use the comment_id returned from create_progress_comment
```

**Example workflow:**
```yaml
- uses: mcowger/pi-action@main
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    prompt: 'Analyze this codebase'
    prompt_template: |
      Start by creating a progress comment explaining what you'll do.
      Update the comment as you make progress.
      Example updates:
      - "🔍 Analyzing file structure..."
      - "💾 Found issues in src/auth.ts and src/db.ts"
      - "✅ Fixes pushed to branch fix/auth-issues"
```

The agent will:
1. Create a "Starting analysis..." comment
2. Update it with "Found 3 issues..."
3. Update it with "Fixes complete..."

### Suppress Final Comment

When using `create_progress_comment` for agent-managed updates, you may want to suppress the final action comment:

```yaml
- uses: mcowger/pi-action@main
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    suppress_final_comment: true  # Only agent comments appear
```

Combine with agent progress comments for full control:

```yaml
- uses: mcowger/pi-action@main
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    suppress_final_comment: true
    prompt_template: |
      Start by creating a progress comment with create_progress_comment.
      Update it throughout your work. Do not post a final summary comment.
```

## Security

- Only responds to users with write access (owners, members, collaborators)
- Bots blocked by default unless in `allowed_bots`
- Input sanitized to remove HTML comments and invisible Unicode

## License

MIT
