# Codiff

Local PR viewer for staged and unstaged Git changes.

## Usage

```bash
pnpm install
pnpm build
pnpm codiff
```

Run from inside a Git repository or pass a path:

```bash
pnpm codiff
pnpm codiff /path/to/repository
```

### CLI

- `codiff [path]` — launch for the given path (defaults to cwd)
- `codiff add [path]` — add a repository to the list
- `codiff kill` — force quit all instances
- `codiff restart` — kill and relaunch

Multiple repositories can be managed in a single window via the sidebar.

## Development

```bash
pnpm dev
ELECTRON_RENDERER_URL=http://127.0.0.1:58321 pnpm electron
```

Checks:

```bash
pnpm check
pnpm test
pnpm build
```
