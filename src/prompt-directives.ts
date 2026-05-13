/**
 * @file Parse inline directives from user comments.
 *
 * Users can include directives like `model: anthropic/claude-sonnet-4-6` in their
 * triggering comment to override action defaults. These directives are stripped
 * from the prompt text so the LLM never sees them.
 *
 * Supported directives:
 * - `model: <model-name>`         — Override model only (keep configured provider)
 * - `model: <provider>/<model>`   — Override both provider and model
 *
 * Directives are case-insensitive and can appear on any line in the comment.
 * They must be at the start of a line (after optional whitespace) to be recognized.
 */

/**
 * Parsed model directive containing provider and/or model overrides.
 */
export interface ModelDirective {
  /** Override the provider (e.g. "anthropic", "openai"). Only set when `provider/model` format is used. */
  provider?: string;
  /** Override the model (e.g. "claude-sonnet-4-6"). Always set when model directive is present. */
  model: string;
}

/**
 * Result of parsing prompt directives.
 */
export interface ParsedDirectives {
  /** The prompt text with all recognized directives stripped. */
  prompt: string;
  /** Parsed directives. Only fields with recognized directives are populated. */
  directives: {
    /** Model override, if a `model:` directive was found. */
    model?: ModelDirective;
  };
}

/**
 * Regex that matches a `model:` directive at the start of a line.
 *
 * Captures the value which can be:
 * - A bare model name: `model: claude-sonnet-4-6`
 * - A provider/model pair: `model: anthropic/claude-sonnet-4-6`
 *
 * The value must not contain whitespace (model names don't have spaces).
 * Case-insensitive to allow `Model:`, `MODEL:`, etc.
 */
const MODEL_DIRECTIVE_RE = /^[ \t]*model:[ \t]+(\S+)/gim;

/**
 * Parse inline directives from a prompt string and return the cleaned prompt
 * plus any extracted directive values.
 *
 * @param prompt - The raw prompt text (may contain directives).
 * @returns The cleaned prompt with directives stripped, and the parsed directive values.
 */
export function parsePromptDirectives(prompt: string): ParsedDirectives {
  const directives: ParsedDirectives['directives'] = {};

  // Reset regex state for global flag
  MODEL_DIRECTIVE_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = MODEL_DIRECTIVE_RE.exec(prompt)) !== null) {
    const value = match[1];
    if (!value) {
      continue;
    }

    if (value.includes('/')) {
      // provider/model format
      const slashIndex = value.indexOf('/');
      const provider = value.slice(0, slashIndex);
      const model = value.slice(slashIndex + 1);
      if (provider && model) {
        directives.model = { provider, model };
      }
    } else {
      // bare model name — override model only
      directives.model = { model: value };
    }
  }

  // Strip all matched directive lines from the prompt
  MODEL_DIRECTIVE_RE.lastIndex = 0;
  const cleanedPrompt = prompt.replace(MODEL_DIRECTIVE_RE, '').replace(/\n{3,}/g, '\n\n').trim();

  return { prompt: cleanedPrompt, directives };
}
