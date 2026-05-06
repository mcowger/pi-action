/**
 * Tests for GitHub platform provider.
 *
 * Tests provider creation, and the public API surface.
 */

import { describe, expect, test, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Swallow ::notice:: / ::warning:: / ::debug:: annotations
const realStdoutWrite = process.stdout.write.bind(process.stdout);
const _mockedWrite = mock((...args: unknown[]) => {
  const msg = String(args[0] ?? '');
  if (msg.startsWith('::')) {
    return true;
  }
  return realStdoutWrite(...(args as Parameters<typeof process.stdout.write>));
});
process.stdout.write = _mockedWrite as typeof process.stdout.write;

// Mock @actions/core
const noop = (): void => {};
mock.module('@actions/core', () => ({
  getInput: mock(() => ''),
  notice: mock(noop),
  info: mock(noop),
  debug: mock(noop),
  setFailed: mock(noop),
  setOutput: mock(noop),
  warning: mock(noop),
}));

// Mock @actions/github context
const mockContext = {
  repo: {
    owner: 'test-owner',
    repo: 'test-repo',
  },
  issue: {
    number: 123,
  },
  serverUrl: 'https://github.com',
  runId: 123456789,
  eventName: 'issue_comment',
  payload: {} as Record<string, unknown>,
};
mock.module('@actions/github', () => ({
  context: mockContext,
}));

// Set env vars before importing modules
process.env.INPUT_GITHUB_TOKEN = 'fake-token';
process.env.GITHUB_REPOSITORY = 'test-owner/test-repo';
process.env.GITHUB_EVENT_PATH = path.join(os.tmpdir(), `gh-event-platform-${Date.now()}.json`);
fs.writeFileSync(process.env.GITHUB_EVENT_PATH, JSON.stringify({}));

// Import after mocks are set up
import type { PlatformProvider } from '../../../src/platform/types';
import { createPlatformProvider } from '../../../src/platform/github/provider';

describe('createPlatformProvider', () => {
  test('returns a PlatformProvider', () => {
    const provider = createPlatformProvider();
    expect(provider).toBeDefined();
    expect(typeof provider.addReaction).toBe('function');
    expect(typeof provider.deleteReaction).toBe('function');
    expect(typeof provider.createFinalComment).toBe('function');
    expect(typeof provider.getPrompt).toBe('function');
    expect(typeof provider.getStartTime).toBe('function');
    expect(typeof provider.createPullRequest).toBe('function');
    expect(typeof provider.updatePullRequest).toBe('function');
    expect(typeof provider.getIssueOrPRThread).toBe('function');
  });

  test('returns a valid context via getContext', () => {
    process.env.GITHUB_SERVER_URL = 'https://github.com';
    const provider = createPlatformProvider();
    const ctx = provider.getContext();
    expect(ctx.repo.owner).toBe('test-owner');
    expect(ctx.repo.repo).toBe('test-repo');
    expect(ctx.issue.number).toBe(123);
  });
});

describe('PlatformProvider interface compliance', () => {
  test('provider implements all required methods', () => {
    process.env.GITHUB_SERVER_URL = 'https://github.com';
    const provider = createPlatformProvider();

    const requiredMethods: (keyof PlatformProvider)[] = [
      'addReaction',
      'deleteReaction',
      'createFinalComment',
      'getPrompt',
      'getStartTime',
      'createPullRequest',
      'updatePullRequest',
      'getIssueOrPRThread',
      'getContext',
    ];

    for (const method of requiredMethods) {
      expect(typeof provider[method]).toBe('function');
    }
  });
});
