import { describe, expect, test, mock, beforeEach } from 'bun:test';
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

const noop = (): void => {};
const mockGetInput = mock((name: string) => {
  if (name === 'github_token') {
    return 'fake-token';
  }
  if (name === 'prompt') {
    return '';
  }
  if (name === 'trigger') {
    return '/pi';
  }
  return '';
});

const testCoreAdapter = {
  getInput: mockGetInput,
  setFailed: mock(noop),
  setOutput: mock(noop),
  notice: mock(noop),
  info: mock(noop),
  debug: mock(noop),
  warning: mock(noop),
};

mock.module('@actions/core', () => ({
  getInput: mockGetInput,
  notice: mock(noop),
  info: mock(noop),
  debug: mock(noop),
  setFailed: mock(noop),
  setOutput: mock(noop),
  warning: mock(noop),
}));

import * as github from '@actions/github';

process.env.INPUT_TRIGGER = '/pi';
process.env.INPUT_GITHUB_TOKEN = 'fake-token';
process.env.GITHUB_REPOSITORY = 'test-owner/test-repo';
process.env.GITHUB_EVENT_PATH = path.join(os.tmpdir(), `gh-event-${Date.now()}.json`);
fs.writeFileSync(process.env.GITHUB_EVENT_PATH, '{}');

const githubModule = import('../../../src/platform/github/index.js');
const contextModule = import('../../../src/platform/github/context.js');
const [githubExports, contextExports] =
  // @ts-expect-error TS1309 -- Bun test runner handles top-level await
  await Promise.all([githubModule, contextModule]);

const { setCoreAdapter } = githubExports;
setCoreAdapter(testCoreAdapter);

const { getPrompt, createFinalComment } = githubExports;
const { getIssueOrPullRequestContext, isPR, getContextType, getStartTimeFromContext } =
  contextExports;

function setPayload(payload: Record<string, unknown>, eventName = 'issue_comment') {
  github.context.payload = payload;
  github.context.eventName = eventName;
}

describe('getPrompt', () => {
  beforeEach(() => setPayload({}));

  test('returns undefined when no comment in payload', async () => {
    expect(await getPrompt()).toBeUndefined();
  });

  test('enriches comment with issue/PR context', async () => {
    setPayload({
      comment: { id: 1, body: '/pi Review this' },
      issue: { number: 42, title: 'Test Issue', body: 'Test description' },
    });
    const result = await getPrompt();
    expect(result).toContain('Issue/PR #42: Test Issue');
    expect(result).toContain('Test description');
    expect(result).toContain('Review this');
    expect(result).not.toContain('/pi');
  });

  test('handles pull_request_review events', async () => {
    setPayload(
      { review: { id: 99, body: '/pi Looks good' }, pull_request: { number: 55, title: 'Feature' } },
      'pull_request_review'
    );
    const result = await getPrompt();
    expect(result).toContain('Issue/PR #55: Feature');
    expect(result).toContain('Looks good');
    expect(result).not.toContain('/pi');
  });

  test('returns undefined for pull_request_review with empty/null body', async () => {
    setPayload(
      { review: { id: 99, body: null }, pull_request: { number: 55, title: 'PR' } },
      'pull_request_review'
    );
    expect(await getPrompt()).toBeUndefined();
  });

  test('uses prompt input when provided, enriches with context', async () => {
    setPayload({ issue: { number: 42, title: 'Test', body: 'Desc' } });
    const result = await getPrompt('Review this code');
    expect(result).toContain('Instruction:');
    expect(result).toContain('Review this code');
    expect(result).toContain('Issue/PR #42: Test');
  });

  test('prompt input without context returns as-is', async () => {
    expect(await getPrompt('Hello world')).toBe('Hello world');
  });

  test('returns undefined for empty/whitespace prompt input', async () => {
    expect(await getPrompt('   ')).toBeUndefined();
  });
});

describe('createFinalComment', () => {
  test('returns undefined for empty body', async () => {
    expect(await createFinalComment('')).toBeUndefined();
  });
});

describe('isPR / getContextType / getIssueOrPullRequestContext', () => {
  test('isPR: true for PR events, false for issues', () => {
    setPayload({});
    expect(isPR()).toBe(false);

    setPayload({ pull_request: { number: 123 } });
    expect(isPR()).toBe(true);

    github.context.eventName = 'pull_request';
    github.context.payload = {};
    expect(isPR()).toBe(true);
  });

  test('getContextType: returns correct type based on event', () => {
    setPayload({});
    expect(getContextType()).toBe('issue');

    setPayload({ pull_request: { number: 1 } });
    expect(getContextType()).toBe('pull_request');

    github.context.eventName = 'push';
    github.context.payload = {};
    expect(getContextType()).toBeUndefined();
  });

  test('getIssueOrPullRequestContext: extracts issue context correctly', () => {
    setPayload({ issue: { number: 42, title: 'Bug', body: 'Details' } });
    expect(getIssueOrPullRequestContext()).toEqual({ number: 42, title: 'Bug', body: 'Details' });

    setPayload({ issue: { number: 99, title: 'No body' } });
    expect(getIssueOrPullRequestContext()).toEqual({ number: 99, title: 'No body' });

    setPayload({ issue: { number: 1 } });
    expect(getIssueOrPullRequestContext()).toBeUndefined();
  });

  test('getIssueOrPullRequestContext: extracts PR context', async () => {
    setPayload({ pull_request: { number: 5, title: 'Fix', body: 'Desc' } }, 'pull_request');
    expect(getIssueOrPullRequestContext()).toEqual({ number: 5, title: 'Fix', body: 'Desc' });

    setPayload(
      { review: { id: 1 }, pull_request: { number: 10, title: 'PR' } },
      'pull_request_review'
    );
    expect(getIssueOrPullRequestContext()).toEqual({ number: 10, title: 'PR' });
  });
});

describe('getStartTimeFromContext', () => {
  beforeEach(() => setPayload({}));

  function expectTime(ts: string, eventName: string, payload: Record<string, unknown>) {
    setPayload(payload, eventName);
    expect(getStartTimeFromContext()?.toString()).toBe(ts);
  }

  test('extracts timestamps for all supported event types', () => {
    expectTime('2024-01-15T10:30:00Z', 'issue_comment', {
      comment: { id: 1, created_at: '2024-01-15T10:30:00Z' },
    });
    expectTime('2024-01-15T10:30:00Z', 'issues', {
      issue: { number: 1, updated_at: '2024-01-15T10:30:00Z' },
    });
    expectTime('2024-01-15T10:30:00Z', 'pull_request', {
      pull_request: { number: 1, updated_at: '2024-01-15T10:30:00Z' },
    });
    expectTime('2024-06-01T12:00:00Z', 'pull_request_review', {
      review: { id: 1, submitted_at: '2024-06-01T12:00:00Z' },
      pull_request: { number: 10 },
    });
    expectTime('2024-07-15T08:30:00Z', 'pull_request_review_comment', {
      comment: { id: 1, created_at: '2024-07-15T08:30:00Z' },
      pull_request: { number: 20 },
    });
  });

  test('returns undefined for missing timestamps or unknown events', () => {
    setPayload({ comment: { id: 1 } }, 'issue_comment');
    expect(getStartTimeFromContext()).toBeUndefined();

    setPayload({}, 'push');
    expect(getStartTimeFromContext()).toBeUndefined();
  });
});
