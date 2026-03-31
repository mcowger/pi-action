/**
 * @file Git utilities barrel export.
 *
 * Re-exports all public APIs for backward compatibility and convenience.
 */

// Types and utilities
export type { FileMode } from './types';
export { createLogger } from './types';

// File scanner
export type { ChangeScanResult } from './file-scanner';
export { buildFileMap, scanForChanges, scanDirectory } from './file-scanner';

// Tree builder
export { createBlobsAndTree } from './tree-builder';

// Commit creator
export { createCommitAndUpdateBranch } from './commit-creator';
