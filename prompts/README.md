# pi-action Prompts

This directory contains modular Handlebars templates for the pi agent prompts.

## Structure

```
prompts/
├── main.hbs                      # Main prompt template (uses partials)
├── partials/                     # Composable template sections
│   ├── environment-setup.hbs
│   ├── artifact-requirements.hbs
│   ├── final-response-requirement.hbs
│   ├── branch-mode-branch.hbs
│   ├── branch-mode-direct.hbs
│   └── pr-diff.hbs
└── tools/                        # Tool descriptions (markdown)
    ├── create-progress-comment.md
    ├── update-progress-comment.md
    ├── create-pull-request.md
    └── trigger-workflow-dispatch.md
```

## Handlebars Templates

The main prompt uses [Handlebars](https://handlebarsjs.com/) for templating:

### Variables

- `{{type}}` - "issue" or "pull_request"
- `{{type_display}}` - "Issue" or "Pull Request"
- `{{number}}` - Issue/PR number
- `{{title}}` - Issue/PR title
- `{{body}}` - Issue/PR body
- `{{task}}` - The extracted task from the trigger comment
- `{{diff}}` - PR diff (for PRs)
- `{{reviewComments}}` - Formatted PR review comments
- `{{trigger_comment}}` - The full trigger comment text
- `{{isBranchMode}}` - Boolean indicating branch mode

### Conditionals

```handlebars
{{#if reviewComments}}
{{reviewComments}}
{{/if}}

{{#if isBranchMode}}
{{> branch-mode-branch }}
{{else}}
{{> branch-mode-direct }}
{{/if}}
```

### Partials

Partials are reusable template fragments from the `partials/` directory:

```handlebars
{{> environment-setup }}
{{> artifact-requirements }}
{{> final-response-requirement }}
```

## Adding New Sections

1. Create a new `.hbs` file in `partials/`
2. Reference it in `main.hbs` with `{{> partial-name }}`
3. The template will be automatically loaded

## Custom Templates

Users can provide custom templates via:
- `prompt_template` input (inline template)
- `prompt_template_file` input (path to .hbs file)

Custom templates can use the same Handlebars syntax and partials.
