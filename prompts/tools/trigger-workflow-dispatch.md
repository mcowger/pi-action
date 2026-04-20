# trigger_workflow_dispatch

Trigger a GitHub Actions workflow_dispatch event. Use this to run downstream workflows on PRs created by this agent (since GITHUB_TOKEN-created PRs don't automatically trigger workflows). After creating a PR, trigger its review/test workflow to verify your changes.

## Usage

trigger_workflow_dispatch: Trigger a GitHub Actions workflow to run on the current branch

## Guidelines

- Use after creating a PR to trigger CI/CD workflows on that PR.
- Common use case: trigger a PR review workflow like 'pi-pr-review.yml' with inputs.pr_number
- The workflow file path can be relative to .github/workflows/ or include the full path.
- The ref defaults to the current branch - usually what you want after pushing a PR.
