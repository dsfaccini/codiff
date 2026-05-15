const { existsSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { app } = require('electron');
const { readRepositoryState } = require('./git-state.cjs');

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const getStoragePath = () => join(app.getPath('userData'), 'repos.json');

let cachedList = null;

const git = async (repoPath, args) => {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return stdout;
};

const resolveGitRoot = async (anyPath) => {
  try {
    const root = (await git(anyPath, ['rev-parse', '--show-toplevel'])).trim();
    return root || null;
  } catch {
    return null;
  }
};

const loadListFromDisk = () => {
  try {
    const raw = require('node:fs').readFileSync(getStoragePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === 'string') : [];
  } catch {
    return [];
  }
};

const saveListToDisk = (list) => {
  try {
    require('node:fs').mkdirSync(dirname(getStoragePath()), { recursive: true });
    require('node:fs').writeFileSync(getStoragePath(), JSON.stringify(list, null, 2));
  } catch {
    // best effort
  }
};

const pruneAndLoad = async () => {
  if (cachedList) {
    return cachedList;
  }

  let list = loadListFromDisk();

  const valid = [];
  for (const p of list) {
    if (!existsSync(p)) continue;
    const root = await resolveGitRoot(p);
    if (root) {
      valid.push(root);
    }
  }

  // dedupe while preserving order
  const seen = new Set();
  const deduped = [];
  for (const r of valid) {
    if (!seen.has(r)) {
      seen.add(r);
      deduped.push(r);
    }
  }

  if (deduped.length !== list.length) {
    list = deduped;
    saveListToDisk(list);
  }

  cachedList = list;
  return list;
};

const persist = (list) => {
  cachedList = list;
  saveListToDisk(list);
};

const add = async (anyPath) => {
  const root = await resolveGitRoot(anyPath);
  if (!root) {
    throw new Error('Not a git repository');
  }

  const list = await pruneAndLoad();
  if (!list.includes(root)) {
    const next = [...list, root];
    persist(next);
  }
  return root;
};

const remove = async (root) => {
  const list = await pruneAndLoad();
  const next = list.filter((r) => r !== root);
  if (next.length !== list.length) {
    persist(next);
  }
};

const list = async () => pruneAndLoad();

const getState = async (root) => {
  // ensure it's still valid at call time
  if (!existsSync(root)) {
    throw new Error('Repository path no longer exists');
  }
  const actual = await resolveGitRoot(root);
  if (!actual) {
    throw new Error('Path is no longer a git repository');
  }
  return readRepositoryState(root);
};

module.exports = {
  add,
  getState,
  list,
  remove,
};
