/**
 * @file Pi module barrel export.
 *
 * Re-exports the main Client class and extension factory from sub-modules so
 * that consumers can import from `./pi` in a single statement.
 */

// Main client
export { Client } from './client.js';

// Extension factory for registering custom tools
export { extensionsFactory } from './tools/index.js';

// Resource loader
export { getResourceLoader } from './resource-loader.js';
