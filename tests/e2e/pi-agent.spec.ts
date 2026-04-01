/**
 * E2E tests for Pi agent integration.
 *
 * These tests run a real Pi SDK instance with mocked GitHub dependencies.
 * They are confidence tests that validate our integration works after Pi SDK updates.
 *
 * NOTE: These tests make real API calls to LLM provider and may incur costs.
 * They only run when RUN_E2E_TESTS=1 environment variable is set.
 *
 * Required environment variables:
 *   export E2E_PROVIDER           # Provider name (e.g., openrouter, zai, anthropic)
 *   export E2E_MODEL              # Model to use (e.g., google/gemma-3-4b-it:free)
 *   export E2E_TOKEN              # API key for the provider
 *   export RUN_E2E_TESTS=1         # Enable E2E tests
 *
 * Running the tests:
 *   bun test tests/e2e/pi-agent.spec.ts
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { Agent } from '../../src/pi/agent.js';

// ============================================================================
// Build-time constants (normally injected by esbuild define)
// ============================================================================

// E2E tests run directly with bun test, bypassing the build step.
// We must define build-time constants manually to match production behavior.
const piVersion = JSON.parse(
  readFileSync('node_modules/@mariozechner/pi-coding-agent/package.json', 'utf-8')
).version;

declare global {
  var __PI_CODING_AGENT_VERSION__: string;
}
globalThis.__PI_CODING_AGENT_VERSION__ = piVersion;

// ============================================================================
// Mock GitHub Dependencies (we only test Pi SDK integration)
// ============================================================================

// Mock @actions/core
const mockGetInput = mock((name: string): string => {
  const defaults: Record<string, string> = {
    github_token: 'fake-token',
    trigger: '/pi',
    max_comments: '100',
    provider: '',
    model: '',
    token: 'test-token',
    thinking_level: '',
    prompt: '',
  };
  return defaults[name] ?? '';
});

const mockSetFailed = mock();
const mockNotice = mock();
const mockInfo = mock();
const mockDebug = mock();
const mockWarning = mock();

import type { CoreAdapter } from '../../src/types.ts';

const mockCoreAdapter: CoreAdapter = {
  getInput: mockGetInput,
  setFailed: mockSetFailed,
  notice: mockNotice,
  debug: mockDebug,
  info: mockInfo,
  warning: mockWarning,
};

mock.module('@actions/core', () => ({
  getInput: mockGetInput,
  notice: mockNotice,
  info: mockInfo,
  debug: mockDebug,
  setFailed: mockSetFailed,
  warning: mockWarning,
}));

// Mock @actions/github context
const mockGitHubContext = {
  eventName: 'issue_comment' as const,
  repo: {
    owner: 'test-owner',
    repo: 'test-repo',
  },
  issue: {
    number: 123,
  },
  serverUrl: 'https://github.com',
  runId: 123456789,
  payload: {
    comment: {
      body: '/pi test',
    },
    issue: {
      number: 123,
    },
  },
};

mock.module('@actions/github', () => ({
  context: mockGitHubContext,
}));

// Set env vars that modules might read
process.env.INPUT_TRIGGER = '/pi';
process.env.INPUT_GITHUB_TOKEN = 'fake-token';
process.env.INPUT_MAX_COMMENTS = '100';

// ============================================================================
// Mock GitHub Functions for Tool Testing
// ============================================================================

// Mock getIssueOrPRThread to provide fake issue data for tool testing
let mockGetIssueOrPRThread: ReturnType<typeof mock> | undefined;
// Mock createPullRequest to provide fake PR data for tool testing
let mockCreatePullRequest: ReturnType<typeof mock> | undefined;

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Validate and return E2E test environment variables.
 * @throws {Error} If required environment variables are missing.
 */
function validateE2EEnvVars() {
  const token = Bun.env.E2E_TOKEN;
  const provider = Bun.env.E2E_PROVIDER;
  const model = Bun.env.E2E_MODEL;

  if (!token) {
    throw new Error('E2E_TOKEN environment variable is required for E2E tests');
  }
  if (!provider) {
    throw new Error('E2E_PROVIDER environment variable is required for E2E tests');
  }
  if (!model) {
    throw new Error('E2E_MODEL environment variable is required for E2E tests');
  }

  return { token, provider, model };
}

