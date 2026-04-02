import { describe, expect, test } from 'bun:test';
import { truncateText, getVersion } from '../../src/pi/logging';

describe('truncateText', () => {
  test('returns text unchanged when shorter than maxLength', () => {
    const text = 'Short text';
    const result = truncateText(text, 100);
    expect(result).toBe(text);
  });

  test('returns text unchanged when exactly maxLength', () => {
    const text = 'Exactly twenty chars';
    const result = truncateText(text, 20);
    expect(result).toBe(text);
  });

  test('truncates text longer than maxLength', () => {
    const text = 'This is a much longer text that exceeds the maximum length';
    const result = truncateText(text, 20);
    expect(result.length).toBeLessThanOrEqual(24); // 20 + '...' = 23, but may be more if word boundary
    expect(result).toContain('...');
  });

  test('preserves word boundaries when truncating', () => {
    const text = 'This is a longer text that should be truncated at a word boundary';
    const result = truncateText(text, 30);
    expect(result.endsWith('...')).toBe(true);
    // Should not cut off in the middle of a word unless necessary
    const beforeEllipsis = result.slice(0, -3);
    // The function truncates at the last space if it's within 80% of maxLength
    expect(beforeEllipsis).toBe('This is a longer text that');
  });

  test('truncates mid-word if word boundary too far back', () => {
    const text = 'ThisIsAVeryLongWordWithoutSpacesThatShouldBeTruncatedMidWord';
    const result = truncateText(text, 20);
    expect(result.endsWith('...')).toBe(true);
    const beforeEllipsis = result.slice(0, -3);
    // With such a long word, it won't find a space in the last 20% (4 chars)
    expect(beforeEllipsis.length).toBe(20);
  });

  test('handles empty string', () => {
    const result = truncateText('', 100);
    expect(result).toBe('');
  });

  test('handles whitespace-only text', () => {
    const text = '   ';
    const result = truncateText(text, 100);
    expect(result).toBe(text);
  });

  test('handles text shorter than maxLength word boundary threshold', () => {
    const text = 'Short';
    const result = truncateText(text, 100);
    expect(result).toBe(text);
  });

  test('handles maxLength of 1', () => {
    const text = 'Hello';
    const result = truncateText(text, 1);
    expect(result.length).toBeGreaterThan(1); // At least '...'
    expect(result).toContain('...');
  });
});

describe('getVersion', () => {
  test('returns unknown when __PI_CODING_AGENT_VERSION__ is not defined', () => {
    // The global constant is only available at build time
    // In tests, it will be undefined, so we expect 'unknown'
    const result = getVersion();
    expect(result).toBe('unknown');
  });
});
