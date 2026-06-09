#!/usr/bin/env node

import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import packageJson from '../package.json' with { type: 'json' };
import { formatHelpText, parseArguments, resolvePullRequestUrl } from './arguments.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The renderer is the built dist/ by default. When Codiff's own Vite dev server
// is running, use it instead so source edits hot-reload without a rebuild. The
// server is VERIFIED to identify as Codiff before it's trusted — 5173 is a
// common dev port, so "something is listening" is never enough on its own.
const DEV_SERVER_URL = process.env.CODIFF_DEV_SERVER_URL || 'http://127.0.0.1:5173';

const looksLikeCodiff = (body) =>
  body.includes('<title>Codiff</title>') && body.includes('/src/index.tsx');

/** Resolve to the dev-server URL when it is up and serving Codiff, else `null`. */
const detectDevServer = (url) =>
  new Promise((resolveProbe) => {
    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolveProbe(value ? url : null);
      }
    };

    let target;
    try {
      target = new URL(url);
    } catch {
      finish(false);
      return;
    }

    const request = (target.protocol === 'https:' ? https : http).get(target, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        finish(false);
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
        if (body.length > 65_536) {
          response.destroy();
        }
      });
      response.on('end', () => finish(looksLikeCodiff(body)));
      response.on('close', () => finish(looksLikeCodiff(body)));
    });
    request.setTimeout(800, () => {
      request.destroy();
      finish(false);
    });
    request.on('error', () => finish(false));
  });

// Assemble the narrative walkthrough authoring guide: the prose, then the live
// schema object serialized inline (single-sourced from the validator — no copy).
const buildWalkthroughGuide = () => {
  const require = createRequire(import.meta.url);
  const { narrativeWalkthroughSchema } = require(
    resolve(root, 'electron/narrative-walkthrough.cjs'),
  );
  const guide = readFileSync(resolve(root, 'bin/walkthrough-guide.md'), 'utf8').trimEnd();
  return `${guide}\n\n\`\`\`json\n${JSON.stringify(narrativeWalkthroughSchema, null, 2)}\n\`\`\`\n`;
};

// Force-quit every running Codiff window. Matched by the Electron process name
// so it never touches other Electron apps.
const killCodiff = () => {
  try {
    execSync('pkill -9 -f "Electron.*codiff" 2>/dev/null || true');
  } catch {
    // pkill exits non-zero when nothing matched — that's fine.
  }
};

const run = async () => {
  let args = process.argv.slice(2);
  const subcommand = args[0];

  // Fork subcommands layered on top of the normal launcher:
  //   codiff kill     — force-quit all instances
  //   codiff restart  — kill, then relaunch
  //   codiff add [p]  — add a repo to the running instance's sidebar (or launch)
  let cliCommand = '';
  let cliPath = '';
  if (subcommand === 'kill' || subcommand === 'restart') {
    killCodiff();
    if (subcommand === 'kill') {
      process.stdout.write('Codiff instances killed.\n');
      return;
    }
    args = args.slice(1);
  } else if (subcommand === 'add') {
    cliCommand = 'add';
    cliPath = resolve(args[1] || process.cwd());
    args = args.slice(1);
  }

  const parsedArguments = parseArguments(args);

  if (parsedArguments.help) {
    process.stdout.write(formatHelpText(packageJson.version));
    return;
  }

  if (parsedArguments.version) {
    process.stdout.write(`codiff v${packageJson.version}\n`);
    return;
  }

  if (parsedArguments.walkthroughGuide) {
    process.stdout.write(buildWalkthroughGuide());
    return;
  }

  const {
    agentBackend,
    branchRef,
    claudeSessionId,
    codexSessionId,
    commitRef,
    pullRequestNumber,
    range,
    requestedPath,
    walkthrough,
    walkthroughContextPath,
    walkthroughFilePath,
  } = parsedArguments;
  let { pullRequestUrl } = parsedArguments;

  if (!pullRequestUrl && pullRequestNumber != null) {
    try {
      pullRequestUrl = resolvePullRequestUrl(requestedPath, pullRequestNumber);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  // Prefer an explicit ELECTRON_RENDERER_URL; otherwise auto-use Codiff's dev
  // server when it is actually running and identifies as Codiff.
  const rendererURL =
    process.env.ELECTRON_RENDERER_URL || (await detectDevServer(DEV_SERVER_URL)) || '';

  if (!rendererURL && !existsSync(resolve(root, 'dist/index.html'))) {
    console.error('Codiff has not been built yet. Run `pnpm build` first, or start `pnpm dev`.');
    process.exit(1);
  }

  const childEnv = {
    ...process.env,
    CODIFF_AGENT_BACKEND: agentBackend ?? '',
    CODIFF_CLI_COMMAND: cliCommand,
    CODIFF_CLI_PATH: cliPath,
    CODIFF_BRANCH_REF: branchRef ?? '',
    CODIFF_CLAUDE_SESSION_ID: claudeSessionId ?? '',
    CODIFF_COMMIT_REF: commitRef ?? '',
    CODIFF_CODEX_SESSION_ID: codexSessionId ?? '',
    CODIFF_PULL_REQUEST_URL: pullRequestUrl ?? '',
    CODIFF_RANGE: range ? `${range.base}${range.symmetric ? '...' : '..'}${range.head}` : '',
    CODIFF_REPOSITORY_PATH: requestedPath,
    CODIFF_WALKTHROUGH: walkthrough ? '1' : '',
    CODIFF_WALKTHROUGH_CONTEXT: walkthroughContextPath ?? '',
    CODIFF_WALKTHROUGH_FILE: walkthroughFilePath ?? '',
    ELECTRON_RENDERER_URL: rendererURL,
  };

  // Electron must launch as a GUI. Some launchers (e.g. an agent/CLI harness)
  // export ELECTRON_RUN_AS_NODE=1, which makes the electron binary run as plain
  // Node — `require('electron')` then returns a path string and the app crashes
  // on boot. Strip it (and the console-detach flag) so the window always opens.
  delete childEnv.ELECTRON_RUN_AS_NODE;
  delete childEnv.ELECTRON_NO_ATTACH_CONSOLE;

  const { default: electron } = await import('electron');

  const child = spawn(electron, [root], {
    detached: true,
    env: childEnv,
    stdio: 'ignore',
  });

  child.unref();

  if (cliCommand === 'add') {
    process.stdout.write(`Added ${cliPath} to Codiff.\n`);
  } else if (subcommand === 'restart') {
    process.stdout.write('Codiff restarted.\n');
  }
};

run();
