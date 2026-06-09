---
name: codiff-fork
description: Mental map, ownership domains, and upstream-sync playbook for THIS codiff fork. Use when changing the fork's code, deciding where new code goes, or pulling new work from upstream (nkzw-tech/codiff) without losing the fork's multi-repo layer.
---

# codiff-fork

This repo is a fork of `nkzw-tech/codiff` (an Electron + React 19 local diff/PR viewer). Upstream ships fast; the fork adds a **multi-repo layer** on top. This skill keeps the two reconcilable: it maps the codebase, says where new code belongs, and gives the playbook for absorbing upstream.

## Prime directive

**Upstream owns the app; the fork owns a thin, additive layer.** When upstream and the fork want the same file, prefer adopting upstream and re-expressing the fork's behavior as _additive modules_. Never hand-merge 100+ upstream commits into fork-rewritten files — reset onto upstream and re-apply the layer (see Playbook).

## The fork layer — what must survive (the contract)

Seven capabilities. The durable contracts (persisted formats, env vars, IPC channel names) must not drift — everything else is reshapeable.

| #   | Capability                                        | Lives in                                                                                                                                                                                                                                                                                                      | Durable contract                                                                 |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Multi-repo switcher (one window, many repos)      | `electron/repos.cjs` (persisted list), `windowRepositories` + `switchWindowRepository` + `codiff:listRepositories`/`addRepository`/`removeRepository`/`pickRepository`/`selectRepository` in `electron/main.cjs`, `src/app/components/RepoSwitcher.tsx`, `selectRepo`/`addRepo`/`removeRepo` in `src/App.tsx` | `repos.json` (JSON array of git roots) in `app.getPath('userData')`              |
| 2   | CLI `add`/`kill`/`restart`                        | `bin/codiff.js`                                                                                                                                                                                                                                                                                               | env `CODIFF_CLI_COMMAND`/`CODIFF_CLI_PATH`; pkill pattern `"Electron.*codiff"`   |
| 3   | Live repo-add into a running window               | `handleAddRepositoryRequest` + `second-instance` routing in `main.cjs`, `onRepositoryAdded` in preload, effect in `App.tsx`                                                                                                                                                                                   | IPC `codiff:repositoryAdded`                                                     |
| 4   | "Newer build available" banner                    | `codiff-build-info` plugin in `vite.config.ts`, `getBuildInfo`/`codiff:restartApp` in `main.cjs`, `src/app/components/BuildStaleBanner.tsx`                                                                                                                                                                   | `dist/build-info.json` = `{builtAt, commit}`                                     |
| 5   | Pre-commit hook (build+test+optional global link) | `.vite-hooks/pre-commit`, `.env.example`                                                                                                                                                                                                                                                                      | env `CODIFF_LINK_PRECOMMIT`/`CODIFF_LINK_TOOL`; `build` script in `package.json` |
| 6   | `Array<string>`/`CodiffBuildInfo` IPC types       | `src/global.d.ts`, `src/types.ts` (`CodiffBuildInfo`)                                                                                                                                                                                                                                                         | the `Window['codiff']` shape                                                     |

The full pre-sync fork is always recoverable: `git show archive/multi-repo-pre-upstream-sync:<path>` (or whatever the latest `archive/*` tag is).

### The one load-bearing seam

Every electron IPC handler resolves the active repo as `windowRepositories.get(event.sender.id) || getLaunchPath()`. **The multi-repo switcher rides entirely on that map** — `switchWindowRepository` repoints the entry, the renderer reloads via the normal `getRepositoryState()`. If upstream changes how handlers resolve the repo path, that is the integration point to re-check first.

## Mental map — upstream architecture

- `src/App.tsx` — top-level orchestrator: holds one `RepositoryState`, source-switching, all renderer state.
- `src/app/components/` — UI. `Sidebar.tsx` is the **file-tree** sidebar (Tree/Walkthrough/History tabs) — NOT a repo list; don't confuse with `RepoSwitcher`. `ReviewCodeView.tsx` = diff surface. `Panels.tsx` = banners/first-run/PR buttons. `walkthrough/` = narrative walkthrough UI.
- `src/lib/` — framework-free logic (diff parsing, search, review-comments, reload-selection, files/tree).
- `src/config/` — user config + keymap schema (`~/.codiff/config`).
- `src/types.ts` / `src/global.d.ts` — shared domain model + the typed `Window.codiff` IPC surface.
- `electron/` — main process. `main.cjs` = lifecycle/windows/IPC. `git-state/` = git reads per source (working-tree/commit/branch/range/PR). `agent.cjs`+`codex.cjs`/`claude.cjs` = agent backends. `narrative-walkthrough*.cjs` = walkthrough generation. `window-identity.cjs` = single-instance keying (one window per repo+source).
- `src/__tests__/` + `electron/__tests__/` — vitest. Adding a `Window['codiff']` method **requires** updating the `createCodiffMock` in `src/__tests__/App-render.test.tsx` or typecheck fails.

