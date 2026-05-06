/**
 * @file Shared constants used across the GitHub platform module.
 */

// Reaction types
export const REACTION_TYPE_EYES = 'eyes' as const;

// Validation constants
export const MAX_TITLE_LENGTH = 255;

// Branch naming patterns
export const BRANCH_PREFIX = 'pi/issue' as const;

// Default trigger string
export const DEFAULT_TRIGGER = '/pi';

// GitHub max comments limit
export const MAX_COMMENTS = 100;

// GitHub max review comments limit for PR thread
export const MAX_REVIEW_COMMENTS = 50;

// GitHub max diff lines before truncation
export const MAX_DIFF_LINES = 1000;