/**
 * Set up default mocks for the github/index module.
 * Can be overridden by individual tests for specific tool testing.
 */
function setupDefaultGithubMocks() {
  mock.module('../../src/github/index', () => ({
    getPrompt: mock(async () => 'Test prompt'),
    createFinalComment: mock(async () => {}),
    addReaction: mock(async () => ({ data: { id: 123 } })),
    deleteReaction: mock(async () => {}),
    getStartTimeFromContext: mock(() => undefined),
    getIssueOrPRThread: mockGetIssueOrPRThread ?? mock(async () => undefined),
    createPullRequest:
      mockCreatePullRequest ??
      mock(async () => ({ number: 1, html_url: 'https://github.com/test/pr/1' })),
    updatePullRequest: mock(async () => ({ number: 1 })),
    setCoreAdapter: mock(() => {}),
    getCoreAdapter: mock(() => mockCoreAdapter),
    CANCELLATION_MESSAGE_CREATE_PR: 'Cancelled',
    CANCELLATION_MESSAGE_GET_THREAD: 'Cancelled',
    CANCELLATION_MESSAGE_UPDATE_PR: 'Cancelled',
  }));
}

/**
 * Create a new Agent instance with the test configuration.
 */
async function createAgent(): Promise<Agent> {
  const { provider, model, token } = validateE2EEnvVars();
  const { Agent } = await import('../../src/pi/agent.js');
  return new Agent(model, provider, token, 'off', mockCoreAdapter);
}

// ============================================================================
// E2E Tests
// ============================================================================

