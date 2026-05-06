/**
 * Tests for ActionOrchestrator business logic.
 *
 * Tests the orchestration flow (configuration gathering, prompt retrieval,
 * reaction lifecycle, Pi execution, finalization).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Provide a default version for tests (build-time constant)
declare global {
  var __VERSION__: string;
}
globalThis.__VERSION__ = 'test-version';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as github from '@actions/github';
import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import { Temporal } from '@js-temporal/polyfill';
import { ActionOrchestrator } from '../src/orchestrator';
import type { CoreAdapter, GitAdapter, PiAgent } from '../src/types';
import type { CreateReactionType, PlatformProvider } from '../src/platform';

function setupMocks(coreOverrides?: Partial<Record<string, string>>) {
  const getInputMock = mock((name: string) => {
    const defaults: Record<string, string> = {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      token: 'test-token',
      thinking_level: '',
      prompt: '',
      prompt_file: '',
    };
    return coreOverrides?.[name] ?? defaults[name] ?? '';
  });

  const setFailedMock = mock();
  const setOutputMock = mock();
  const noticeMock = mock();
  const infoMock = mock();
  const debugMock = mock();
  const warningMock = mock();
  const mockCore: CoreAdapter = {
    getInput: getInputMock,
    setFailed: setFailedMock,
    setOutput: setOutputMock,
    notice: noticeMock,
    info: infoMock,
    debug: debugMock,
    warning: warningMock,
  } as any;

  const addReactionMock = mock(async () => ({ data: { id: 123 } }) as CreateReactionType);
  const deleteReactionMock = mock(async () => {});
  const createFinalCommentMock = mock(async () => {});
  const getPromptMock = mock(async () => 'Help me write tests');
  const getStartTimeMock = mock(() => Temporal.Now.instant());

  const mockGit: GitAdapter = {
    addReaction: addReactionMock as any,
    deleteReaction: deleteReactionMock as any,
    createFinalComment: createFinalCommentMock as any,
    getPrompt: getPromptMock as any,
    getStartTime: getStartTimeMock as any,
  };

  const runMock = mock(async () => ({
    result: 'Here are your tests!',
    sessionStats: undefined,
  }));
  const exportSessionHtmlMock = mock(async (outputPath: string) => outputPath);
  const mockPiAgent: PiAgent = {
    run: runMock as any,
    exportSessionHtml: exportSessionHtmlMock as any,
  };

  const mockPiFactory = mock(() => mockPiAgent);

  const mockProvider: PlatformProvider = {
    getContext: mock(() => ({
      repo: { owner: 'test-owner', repo: 'test-repo' },
      issue: { number: 1 },
      eventName: 'issue_comment',
      payload: {},
      serverUrl: 'https://github.com',
      runId: 123,
      workspace: '/tmp',
    })),
    addReaction: mock(async () => undefined),
    deleteReaction: mock(async () => {}),
    createFinalComment: mock(async () => {}),
    getPrompt: mock(async () => 'test prompt'),
    getStartTime: mock(() => undefined),
    createPullRequest: mock(async () => ({
      content: [{ type: 'text', text: 'PR created' }],
      details: { pullRequestNumber: 1, pullRequestUrl: '', headBranch: '', baseBranch: '', dryRun: false },
    })),
    updatePullRequest: mock(async () => ({
      content: [{ type: 'text', text: 'PR updated' }],
      details: { pullRequestNumber: 1, pullRequestUrl: '', headBranch: '', baseBranch: '', dryRun: false },
    })),
    getIssueOrPRThread: mock(async () => undefined),
  } as any;

  return { mockCore, mockGit, mockPiAgent, mockPiFactory, mockProvider };
}

function createOrchestrator(mocks: ReturnType<typeof setupMocks>) {
  return new ActionOrchestrator(mocks.mockCore, mocks.mockGit, mocks.mockPiFactory, mocks.mockProvider);
}

describe('ActionOrchestrator', () => {
  // ── Successful execution ────────────────────────────────────────

  test('executes happy path: gathers config, runs agent, creates comment, sets outputs', async () => {
    const m = setupMocks();
    await createOrchestrator(m).execute();

    expect(m.mockCore.getInput).toHaveBeenCalledWith('provider');
    expect(m.mockCore.getInput).toHaveBeenCalledWith('model');
    expect(m.mockGit.getPrompt).toHaveBeenCalled();
    expect(m.mockPiAgent.run).toHaveBeenCalledWith('Help me write tests');
    expect(m.mockGit.createFinalComment).toHaveBeenCalledWith('Here are your tests!', expect.objectContaining({
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      executionDuration: expect.any(Temporal.Duration),
    }));
    expect(m.mockCore.setOutput).toHaveBeenCalledWith('response', 'Here are your tests!');
    expect(m.mockCore.setOutput).toHaveBeenCalledWith('success', true);
  });

  test('uses prompt input when provided', async () => {
    const m = setupMocks({ prompt: 'Review this code' });
    await createOrchestrator(m).execute();
    expect(m.mockGit.getPrompt).toHaveBeenCalledWith('Review this code');
  });

  test('manages reaction lifecycle: adds before execution, deletes after', async () => {
    const m = setupMocks();
    await createOrchestrator(m).execute();
    expect(m.mockGit.addReaction).toHaveBeenCalled();
    expect(m.mockGit.deleteReaction).toHaveBeenCalledWith({ data: { id: 123 } });
  });

  test('handles session stats in outputs and comment metadata', async () => {
    const m = setupMocks();
    const stats = { inputTokens: 500, outputTokens: 200, totalTokens: 700, cost: 0.042 };
    (m.mockPiAgent.run as any) = mock(async () => ({ result: 'Done!', sessionStats: stats }));
    m.mockPiFactory = mock(() => m.mockPiAgent);

    await createOrchestrator(m).execute();

    expect(m.mockCore.setOutput).toHaveBeenCalledWith('input_tokens', 500);
    expect(m.mockCore.setOutput).toHaveBeenCalledWith('output_tokens', 200);
    expect(m.mockCore.setOutput).toHaveBeenCalledWith('cost', 0.042);
    expect(m.mockCore.setOutput).toHaveBeenCalledWith('duration_seconds', expect.any(Number));

    const callArgs = (m.mockGit.createFinalComment as any).mock.calls[0];
    expect(callArgs[1].sessionStats).toEqual(stats);
  });

  // ── Error handling ──────────────────────────────────────────────

  test('on Pi agent error: calls setFailed, finalizes with error, and re-throws', async () => {
    const m = setupMocks();
    const error = new Error('API quota exceeded');
    (m.mockPiAgent.run as any) = mock(async () => { throw error; });
    m.mockPiFactory = mock(() => m.mockPiAgent);

    await expect(createOrchestrator(m).execute()).rejects.toThrow('API quota exceeded');

    expect(m.mockCore.setFailed).toHaveBeenCalledWith(error);
    expect(m.mockGit.createFinalComment).toHaveBeenCalledWith('API quota exceeded', expect.any(Object));
    expect(m.mockGit.deleteReaction).toHaveBeenCalled(); // still cleans up
  });

  test('sets success=false on error', async () => {
    const m = setupMocks();
    (m.mockPiAgent.run as any) = mock(async () => { throw new Error('fail'); });
    m.mockPiFactory = mock(() => m.mockPiAgent);
    await expect(createOrchestrator(m).execute()).rejects.toThrow('fail');
    expect(m.mockCore.setOutput).toHaveBeenCalledWith('success', false);
    expect(m.mockCore.setOutput).toHaveBeenCalledWith('response', 'fail');
  });

  test('continues execution when addReaction fails', async () => {
    const m = setupMocks();
    (m.mockGit.addReaction as any) = mock(async () => { throw new Error('Failed to add reaction'); });
    await expect(createOrchestrator(m).execute()).resolves.toBeUndefined();
    expect(m.mockPiAgent.run).toHaveBeenCalled();
  });

  test('still calls setFailed when finalize in catch block fails', async () => {
    const m = setupMocks();
    const error = new Error('Prompt failed');
    (m.mockPiAgent.run as any) = mock(async () => { throw error; });
    (m.mockGit.createFinalComment as any) = mock(async () => { throw new Error('Failed to post comment'); });
    m.mockPiFactory = mock(() => m.mockPiAgent);

    await expect(createOrchestrator(m).execute()).rejects.toThrow('Prompt failed');
    expect(m.mockCore.setFailed).toHaveBeenCalledWith(error);
  });

  // ── Input validation ────────────────────────────────────────────

  test('throws when provider or model is missing', async () => {
    const m = setupMocks({ provider: '', model: '' });
    await expect(createOrchestrator(m).execute()).rejects.toThrow('Missing required input: `provider`');
    expect(m.mockCore.setFailed).toHaveBeenCalled();
  });

  test('allows empty token for provider-side auth (e.g. ADC)', async () => {
    const m = setupMocks({ token: '' });
    await createOrchestrator(m).execute();
    expect(m.mockCore.debug).toHaveBeenCalledWith(expect.stringContaining('No token provided'));
  });

  test('throws when no prompt found', async () => {
    const m = setupMocks();
    (m.mockGit.getPrompt as any) = mock(async () => undefined);
    await expect(createOrchestrator(m).execute()).rejects.toThrow('No prompt found - cannot proceed');
  });

  test('throws when prompt is empty string', async () => {
    const m = setupMocks();
    (m.mockGit.getPrompt as any) = mock(async () => '');
    await expect(createOrchestrator(m).execute()).rejects.toThrow('No prompt found - cannot proceed');
  });

  // ── Configuration: extensions, base_url, flags ──────────────────

  test('parses extensions input into config array, omits when empty', async () => {
    const m1 = setupMocks({ extensions: 'npm:pkg-one\ngit:github.com/u/r' });
    await createOrchestrator(m1).execute();
    expect(m1.mockPiFactory).toHaveBeenCalledWith(
      expect.objectContaining({ extensions: ['npm:pkg-one', 'git:github.com/u/r'] }),
      m1.mockCore, m1.mockProvider
    );

    const m2 = setupMocks({ extensions: '' });
    await createOrchestrator(m2).execute();
    expect(m2.mockPiFactory).toHaveBeenCalledWith(
      expect.not.objectContaining({ extensions: expect.any(Array) }),
      m2.mockCore, m2.mockProvider
    );
  });

  test('load_builtin_extensions defaults to true, respects explicit values', async () => {
    const m = setupMocks({ load_builtin_extensions: 'false' });
    await createOrchestrator(m).execute();
    expect(m.mockPiFactory).toHaveBeenCalledWith(
      expect.objectContaining({ loadBuiltinExtensions: false }),
      m.mockCore, m.mockProvider
    );
  });

  test('base_url is passed when provided', async () => {
    const m = setupMocks({ base_url: 'https://proxy.example.com' });
    await createOrchestrator(m).execute();
    expect(m.mockPiFactory).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://proxy.example.com' }),
      m.mockCore, m.mockProvider
    );
  });

  // ── export_session_html ────────────────────────────────────────

  test('calls exportSessionHtml when enabled (default)', async () => {
    const m = setupMocks();
    await createOrchestrator(m).execute();
    expect(m.mockPiAgent.exportSessionHtml).toHaveBeenCalled();
  });

  test('skips export when disabled, continues on export failure', async () => {
    const m = setupMocks({ export_session_html: 'false' });
    await createOrchestrator(m).execute();
    expect(m.mockPiAgent.exportSessionHtml).not.toHaveBeenCalled();

    const m2 = setupMocks();
    (m2.mockPiAgent.exportSessionHtml as any) = mock(async () => { throw new Error('export failed'); });
    await createOrchestrator(m2).execute();
    expect(m2.mockCore.setOutput).toHaveBeenCalledWith('success', true);
  });

  // ── suppress_final_comment ─────────────────────────────────────

  test('suppresses comment when true, still sets outputs and deletes reaction', async () => {
    const m = setupMocks({ suppress_final_comment: 'true' });
    await createOrchestrator(m).execute();
    expect(m.mockGit.createFinalComment).not.toHaveBeenCalled();
    expect(m.mockGit.deleteReaction).toHaveBeenCalled();
    expect(m.mockCore.setOutput).toHaveBeenCalledWith('success', true);
  });

  test('creates comment normally when suppress is false', async () => {
    const m = setupMocks({ suppress_final_comment: 'false' });
    await createOrchestrator(m).execute();
    expect(m.mockGit.createFinalComment).toHaveBeenCalled();
  });

  // ── prompt_file ────────────────────────────────────────────────
  //
  // These tests mock github.context.payload to exercise buildContextVars()
  // without needing a real GitHub Actions runner environment.

  describe('prompt_file', () => {
    let tmpDir: string;
    let originalPayload: typeof github.context.payload;
    let originalEventName: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-test-'));
      process.env.GITHUB_WORKSPACE = tmpDir;
      // Save originals so we can restore after each test
      originalPayload = github.context.payload;
      originalEventName = github.context.eventName;
    });

    afterEach(() => {
      Object.defineProperty(github.context, 'payload', { value: originalPayload, writable: true, configurable: true });
      Object.defineProperty(github.context, 'eventName', { value: originalEventName, writable: true, configurable: true });
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function setPayload(payload: Record<string, unknown>, eventName = 'issue_comment') {
      Object.defineProperty(github.context, 'payload', { value: payload, writable: true, configurable: true });
      Object.defineProperty(github.context, 'eventName', { value: eventName, writable: true, configurable: true });
    }

    test('substitutes {{context.payload.comment.body}} and nested payload fields', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'prompt.md'),
        'Comment by {{context.payload.comment.user.login}}: {{context.payload.comment.body}}'
      );
      setPayload({ comment: { id: 1, body: "it's a test!", user: { login: 'octocat' } } });

      const m = setupMocks({ prompt_file: 'prompt.md', prompt: '' });
      await createOrchestrator(m).execute();

      expect(m.mockGit.getPrompt).toHaveBeenCalledWith("Comment by octocat: it's a test!");
    });

    test('substitutes deeply nested context paths (issue title, PR head ref)', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'prompt.md'),
        'Issue: {{context.payload.issue.title}} (#{{context.payload.issue.number}})'
      );
      setPayload({ issue: { number: 42, title: 'Fix the thing', user: { login: 'dev' } } });

      const m = setupMocks({ prompt_file: 'prompt.md', prompt: '' });
      await createOrchestrator(m).execute();

      expect(m.mockGit.getPrompt).toHaveBeenCalledWith('Issue: Fix the thing (#42)');
    });

    test('substitutes {{env.GITHUB_ACTOR}} and other env vars', async () => {
      fs.writeFileSync(path.join(tmpDir, 'prompt.md'), 'Actor is {{env.GITHUB_ACTOR}}.');
      process.env.GITHUB_ACTOR = 'monalisa';
      setPayload({});

      const m = setupMocks({ prompt_file: 'prompt.md', prompt: '' });
      await createOrchestrator(m).execute();

      expect(m.mockGit.getPrompt).toHaveBeenCalledWith('Actor is monalisa.');
      delete process.env.GITHUB_ACTOR;
    });

    test('substitutes {{env.CUSTOM_VAR}} passed via workflow env: block', async () => {
      fs.writeFileSync(path.join(tmpDir, 'prompt.md'), 'Comment ID: {{env.INITIAL_COMMENT_ID}}.');
      process.env.INITIAL_COMMENT_ID = '99';
      setPayload({});

      const m = setupMocks({ prompt_file: 'prompt.md', prompt: '' });
      await createOrchestrator(m).execute();

      expect(m.mockGit.getPrompt).toHaveBeenCalledWith('Comment ID: 99.');
      delete process.env.INITIAL_COMMENT_ID;
    });

    test('values with special characters (quotes, $, backticks, newlines) are substituted safely', async () => {
      const tricky = "it's a `special` value with $DOLLARS and\nnewlines";
      fs.writeFileSync(path.join(tmpDir, 'prompt.md'), 'Value: {{context.payload.comment.body}}');
      setPayload({ comment: { id: 1, body: tricky, user: { login: 'user' } } });

      const m = setupMocks({ prompt_file: 'prompt.md', prompt: '' });
      await createOrchestrator(m).execute();

      expect(m.mockGit.getPrompt).toHaveBeenCalledWith(`Value: ${tricky}`);
    });

    test('leaves unknown placeholder as-is and emits a warning', async () => {
      fs.writeFileSync(path.join(tmpDir, 'prompt.md'), 'Unknown: {{context.payload.does.not.exist}}.');
      setPayload({});

      const m = setupMocks({ prompt_file: 'prompt.md', prompt: '' });
      await createOrchestrator(m).execute();

      expect(m.mockGit.getPrompt).toHaveBeenCalledWith('Unknown: {{context.payload.does.not.exist}}.');
      expect(m.mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('context.payload.does.not.exist'));
    });

    test('accepts an absolute file path', async () => {
      const promptPath = path.join(tmpDir, 'abs-prompt.md');
      fs.writeFileSync(promptPath, 'Absolute path prompt.');
      setPayload({});

      const m = setupMocks({ prompt_file: promptPath, prompt: '' });
      await createOrchestrator(m).execute();

      expect(m.mockGit.getPrompt).toHaveBeenCalledWith('Absolute path prompt.');
    });

    test('throws a clear error when the file does not exist', async () => {
      setPayload({});
      const m = setupMocks({ prompt_file: 'nonexistent/prompt.md', prompt: '' });

      await expect(createOrchestrator(m).execute()).rejects.toThrow('Failed to read prompt_file');
      expect(m.mockCore.setFailed).toHaveBeenCalled();
    });

    test('throws when both prompt and prompt_file are set', async () => {
      const m = setupMocks({ prompt: 'inline prompt', prompt_file: 'some-file.md' });

      await expect(createOrchestrator(m).execute()).rejects.toThrow(
        'Both `prompt` and `prompt_file` inputs are set'
      );
      expect(m.mockCore.setFailed).toHaveBeenCalled();
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────

  test('uses current time when github start time unavailable', async () => {
    const m = setupMocks();
    (m.mockGit.getStartTime as any) = mock(() => undefined);
    await createOrchestrator(m).execute();
    const calls = (m.mockGit.createFinalComment as any).mock.calls;
    expect(calls[0][1].executionDuration).toBeInstanceOf(Temporal.Duration);
  });

  test('handles undefined reaction from addReaction', async () => {
    const m = setupMocks();
    (m.mockGit.addReaction as any) = mock(async () => undefined);
    await createOrchestrator(m).execute();
    expect(m.mockGit.deleteReaction).not.toHaveBeenCalled();
  });
});
