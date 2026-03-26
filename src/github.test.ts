import { describe, expect, test, mock, beforeEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Swallow ::notice:: / ::warning:: / ::debug:: annotations from @actions/core
// so they don't appear as CI annotations in test output.
const realStdoutWrite = process.stdout.write.bind(process.stdout);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mockedWrite = mock((...args: any[]) => {
  const msg = String(args[0] ?? '');
  if (msg.startsWith('::')) {
    return true; // swallow annotations
  }
  return realStdoutWrite(...args);
});
// @ts-expect-error -- stdout.write is readonly, we override for tests
process.stdout.write = _mockedWrite;

// Mock @actions/core to suppress info/debug/notice/warning logging
const noop = (): void => {};
mock('@actions/core', () => ({
  getInput: mock(() => '/pi'),
  notice: mock(noop),
  info: mock(noop),
  debug: mock(noop),
  setFailed: mock(noop),
  warning: mock(noop),
}));

// Set env vars BEFORE importing github.ts (it runs module-level side effects)
process.env.INPUT_TRIGGER = '/pi';
process.env.INPUT_GITHUB_TOKEN = 'fake-token';
process.env.GITHUB_REPOSITORY = 'test-owner/test-repo';
process.env.GITHUB_EVENT_PATH = path.join(os.tmpdir(), `gh-event-${Date.now()}.json`);
fs.writeFileSync(process.env.GITHUB_EVENT_PATH, '{}');

const { getComment, createFinalComment } = await import('./github');
import * as github from '@actions/github';

describe('getComment', () => {
  beforeEach(() => {
    github.context.payload = {};
  });

  test('returns undefined when no comment in payload', async () => {
    const result = await getComment();
    expect(result).toBeUndefined();
  });

  test('strips trigger from comment body and trims', async () => {
    const originalBody = 'Please review this PR';
    github.context.payload = {
      comment: { id: 1, body: `/pi ${originalBody}` },
    };

    const result = await getComment();
    expect(result).toBeDefined();
    expect(result!.body).toBe(originalBody);
  });

  test('strips trigger without trailing space', async () => {
    github.context.payload = {
      comment: { id: 2, body: '/piFix this bug' },
    };

    const result = await getComment();
    expect(result).toBeDefined();
    expect(result!.body).toBe('Fix this bug');
  });

  test('trims whitespace from result', async () => {
    github.context.payload = {
      comment: { id: 3, body: '/pi   lots of spaces   ' },
    };

    const result = await getComment();
    expect(result).toBeDefined();
    expect(result!.body).toBe('lots of spaces');
  });

  test('returns empty string when trigger is entire comment body', async () => {
    github.context.payload = {
      comment: { id: 5, body: '/pi' },
    };

    const result = await getComment();
    expect(result).toBeDefined();
    expect(result!.body).toBe('');
  });

  test('returns body with default trigger when INPUT_TRIGGER is /pi', async () => {
    github.context.payload = {
      comment: { id: 6, body: '/pi hello world' },
    };

    const result = await getComment();
    expect(result).toBeDefined();
    expect(result!.body).toBe('hello world');
  });
});

describe('createFinalComment', () => {
  beforeEach(() => {
    github.context.payload = {};
  });

  test('returns undefined for empty body', async () => {
    const result = await createFinalComment('');
    expect(result).toBeUndefined();
  });
});