describe('E2E: Real Pi Agent with Mocked GitHub', () => {
  let skipTests = false;

  beforeEach(() => {
    // Skip if E2E tests are not enabled
    skipTests = Bun.env.RUN_E2E_TESTS !== '1';
    if (skipTests) {
      return;
    }

    // Set up default github mocks
    setupDefaultGithubMocks();

    // Reset tool-specific mocks
    mockGetIssueOrPRThread = undefined;
    mockCreatePullRequest = undefined;
  });

  test(
    'runs minimal prompt without tool calling',
    async () => {
      if (skipTests) {
        return;
      }

      const agent = await createAgent();
      await agent.ready();
      const { result, sessionStats } = await agent.run('Say "hello world"');

      expect(result).toBeTruthy();
      expect(result).toMatch(/hello world/i);
      expect(sessionStats).toBeDefined();
      expect(sessionStats?.totalTokens).toBeGreaterThan(0);
    },
    { timeout: 60_000 }
  );

  test(
    'handles simple arithmetic prompt without tools',
    async () => {
      if (skipTests) {
        return;
      }

      const agent = await createAgent();
      await agent.ready();
      const { result, sessionStats } = await agent.run(
        'What is 2 + 2? Answer with just the number.'
      );

      expect(result).toBeTruthy();
      expect(result).toMatch(/4/);
      expect(sessionStats).toBeDefined();
      expect(sessionStats?.totalTokens).toBeGreaterThan(0);
    },
    { timeout: 60_000 }
  );

  test('invalid model throws during constructor', async () => {
    if (skipTests) {
      return;
    }

    const { token, provider } = validateE2EEnvVars();
    const { Agent } = await import('../../src/pi/agent.js');

    expect(() => {
      new Agent('invalid-model-xyz', provider, token, 'off', mockCoreAdapter);
    }).toThrow('Model not found');
  });

  test(
    'empty prompt throws from run method',
    async () => {
      if (skipTests) {
        return;
      }

      const agent = await createAgent();
      await agent.ready();

      await expect(agent.run('')).rejects.toThrow('no text, skipping prompt');
      await expect(agent.run(undefined as unknown as string)).rejects.toThrow(
        'no text, skipping prompt'
      );
    },
    { timeout: 60_000 }
  );

  test(
    'agent can be called multiple times after ready',
    async () => {
      if (skipTests) {
        return;
      }

      const agent = await createAgent();
      await agent.ready();

      const result1 = await agent.run('Say "one"');
      const result2 = await agent.run('Say "two"');

      expect(result1.result).toMatch(/one/i);
      expect(result2.result).toMatch(/two/i);
      expect(result1.sessionStats).toBeDefined();
      expect(result2.sessionStats).toBeDefined();
    },
    { timeout: 120_000 }
  );

  test(
    'when valid credentials are provided, test connects successfully',
    async () => {
      if (skipTests) {
        return;
      }

      const agent = await createAgent();
      expect(agent).toBeDefined();
      await agent.ready();
      const { result } = await agent.run('Hi');
      expect(result).toBeTruthy();
    },
    { timeout: 60_000 }
  );

  test(
    'session includes version from logging module',
    async () => {
      if (skipTests) {
        return;
      }

      const agent = await createAgent();
      await agent.ready();
      const { sessionStats } = await agent.run('Say "test"');

      expect(sessionStats).toBeDefined();
      expect(sessionStats?.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(sessionStats?.version.length).toBeGreaterThan(0);
    },
    { timeout: 60_000 }
  );

  test(
    'agent can use get_issue_or_pr_thread tool with mocked GitHub API',
    async () => {
      if (skipTests) {
        return;
      }

      // Mock getIssueOrPRThread to return fake issue data
      mockGetIssueOrPRThread = mock(async () => ({
        number: 42,
        title: 'Test Issue with Tools',
        body: 'This is a test issue for tool calling.',
        state: 'open',
        author: 'testuser',
        author_type: 'user',
        created_at: '2025-01-15T10:30:00Z',
        updated_at: '2025-01-15T10:30:00Z',
        closed_at: undefined,
        merged_at: undefined,
        labels: ['bug', 'enhancement'],
        is_pull_request: false,
        head_branch: undefined,
        base_branch: undefined,
        head_sha: undefined,
        comments: [
          {
            id: 1,
            author: 'commenter1',
            author_type: 'user',
            created_at: '2025-01-15T11:00:00Z',
            body: 'First comment',
            is_triggering_comment: false,
          },
        ],
      }));

      // Re-setup github mocks with the custom mock
      setupDefaultGithubMocks();

      const agent = await createAgent();
      await agent.ready();

      const { result } = await agent.run(
        'Please use the get_issue_or_pr_thread tool to fetch information about issue #42 in the test-owner/test-repo repository. Summarize what you find.'
      );

      expect(result).toBeTruthy();
      expect(mockGetIssueOrPRThread).toHaveBeenCalled();
      expect(result).toMatch(/Test Issue with Tools|issue.*42|testowner|test-repo/i);
    },
    { timeout: 60_000 }
  );

  test(
    'agent can use create_pull_request tool with mocked GitHub API',
    async () => {
      if (skipTests) {
        return;
      }

      // Mock createPullRequest to return fake PR data
      mockCreatePullRequest = mock(async () => ({
        content: [
          {
            type: 'text' as const,
            text: 'Pull request #123 created: https://github.com/test-owner/test-repo/pull/123',
          },
        ],
        details: {
          pullRequestNumber: 123,
          pullRequestUrl: 'https://github.com/test-owner/test-repo/pull/123',
          headBranch: 'pi-123-1234567890',
          baseBranch: 'main',
          dryRun: false,
        },
      }));

      // Re-setup github mocks with the custom mock
      setupDefaultGithubMocks();

      const agent = await createAgent();
      await agent.ready();

      const { result } = await agent.run(
        'Please use the create_pull_request tool to create a PR with the title "Fix bug in authentication" and a description that says "This fixes the login issue."'
      );

      expect(result).toBeTruthy();
      expect(mockCreatePullRequest).toHaveBeenCalled();
      expect(mockCreatePullRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Fix bug in authentication'),
          body: expect.stringContaining('This fixes the login issue.'),
        })
      );
      expect(result).toMatch(/pull request.*123|created|https:\/\/github/i);
    },
    { timeout: 60_000 }
  );
});
