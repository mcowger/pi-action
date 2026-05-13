/**
 * @file Parse inline directives from user comments.
 *
 * Users can include directives like `model: claude-sonnet-4-6` in their
 * triggering comment to override action defaults. These directives are stripped
 * from the prompt text so the LLM never sees them.
 *
 * Supported directives:
 * - `model: <model-name>` — Override the model (keep configured provider)
 *
 * Directives are case-insensitive and can appear on any line in the comment.
 * They must be at the start of a line (after optional whitespace) to be recognized.
 */

/**
 * Parsed model directive.
 */
export interface ModelDirective {
  /** Override the model (e.g. "claude-sonnet-4-6"). */
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

    // Always override model only — provider stays from action config
    directives.model = { model: value };
  }

  // Strip all matched directive lines from the prompt
  MODEL_DIRECTIVE_RE.lastIndex = 0;
  const cleanedPrompt = prompt.replace(MODEL_DIRECTIVE_RE, '').replace(/\n{3,}/g, '\n\n').trim();

  return { prompt: cleanedPrompt, directives };
}
