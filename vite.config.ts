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
  },
  plugins: [
    {
      closeBundle() {
        try {
          const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          }).trim();

          const info = {
            builtAt: new Date().toISOString(),
            commit,
          };

          const outPath = resolve(process.cwd(), 'dist/build-info.json');
          writeFileSync(outPath, JSON.stringify(info, null, 2) + '\n');
        } catch {
          // Best effort — don't fail the build if git is unavailable
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
    '**/*.{ts,tsx,js,cjs,mjs}': 'vp check --fix',
  },
});
