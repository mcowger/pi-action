# AGENTS.md

## Project Overview

This is a GitHub Action that integrates the [Pi coding agent](https://pi.dev) with GitHub workflows. Users can invoke the agent by commenting `/pi` in issues or pull requests to get AI assistance with code analysis, fixes, and reviews.

**Key Features:**

- Issue assistance: Analyze issues and create fixes
- PR assistance: Review and improve pull requests
- Automated commits: Make changes, commit them, and create PRs
- Flexible LLM support: Works with various providers (Anthropic, OpenAI, Google, etc.)

## Codebase Structure

- `src/` - TypeScript source code
  - `run.ts` - Main entry point for the action
  - `github.ts` - GitHub API interactions and context enrichment
  - `tools.ts` - Extension factory that registers the `create_pull_request` tool
  - `prompt.ts` - Central place for all prompt management (system prompt, tool prompts)
  - `github.test.ts`, `run.test.ts`, `tools.test.ts` - Test files
- `.github/workflows/` - Workflow definitions

## Important Notes for Agents

1. **Validation**: Before considering any task complete, always run:
   ```bash
   bun run validate
   ```
   This runs: Prettier formatting, ESLint, TypeScript type checking, tests, and build.

2. **Extension Pattern**: The action extends Pi with a custom tool (`create_pull_request`) via the `ExtensionAPI` in `src/tools.ts`.

3. **Test Coverage**: The project uses `bun test` for testing. Maintain and expand test coverage when making changes.
