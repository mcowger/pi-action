import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { join } from 'node:path';

export async function buildDist(cwd: string = process.cwd()): Promise<void> {
  const version = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8')).version;
  const piVersion = JSON.parse(
    readFileSync(join(cwd, 'node_modules/@mariozechner/pi-coding-agent/package.json'), 'utf-8')
  ).version;

  await build({
    entryPoints: [join(cwd, 'src/run.ts')],
    bundle: true,
    platform: 'node',
    target: 'node24',
    outfile: join(cwd, 'dist/index.js'),
    format: 'cjs',
    minify: true,
    define: {
      'import.meta.url': 'importMetaUrl',
      __PI_CODING_AGENT_VERSION__: JSON.stringify(piVersion),
      __VERSION__: JSON.stringify(version),
    },
    inject: [join(cwd, 'src/import-meta-url.js')],
  });
}

// If run directly, execute the build
// Bun sets isMain property on the module
// @ts-ignore - Bun runtime property
if (import.meta.main || process.argv[1].endsWith('/package.ts')) {
  buildDist().catch(error => {
    console.error('Build failed:', error);
    process.exit(1);
  });
}
