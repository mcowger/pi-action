/**
 * Tests for parsePromptDirectives utility.
 */

import { describe, expect, test } from 'bun:test';
import { parsePromptDirectives } from '../src/prompt-directives';

describe('parsePromptDirectives', () => {
  describe('model directive', () => {
    test('parses provider/model format', () => {
      const { prompt, directives } = parsePromptDirectives(
        'model: anthropic/claude-sonnet-4-6\nFix the bug'
      );
      expect(directives.model).toEqual({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
      });
      expect(prompt).toBe('Fix the bug');
    });

    test('parses bare model name (no provider)', () => {
      const { prompt, directives } = parsePromptDirectives(
        'model: claude-sonnet-4-6\nFix the bug'
      );
      expect(directives.model).toEqual({ model: 'claude-sonnet-4-6' });
      expect(directives.model?.provider).toBeUndefined();
      expect(prompt).toBe('Fix the bug');
    });

    test('strips directive line from prompt', () => {
      const { prompt } = parsePromptDirectives(
        'model: openai/gpt-4o\nPlease review this code'
      );
      expect(prompt).not.toContain('model:');
      expect(prompt).toContain('Please review this code');
    });

    test('handles directive on its own line at end of prompt', () => {
      const { prompt, directives } = parsePromptDirectives(
        'Fix the bug\nmodel: google/gemini-2.5-pro'
      );
      expect(directives.model).toEqual({
        provider: 'google',
        model: 'gemini-2.5-pro',
      });
      expect(prompt).toBe('Fix the bug');
    });

    test('handles directive in the middle of prompt', () => {
      const { prompt, directives } = parsePromptDirectives(
        'Please review\nmodel: anthropic/claude-sonnet-4-6\nthis PR'
      );
      expect(directives.model).toEqual({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
      });
      expect(prompt).toContain('Please review');
      expect(prompt).toContain('this PR');
      expect(prompt).not.toContain('model:');
    });

    test('is case-insensitive for directive key', () => {
      const { directives } = parsePromptDirectives('Model: anthropic/claude-sonnet-4-6\ntest');
      expect(directives.model).toEqual({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
      });
    });

    test('handles extra whitespace around colon and value', () => {
      const { directives } = parsePromptDirectives('model:   anthropic/claude-sonnet-4-6  \ntest');
      // The regex captures \S+ so trailing spaces won't be in the value
      expect(directives.model).toEqual({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
      });
    });

    test('allows leading whitespace on directive line (tabs/spaces)', () => {
      const { directives } = parsePromptDirectives('  model: anthropic/claude-sonnet-4-6\ntest');
      expect(directives.model).toEqual({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
      });
    });

    test('last model directive wins when multiple are present', () => {
      const { directives } = parsePromptDirectives(
        'model: anthropic/claude-sonnet-4-6\nmodel: openai/gpt-4o\ntest'
      );
      expect(directives.model).toEqual({
        provider: 'openai',
        model: 'gpt-4o',
      });
    });

    test('returns no directives when none present', () => {
      const { prompt, directives } = parsePromptDirectives('/pi Fix the bug');
      expect(directives.model).toBeUndefined();
      expect(prompt).toBe('/pi Fix the bug');
    });

    test('does not match model: in the middle of a word', () => {
      const { prompt, directives } = parsePromptDirectives(
        'Please use the model:config pattern'
      );
      // "model:config" without a space after colon should NOT match our regex
      // because the regex requires a space/tab after "model:" — but let's check
      // Actually, "model:config" would match if the regex allows `model:\S+`
      // Let me re-check: the regex is `model:[ \t]+(\S+)` so it requires at least
      // one space/tab after the colon. "model:config" has no space, so it won't match.
      expect(directives.model).toBeUndefined();
      expect(prompt).toContain('model:config');
    });

    test('does not match inline model: that is not at start of line', () => {
      const { directives } = parsePromptDirectives(
        'Use model: anthropic/claude-sonnet-4-6 for this task'
      );
      // "Use model:" is not at start of line, so it should not be treated as a directive
      expect(directives.model).toBeUndefined();
    });

    test('handles provider with hyphens (e.g. google-genai)', () => {
      const { directives } = parsePromptDirectives(
        'model: google-genai/gemini-2.5-pro\ntest'
      );
      expect(directives.model).toEqual({
        provider: 'google-genai',
        model: 'gemini-2.5-pro',
      });
    });

    test('handles model with dots and hyphens', () => {
      const { directives } = parsePromptDirectives(
        'model: openai/gpt-4.1-mini\ntest'
      );
      expect(directives.model).toEqual({
        provider: 'openai',
        model: 'gpt-4.1-mini',
      });
    });

    test('ignores empty model value', () => {
      const { directives } = parsePromptDirectives('model:\ntest');
      // "model:" followed by newline doesn't match the regex (\S+ requires non-whitespace)
      expect(directives.model).toBeUndefined();
    });

    test('collapses excessive blank lines after directive removal', () => {
      const { prompt } = parsePromptDirectives(
        'Line 1\nmodel: anthropic/claude-sonnet-4-6\n\n\n\nLine 2'
      );
      // Should not have 3+ consecutive newlines
      expect(prompt).not.toMatch(/\n{3,}/);
      expect(prompt).toContain('Line 1');
      expect(prompt).toContain('Line 2');
    });
  });
});
