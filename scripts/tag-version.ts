#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import fs from 'node:fs';
import * as git from 'isomorphic-git';
import { join } from 'node:path';

function readVersionFile(): string {
  const versionPath = join(process.cwd(), 'VERSION');

  if (!fs.existsSync(versionPath)) {
    console.error('Error: VERSION file not found in project root');
    console.error('Expected file: ./VERSION (e.g., containing "1.2.3")');
    process.exit(1);
  }

  const version = readFileSync(versionPath, 'utf-8').trim();

  return version;
}

function validateVersion(version: string): string {
  // Validate semver format (X.Y.Z) - no 'v' prefix expected
  const semverRegex = /^\d+\.\d+\.\d+$/;
  if (!semverRegex.test(version)) {
    console.error(
      `Error: Invalid version format "${version}". Expected format: 1.2.3 (no 'v' prefix)`
    );
    process.exit(1);
  }

  return version;
}

function updatePackageJson(version: string): void {
  const packagePath = join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

  packageJson.version = version;
  writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
}

async function createGitTag(tag: string): Promise<void> {
  try {
    const dir = process.cwd();
    const oid = await git.resolveRef({ fs, dir, ref: 'HEAD' });

    await git.tag({
      fs,
      dir,
      ref: tag,
      object: oid,
    });
  } catch (error) {
    console.error('Error: Failed to create git tag', error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  console.log('Reading version from ./VERSION...');
  const version = validateVersion(readVersionFile());
  const tag = `v${version}`;

  console.log(`Updating package.json version to ${version}...`);
  updatePackageJson(version);
  console.log(`✓ Version updated to ${version}`);

  console.log(`Creating git tag ${tag}...`);
  await createGitTag(tag);
  console.log(`✓ Git tag ${tag} created (targeting HEAD)`);

  console.log('\nNext steps:');
  console.log(`  git commit -am "Release ${tag}"`);
  console.log('  git push && git push --tags');
}

main();