## Cleanliness guidelines

- **New behavior → new file.** Put fork UI/logic in its own module (`RepoSwitcher.tsx`, `BuildStaleBanner.tsx`, `repos.cjs`), not inside upstream files. Editing `App.tsx`, `main.cjs`, `preload.cjs`, `global.d.ts` is unavoidable (they're wiring points) — keep those edits small and clearly fork-flavored so the next sync re-applies them mechanically.
- **Don't fork upstream components.** Never copy-edit `Sidebar.tsx`/`Panels.tsx`/`ReviewCodeView.tsx` — wrap or compose instead. Every upstream file you edit is a future merge conflict.
- **Respect the ontology.** `Sidebar` = file tree; `RepoSwitcher` = repo list; `source` = `ReviewSource` (working-tree/commit/branch/PR); `windowRepositories` = per-window active root. Don't reuse these names for new concepts.
- **No typecasting, no `as`, no `any`.** Match upstream style (`@ts-check` JSDoc in `.cjs`, real types in `.ts`). Prefer the smallest type.
- **Comments explain non-obvious _why_** (e.g. "switching always views the working tree, so drop the launch source") — not what the code restates.
- Run `pnpm exec vp check --fix` before considering anything done; it sorts imports/keys and formats.

## Upstream-sync playbook

Fan out by **ownership domain** so subagents don't collide on shared files. Run from the repo root.

1. **Recon.** `git fetch origin`; `git log --oneline <merge-base>..origin/main`; `git diff --stat <merge-base>..origin/main`. Spawn two read-only subagents in parallel: one inventories upstream's new features+architecture, one inventories the fork layer (the table above is the seed). Confirm what collides.
2. **Archive + reset.** Commit any WIP. `git tag archive/<branch>-pre-upstream-sync`. `git reset --hard origin/main`. `pnpm install`. Baseline: `pnpm exec vp build && pnpm exec vp test` must be green before re-applying anything.
3. **Re-apply the layer, by domain.** These are independent enough to parallelize (different files), except where noted:
   - **Tooling** (`.vite-hooks/pre-commit`, `.env.example`, `.gitignore`, `package.json` `build` script, `vite.config.ts` build-info plugin) — fully independent; safe as a parallel subagent.
   - **Electron multi-repo** (`electron/repos.cjs` new; `main.cjs` helpers + IPC handlers + `second-instance` routing; `preload.cjs`; `src/global.d.ts`; `src/types.ts`) — one owner; these are tightly coupled.
   - **Renderer** (`RepoSwitcher.tsx`, `BuildStaleBanner.tsx` new; `App.tsx` state/callbacks/effects/JSX; `App.css`) — one owner; depends on the IPC surface from the electron step, so do it after (or hand it the finalized `global.d.ts`).
   - Port each fork file from the archive tag; **adapt, don't paste** — upstream APIs move (e.g. `readRepositoryState` signature, handler resolution).
4. **Wire tests.** Update `createCodiffMock` for any new `Window['codiff']` methods.
5. **Verify** (see checklist). Then refresh `AGENTS.md` and this skill if the layer's shape changed. Commit.

## Verification checklist

- `pnpm exec vp check` — clean (format + lint + typecheck across `src/` and `@ts-check` electron).
- `pnpm exec vp test` — all pass (count should match upstream's + any fork tests).
- `pnpm build` — succeeds and writes `dist/build-info.json`.
- `node --check` on `electron/main.cjs`, `electron/repos.cjs`, `electron/preload.cjs`, `bin/codiff.js`.
- `node bin/codiff.js --help` and `node bin/codiff.js kill` — exit cleanly.
- **Manual (not coverable by tests):** launch the app, switch repos via the sidebar, `codiff add <path>` from a terminal into a running window, and confirm the stale-build banner after editing source without rebuilding.
