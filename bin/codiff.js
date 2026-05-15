#!/usr/bin/env node

import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const subcommand = process.argv[2];

let additionalData = {};
let launchPath = process.cwd();

if (subcommand === 'add') {
  const target = process.argv[3] || process.cwd();
  process.env.CODIFF_CLI_COMMAND = 'add';
  process.env.CODIFF_CLI_PATH = target;
  launchPath = target;
} else if (['restart', 'kill'].includes(subcommand)) {
  // handled below
} else {
  launchPath = process.argv[2] || process.cwd();
}

const killCodiff = () => {
  try {
    execSync('pkill -9 -f "Electron.*codiff" 2>/dev/null || true');
  } catch {}
};

if (subcommand === 'kill') {
  killCodiff();
  console.log('Codiff instances killed.');
  process.exit(0);
}

if (subcommand === 'restart') {
  killCodiff();
}

if (!existsSync(resolve(root, 'dist/index.html')) && !process.env.ELECTRON_RENDERER_URL) {
  console.error('Codiff has not been built yet. Run `pnpm build` first.');
  process.exit(1);
}

const child = spawn(electron, [root], {
  env: {
    ...process.env,
    CODIFF_REPOSITORY_PATH: launchPath,
  },
  detached: true,
  stdio: 'ignore',
});

child.unref();

if (subcommand === 'add') {
  console.log(`Added ${launchPath} to Codiff.`);
} else if (subcommand === 'restart') {
  console.log('Codiff restarted.');
} else {
  console.log('Codiff launched.');
}
