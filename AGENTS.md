# AGENTS.md — Codiff

Codiff is a local native PR viewer for staged and unstaged Git changes. Electron + React 19, using @pierre/diffs and @pierre/trees.

## Naming & Mental Model Notes

- Distinguish clearly between the three repo-selection layers: persisted list (`repos.json`), `windowSelectedRepos` (main process Map per webContents), and React `selectedRoot` + `selectedRootRef`.
- `fingerprint` on `ChangedFile` is content-derived (hashes the patches) and powers viewed-state staleness detection — not just an ID.
- `squircle`, `Dunkel`, and `Licht` are intentional (not typos). `compactPath` is the specific `~` + abbreviated-middle logic used for display.
- "section" almost always means `DiffSection` (`kind: 'staged' | 'unstaged' | 'commit'`).
