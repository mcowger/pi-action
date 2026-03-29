# AGENTS.md

## Project Overview

This is a GitHub Action that integrates the [Pi coding agent](https://pi.dev) with GitHub workflows. Users can invoke the agent by commenting `/pi` in issues or pull requests to get AI assistance with code analysis, fixes, and reviews.

**Key Features:**

- Issue assistance: Analyze issues and create fixes
- PR assistance: Review and improve pull requests
- Automated commits: Make changes, commit them, and create PRs
- Flexible LLM support: Works with various providers (Anthropic, OpenAI, Google, etc.)

## Codebase Structure

- `src/` - TypeScript action source code
  - `run.ts` - Main entry point for the action (simplified orchestrator creation)
  - `orchestrator.ts` - Business logic orchestration with testable adapter pattern
  - `types.ts` - Shared type definitions and adapter interfaces
  - `adapters/` - Production implementations of adapter interfaces
    - `core-adapter.ts` - GitHub Actions Core operations
    - `github-adapter.ts` - GitHub API operations
    - `pi-agent-adapter.ts` - Pi agent factory
  - `pi/` - Pi agent library and tool definitions
  - `github/` - GitHub API interactions and context enrichment
- `scripts/` - Utilities, helpers, etc.

## Architecture Overview

The action uses a **testable adapter pattern** to separate business logic from external dependencies:

1. **Orchestrator** (`ActionOrchestrator`) - Contains all business logic:
   - Configuration gathering from inputs
   - Prompt retrieval from GitHub
   - Reaction lifecycle management
   - Pi agent execution
   - Error handling and finalization

2. **Adapters** - Abstract external dependencies:
   - `CoreAdapter` - Wraps `@actions/core` operations
   - `GitHubAdapter` - Wraps GitHub API operations
   - `PiAgentFactory` - Creates Pi agent instances

3. **Testability** - The orchestrator can be tested with mock adapters, enabling:
   - Unit testing of orchestration flow
   - Verification of error handling behavior
   - Testing of edge cases without external dependencies

## Important Notes for Agents

1. **Validation**: Before considering any task complete, always run:
   ```bash
   bun run validate
   ```
   This runs: Prettier formatting, ESLint, TypeScript type checking, tests, and build.

2. **Orchestrator Testing**: Business logic is tested in `src/orchestrator.test.ts`. When modifying orchestration behavior, update these tests. Do **not** test mocks directly—test the actual business logic flow.

3. **Extension Pattern**: The action extends Pi with custom tools (`create_pull_request`, `update_pull_request`, `get_issue_or_pr_thread`) via the `ExtensionAPI` in `src/pi/tools/index.ts`.

4. **Centralized Logging**: Tool execution logging is centralized in `src/pi/logging.ts` using SDK events (`tool_execution_start`, `tool_execution_end`). Tools check `signal?.aborted` directly and return `details.cancelled: true` for cancellations.

5. **Test Coverage**: The project uses `bun test` for testing. Maintain and expand test coverage when making changes. Focus on behavior verification, not implementation details.

6. **Prefer Bun package manager over npm or others**
