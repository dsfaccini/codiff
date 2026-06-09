// @ts-check

// The fork's multi-repo layer: a persisted list of git roots the user has opened,
// shown in the sidebar's repository switcher. This module owns ONLY the persisted
// list (read/dedupe/prune/write). Per-window "which repo is active" lives in
// main.cjs's `windowRepositories` map — switching a window's repo never touches
// this file.

const { execFile } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { promisify } = require('node:util');
const { app } = require('electron');

const execFileAsync = promisify(execFile);

const getStoragePath = () => join(app.getPath('userData'), 'repos.json');

/** @type {Array<string> | null} */
let cachedList = null;

/** @param {string} repositoryPath @param {Array<string>} args */
const git = async (repositoryPath, args) => {
  const { stdout } = await execFileAsync('git', ['-C', repositoryPath, ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return stdout;
};

/** @param {string} anyPath @returns {Promise<string | null>} */
const resolveGitRoot = async (anyPath) => {
  try {
    const repositoryRoot = (await git(anyPath, ['rev-parse', '--show-toplevel'])).trim();
    return repositoryRoot || null;
  } catch {
    return null;
  }
};

const loadListFromDisk = () => {
  try {
    const parsed = JSON.parse(readFileSync(getStoragePath(), 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
  } catch {
    return [];
  }
};

/** @param {Array<string>} list */
const saveListToDisk = (list) => {
  try {
    mkdirSync(dirname(getStoragePath()), { recursive: true });
    writeFileSync(getStoragePath(), `${JSON.stringify(list, null, 2)}\n`);
  } catch {
    // Best effort — never block the app on a failed write.
  }
};

// Drop entries that no longer exist or are no longer git repositories, resolve the
// rest to their canonical root, and dedupe while preserving insertion order.
const pruneAndLoad = async () => {
  if (cachedList) {
    return cachedList;
  }

  const stored = loadListFromDisk();
  const seen = new Set();
  const deduped = [];
  for (const entry of stored) {
    if (!existsSync(entry)) {
      continue;
    }
    const repositoryRoot = await resolveGitRoot(entry);
    if (repositoryRoot && !seen.has(repositoryRoot)) {
      seen.add(repositoryRoot);
      deduped.push(repositoryRoot);
    }
  }

  if (deduped.length !== stored.length || deduped.some((root, index) => root !== stored[index])) {
    saveListToDisk(deduped);
  }

  cachedList = deduped;
  return deduped;
};

/** @param {Array<string>} list */
const persist = (list) => {
  cachedList = list;
  saveListToDisk(list);
};

/** @param {string} anyPath @returns {Promise<string>} resolved git root */
const addRepository = async (anyPath) => {
  const repositoryRoot = await resolveGitRoot(anyPath);
  if (!repositoryRoot) {
    throw new Error('Not a git repository');
  }

  const list = await pruneAndLoad();
  if (!list.includes(repositoryRoot)) {
    persist([...list, repositoryRoot]);
  }
  return repositoryRoot;
};

/** @param {string} repositoryRoot */
const removeRepository = async (repositoryRoot) => {
  const list = await pruneAndLoad();
  const next = list.filter((entry) => entry !== repositoryRoot);
  if (next.length !== list.length) {
    persist(next);
  }
  return next;
};

const listRepositories = () => pruneAndLoad();

module.exports = {
  addRepository,
  listRepositories,
  removeRepository,
  resolveGitRoot,
};
