# Setting Up Pi Assistant in a New Repo

Do these steps, in order.

---

## 1. Create `.github/prompts/pi-assistant.md`

Copy the prompt file below. Change the first line to reference your repo name instead of "Plexus".

```
You are a coding assistant for the **YOUR-REPO-NAME** repository.

## YOUR TASK
You were triggered by this specific comment:
> {{context.payload.comment.body}}

**This comment defines your task.** Do exactly what it asks — nothing more, nothing less.
The issue/PR description and thread are background context to help you understand the codebase and problem — they are NOT additional tasks to perform.
Do NOT re-implement or redo work that is already complete.

## CRITICAL: Post your TODO list FIRST, then investigate
1. FIRST: Update the initial progress comment with your plan checklist
2. THEN: Do your investigation/coding
3. Update the TODO list after EVERY tool call if there's progress or plan changes

## Progress comment
A progress comment has already been posted for you: comment ID **{{env.INITIAL_COMMENT_ID}}**.
Use `update_comment` on that ID for ALL updates — do NOT use `add_issue_comment`.

**Protocol:**
1. First update — replace "🤔 Pi is working on it..." with your TODO checklist:
   ```
   update_comment({
     comment_id: {{env.INITIAL_COMMENT_ID}},
     body: "## Working on it...\n- [ ] Step 1\n- [ ] Step 2"
   })
   ```
2. Check off items as you complete them (update_comment with updated body)
3. When done, update_comment to replace the TODO with your final response

## Planning & Efficiency
- Think ahead about your plan before executing — consider what files you'll need to read and what commands you'll need to run
- Batch multiple reads and bash calls together where they don't depend on each other's results
- Minimize round-trips by combining independent operations in a single response

## Response style
- Be concise. Use headings and bullets. No filler text.

## CRITICAL: Determine context BEFORE planning
This trigger fires for comments on **both issues and pull requests**.
Your VERY FIRST action — before writing your TODO list, before reading any files — must be to check whether this comment is on an issue or a pull request.

**To check:** look at `context.payload.issue.pull_request`. If it is set (non-null), you are on a PR.

### If on an ISSUE:
- Plan and implement the requested changes, then use `create_pull_request` to open a new PR.

### If on a PULL REQUEST — MANDATORY rules, no exceptions:
- **NEVER create a new PR.** The PR already exists. Creating another one is always wrong.
- **NEVER do a code review.** The user is asking for code changes, not a review.
- **DO** check out the PR's existing branch, implement the requested changes, and push commits to that branch.
- Your TODO list must say "push changes to existing PR branch" — if it says "create PR" you have misread the context and must stop and re-check.

## When coding is required
- Keep changes minimal and focused on the request — do not refactor unrelated code
- NEVER close the issue or PR — leave it open for the user to close after reviewing
- You are already checked out on a working branch (`{{env.WORKING_BRANCH}}`). Do NOT run `git checkout` or create a new branch manually. When you are ready to open a PR, use the `create_pull_request` tool — it will handle branching, committing, and pushing for you.
```

The `{{...}}` placeholders are resolved at runtime by pi-action:
- `{{context.*}}` → the full `@actions/github` context (event payload, actor, repo, etc.)
- `{{env.*}}` → environment variables from the "Run Pi agent" step's `env:` block

---

## 2. Create `.github/workflows/pi-assistant.yml`

