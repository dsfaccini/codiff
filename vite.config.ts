import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nkzw from '@nkzw/oxlint-config';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  base: './',
  fmt: {
    experimentalSortImports: {
      newlinesBetween: false,
    },
    experimentalSortPackageJson: {
      sortScripts: true,
    },
    experimentalTailwindcss: {
      stylesheet: 'src/App.css',
    },
    ignorePatterns: [
      'coverage/',
      'dist/',
      'index.html',
      'pnpm-lock.yaml',
      'src/__generated__/',
      'src/translations/',
    ],
    singleQuote: true,
  },
  lint: {
    extends: [nkzw],
    ignorePatterns: ['bin/', 'dist/', 'electron/', 'vite.config.ts.timestamp-*'],
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        env: {
          node: true,
        },
        files: ['shared/narrative-walkthrough-diff.cjs'],
      },
    ],
  },
  plugins: [
    // Stamp the build with its source commit so the running app can warn when it
    // is older than the working tree (see getBuildInfo in electron/main.cjs).
    {
      closeBundle() {
        try {
          const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          }).trim();
          writeFileSync(
            resolve(process.cwd(), 'dist/build-info.json'),
            `${JSON.stringify({ builtAt: new Date().toISOString(), commit }, null, 2)}\n`,
          );
        } catch {
          // Best effort — never fail the build when git is unavailable.
        }
      },
      name: 'codiff-build-info',
    },
    babel({
      presets: [reactCompilerPreset()],
    }),
    tailwindcss(),
    react(),
  ],
  run: {
    tasks: {
      'test:all': {
        command: 'vp check && vp test',
      },
    },
  },
  staged: {
    '*': 'vp check --fix',
  },
  test: {
    include: ['electron/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/__tests__/setup.ts'],
  },
  worker: {
    format: 'es',
  },
});
