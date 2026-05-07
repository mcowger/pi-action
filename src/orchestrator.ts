/**
 * @file Action orchestrator with testable business logic.
 *
 * Separates orchestration flow (what happens and in what order) from
 * implementation details (how we talk to GitHub, Core, or Pi). This enables
 * comprehensive unit testing of the action's behavior without mocking
 * the external dependencies themselves.
 */

import { Temporal } from '@js-temporal/polyfill';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as github from '@actions/github';
import {
  type CommentMetadata,
  type CoreAdapter,
  type GitAdapter,
  type PiAgent,
  type PiAgentFactory,
  type PiConfig,
  type SessionStats,
} from './types';
import type { CreateReactionType, PlatformProvider } from './platform';

/**
 * Orchestrates the GitHub Action execution flow.
 *
 * The orchestrator gathers configuration, retrieves the prompt, manages the
 * reaction lifecycle, executes the Pi agent, and finalizes the result or error.
 */
export class ActionOrchestrator {
  constructor(
    private readonly core: CoreAdapter,
    private readonly git: GitAdapter,
    private readonly piAgentFactory: PiAgentFactory,
    private readonly platformProvider: PlatformProvider
  ) {}

  /**
   * Execute the complete action flow.
   *
   * @throws Rethrows any error from the Pi session after reporting it via core.setFailed.
   *         Finalization errors (posting comment, deleting reaction) are caught and logged
   *         so they never prevent setFailed from running.
   */
  async execute(): Promise<void> {
    this.core.info('running action');
    const startTime = this.git.getStartTime() ?? Temporal.Now.instant();
    let config: PiConfig | undefined;
    let reaction: CreateReactionType | undefined;
    let prompt: string | undefined;

    try {
      config = this.gatherConfig();
      const resolvedPromptInput = config.promptFile
        ? this.readAndRenderPromptFile(config.promptFile)
        : config.promptInput;
      prompt = await this.git.getPrompt(resolvedPromptInput);

      if (!prompt) {
        throw new Error('No prompt found - cannot proceed');
      }

      try {
        reaction = await this.git.addReaction();
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        this.core.notice(`failed to add reaction: ${errorMessage}`);
      }

      const pi = this.piAgentFactory(config, this.core, this.platformProvider);
      const { result, sessionStats } = await pi.run(prompt);

      this.core.info('\n');
      this.core.info('════════════════════════════════════════════════════════════════');
      this.core.info('✅ Agent session completed');
      this.core.info('════════════════════════════════════════════════════════════════');

      if (config.exportSessionHtml) {
        await this.exportSessionHtml(pi);
      } else {
        this.core.debug('[session-html] export disabled by configuration');
      }

      await this.finalize(result, config, startTime, reaction, sessionStats, true);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);

      // Try to post error as comment. Wrap in its own try-catch so that
      // a failure to finalize (e.g. network/API down after a timeout) does
      // NOT prevent setFailed from running. The action must always signal
      // failure to the CI runner, even when we cannot leave a comment.
      try {
        const errorConfig = config ?? {
          provider: '',
          model: '',
          token: '',
          thinkingLevel: '',
          promptInput: '',
        };
        await this.finalize(errorMessage, errorConfig, startTime, reaction, undefined, false);
      } catch (finalizeError) {
        const finalizeErrorMessage =
          finalizeError instanceof Error ? finalizeError.message : String(finalizeError);
        this.core.notice(`failed to finalize after error: ${finalizeErrorMessage}`);
      }

      // Mark the action as failed and re-throw the original error
      this.core.setFailed(e as Error);
      throw e;
    }
  }

  /**
   * Gather configuration from core inputs.
   *
   * Validates that all required inputs are present and throws descriptive
   * errors when they are missing, so users see actionable guidance instead
   * of obscure downstream failures like "Model not found: /".
   */
  private gatherConfig(): PiConfig {
    const provider = this.core.getInput('provider');
    const model = this.core.getInput('model');
    const token = this.core.getInput('token');

    if (!provider) {
      throw new Error(
        'Missing required input: `provider`. ' +
          'Set it to your LLM provider (e.g. "anthropic", "openai", "google"). ' +
          'See https://github.com/mcowger/pi-action#usage for details.'
      );
    }

    if (!model) {
      throw new Error(
        'Missing required input: `model`. ' +
          'Set it to the desired model (e.g. "claude-sonnet-4-5", "gpt-4o"). ' +
          'See https://github.com/mcowger/pi-action#usage for details.'
      );
    }

    if (!token) {
      this.core.debug('[config] No token provided — relying on provider-side auth (e.g. ADC)');
    }

    const promptFile = this.core.getInput('prompt_file') || undefined;
    const promptInput = this.core.getInput('prompt');

    if (promptFile && promptInput) {
      throw new Error(
        'Both `prompt` and `prompt_file` inputs are set. Use one or the other.'
      );
    }

    const extensionsInput = this.core.getInput('extensions');
    const extensions = extensionsInput
      ? extensionsInput
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean)
      : undefined;

    const loadBuiltinExtensionsInput = this.core.getInput('load_builtin_extensions');
    const loadBuiltinExtensions = loadBuiltinExtensionsInput
      ? loadBuiltinExtensionsInput.toLowerCase() === 'true'
      : true; // default to true

    const baseUrl = this.core.getInput('base_url') || undefined;

    const exportSessionHtmlInput = this.core.getInput('export_session_html');
    const exportSessionHtml = exportSessionHtmlInput
      ? exportSessionHtmlInput.toLowerCase() === 'true'
      : true; // default to true

    const suppressFinalCommentInput = this.core.getInput('suppress_final_comment');
    const suppressFinalComment = suppressFinalCommentInput
      ? suppressFinalCommentInput.toLowerCase() === 'true'
      : false; // default to false

    return {
      provider,
      model,
      token,
      thinkingLevel: this.core.getInput('thinking_level') ?? 'off',
      promptInput,
      ...(promptFile ? { promptFile } : {}),
      ...(extensions?.length ? { extensions } : {}),
      loadBuiltinExtensions,
      ...(baseUrl ? { baseUrl } : {}),
      exportSessionHtml,
      suppressFinalComment,
    };
  }

  /**
   * Resolve a dot-notation path (e.g. `"context.payload.comment.body"`) against
   * a namespace object, returning the value as a string or `undefined` if any
   * segment along the path is absent.
   */
  private resolveTemplatePath(namespace: Record<string, unknown>, dotPath: string): string | undefined {
    const parts = dotPath.split('.');
    let current: unknown = namespace;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    if (current === undefined || current === null) {
      return undefined;
    }
    return String(current);
  }

  /**
   * Read a prompt template file and substitute `{{dot.notation.path}}` placeholders.
   *
   * Placeholders are resolved against a two-key namespace:
   * - `context.*` — the raw `@actions/github` context object (`context.payload.comment.body`,
   *   `context.actor`, `context.repo.owner`, etc.)
   * - `env.*`     — all environment variables (`env.GITHUB_SHA`, `env.INITIAL_COMMENT_ID`, etc.)
   *
   * Unresolved placeholders are left unchanged and a warning is emitted.
   * Values are never passed through a shell, so special characters are always safe.
   *
   * @param filePath - Path to the template file, relative to the workspace root.
   * @returns The rendered prompt string.
   * @throws When the file cannot be read.
   */
  private readAndRenderPromptFile(filePath: string): string {
    const workspacePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.env.GITHUB_WORKSPACE ?? process.cwd(), filePath);

    this.core.debug(`[prompt_file] reading template from ${workspacePath}`);

    let template: string;
    try {
      template = fs.readFileSync(workspacePath, 'utf8');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to read prompt_file '${filePath}': ${msg}`);
    }

    const namespace: Record<string, unknown> = {
      context: github.context,
      env: process.env,
    };

    // Replace every {{dot.notation.path}} with the resolved value.
    const rendered = template.replace(/\{\{([a-zA-Z0-9._]+)\}\}/g, (_match, dotPath: string) => {
      const value = this.resolveTemplatePath(namespace, dotPath);
      if (value === undefined) {
        this.core.warning(
          `[prompt_file] placeholder {{${dotPath}}} could not be resolved — leaving as-is`
        );
        return _match;
      }
      return value;
    });

    this.core.debug(`[prompt_file] template rendered (${rendered.length} chars)`);
    return rendered;
  }

  /**
   * Export session as a self-contained HTML file.
   *
   * Writes the HTML to the runner's temp directory and sets the
   * `session_html_path` action output. Users can upload the file
   * as an artifact using `actions/upload-artifact` in their workflow:
   *
   * ```yaml
   * - uses: actions/upload-artifact@v7
   *   with:
   *     name: pi-session-html
   *     path: ${{ steps.pi.outputs.session_html_path }}
   * ```
   */
  private async exportSessionHtml(pi: PiAgent): Promise<void> {
    const outputDir = path.join(
      process.env.RUNNER_TEMP ?? os.tmpdir(),
      `pi-session-html-${process.env.GITHUB_RUN_ID ?? 'local'}`
    );
    const htmlPath = path.join(outputDir, 'session.html');

    try {
      fs.mkdirSync(outputDir, { recursive: true });
      await pi.exportSessionHtml(htmlPath);
      this.core.info(`[session-html] exported session HTML to ${htmlPath}`);
      this.core.setOutput('session_html_path', htmlPath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.core.notice(`[session-html] failed to export HTML: ${msg}`);
    }
  }

  /**
   * Finalize execution by posting the result/error as a comment and setting action outputs.
   */
  private async finalize(
    body: string,
    config: PiConfig,
    startTime: Temporal.Instant,
    reaction: CreateReactionType | undefined,
    sessionStats: SessionStats | undefined,
    success: boolean
  ): Promise<void> {
    try {
      if (reaction) {
        await this.git.deleteReaction(reaction);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      this.core.notice(`failed to delete reaction: ${errorMessage}`);
    }

    this.core.setOutput('response', body);
    this.core.setOutput('success', success);

    if (sessionStats !== undefined) {
      this.core.setOutput('input_tokens', sessionStats.inputTokens);
      this.core.setOutput('output_tokens', sessionStats.outputTokens);
      this.core.setOutput('cost', sessionStats.cost);
    }

    const executionDuration = startTime.until(Temporal.Now.instant());
    this.core.setOutput('duration_seconds', executionDuration.total('seconds'));

    if (config.suppressFinalComment) {
      this.core.debug('suppress_final_comment is enabled — skipping final comment');
      return;
    }

    const metadata: CommentMetadata = {
      provider: config.provider,
      model: config.model,
      thinkingLevel: config.thinkingLevel,
      executionDuration,
    };

    if (sessionStats !== undefined) {
      metadata.sessionStats = sessionStats;
    }

    await this.git.createFinalComment(body, metadata);
  }
}