```yaml
name: Pi Assistant
run-name: "Pi: #${{ github.event.issue.number }} @${{ github.event.comment.user.login }}"

on:
  issue_comment:
    types: [created]

jobs:
  pi-agent:
    if: contains(github.event.comment.body, '/pi')
    runs-on: ubuntu-latest
    env:
      LLM_API_KEY: ${{ secrets.LLM_API_KEY }}:${{ github.job }}
    permissions:
      contents: write
      issues: write
      pull-requests: write
      actions: read

    steps:
      - name: Mask API key
        run: echo "::add-mask::$LLM_API_KEY"

      - name: Check commenter permission
        id: permission
        uses: actions/github-script@v9
        with:
          script: |
            const { data: perm } = await github.rest.repos.getCollaboratorPermissionLevel({
              owner: context.repo.owner,
              repo: context.repo.repo,
              username: context.payload.comment.user.login,
            });
            const level = perm.permission;
            core.info(`Commenter ${context.payload.comment.user.login} has permission: ${level}`);
            if (!['admin', 'write', 'maintain'].includes(level)) {
              core.setFailed(`User ${context.payload.comment.user.login} is not a collaborator or owner — ignoring /pi trigger`);
            }

      - name: Post initial progress comment
        id: initial_comment
        uses: actions/github-script@v9
        with:
          script: |
            const { data: comment } = await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.payload.issue.number,
              body: '🤖 **Pi is working on it...**\n\nAnalyzing your request and planning next steps.',
            });
            core.setOutput('comment_id', comment.id);
            core.info(`Posted progress comment: ${comment.id}`);

      - uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - name: Create working branch
        run: |
          BRANCH="pi-agent/$(date +%Y%m%d-%H%M%S)"
          git checkout -b "$BRANCH"
          echo "WORKING_BRANCH=$BRANCH" >> "$GITHUB_ENV"

      - name: Configure Git identity
        run: |
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git config user.name "github-actions[bot]"

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Run Pi agent
        id: pi
        uses: mcowger/pi-action@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          provider: openrouter
          model: ${{ vars.LLM_MODEL_ID }}
          token: ${{ env.LLM_API_KEY }}
          base_url: ${{ secrets.LLM_API_HOST }}
          trigger: /pi
          load_builtin_extensions: true
          suppress_final_comment: true
          suppress_bun_install: true
          export_session_html: true
          prompt_file: .github/prompts/pi-assistant.md
        env:
          INITIAL_COMMENT_ID: ${{ steps.initial_comment.outputs.comment_id }}

      - name: Post failure comment if agent did not complete
        if: always() && (steps.pi.outputs.success != 'true' || steps.pi.outputs.response == '')
        uses: actions/github-script@v9
        with:
          script: |
            const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
            await github.rest.issues.updateComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              comment_id: ${{ steps.initial_comment.outputs.comment_id }},
              body: [
                '❌ **Pi did not complete successfully.**',
                '',
                '| | |',
                '|---|---|',
                `| Success | \`${{ steps.pi.outputs.success }}\` |`,
                `| Duration | ${{ steps.pi.outputs.duration_seconds }}s |`,
                `| Input tokens | ${{ steps.pi.outputs.input_tokens }} |`,
                `| Output tokens | ${{ steps.pi.outputs.output_tokens }} |`,
                '',
                `[View Actions run](${runUrl}) for details.`,
                '',
                'Reply with `/pi` to try again.',
              ].join('\n'),
            });

      - name: Log agent summary
        if: always()
        env:
          PI_RESPONSE: ${{ steps.pi.outputs.response }}
        run: |
          {
            echo "### Pi Agent Summary"
            echo "- **Success:** ${{ steps.pi.outputs.success }}"
            echo "- **Duration:** ${{ steps.pi.outputs.duration_seconds }}s"
            echo "- **Input tokens:** ${{ steps.pi.outputs.input_tokens }}"
            echo "- **Output tokens:** ${{ steps.pi.outputs.output_tokens }}"
            echo "- **Cost:** \$${{ steps.pi.outputs.cost }}"
            echo ""
            echo "#### Response"
            printf '%s\n' "$PI_RESPONSE"
          } >> "$GITHUB_STEP_SUMMARY"

      - name: Upload session HTML
        if: always() && steps.pi.outputs.session_html_path != ''
        uses: actions/upload-artifact@v7
        with:
          name: pi-session
          path: ${{ steps.pi.outputs.session_html_path }}
          retention-days: 7
          archive: false
```

Things you may need to change for your repo:
- **Install step** — if you don't use Bun, replace the `setup-bun` / `bun install` steps with your package manager
- **Build step** — the Plexus workflow runs `bun run build:frontend` before the agent; add whatever build step your repo needs (or remove it)
- **`LLM_API_KEY` suffix** — the Plexus workflow appends `:${{ github.job }}` to the key for gateway job-tracking; if your provider doesn't expect that, change it to just `${{ secrets.LLM_API_KEY }}`
- **`provider`** — change `openrouter` if you use a different LLM provider

---

## 3. Set GitHub secrets and variables

Go to the repo on GitHub → **Settings → Secrets and variables → Actions**.

Add these three:

| Type | Name | Value |
|------|------|-------|
| **Secret** | `LLM_API_KEY` | Your LLM provider API key (e.g. OpenRouter key) |
| **Secret** | `LLM_API_HOST` | API base URL (e.g. `https://openrouter.ai/api/v1`) |
| **Variable** | `LLM_MODEL_ID` | Model ID (e.g. `anthropic/claude-sonnet-4`) |

Or via CLI:

```bash
gh secret set LLM_API_KEY
gh secret set LLM_API_HOST
gh variable set LLM_MODEL_ID --body "anthropic/claude-sonnet-4"
```

`GITHUB_TOKEN` is provided automatically by GitHub Actions — no setup needed.

---

## 4. (Optional) Add `AGENTS.md`

If you place an `AGENTS.md` at the repo root, the agent reads it for project-specific conventions (build/test commands, coding rules, tech stack). This is where you tell the agent how your repo works.

---

## 5. Test it

Create an issue, comment `/pi` on it. You should see a "Pi is working on it..." comment appear within a few seconds. Check the Actions tab for the running workflow.
