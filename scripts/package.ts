import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const version = readFileSync('VERSION', 'utf-8').trim();
const piVersion = JSON.parse(
  readFileSync('node_modules/@mariozechner/pi-coding-agent/package.json', 'utf-8')
).version;

await build({
  entryPoints: ['src/run.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  outfile: 'dist/index.js',
  format: 'cjs',
  minify: true,
  define: {
    'import.meta.url': 'importMetaUrl',
    __PI_CODING_AGENT_VERSION__: JSON.stringify(piVersion),
    __VERSION__: JSON.stringify(version),
  },
  inject: ['src/import-meta-url.js'],
});
