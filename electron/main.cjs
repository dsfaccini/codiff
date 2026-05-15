const { existsSync, readFileSync } = require('node:fs');
const { dirname, join, relative, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  screen,
  shell,
} = require('electron');
const { listRepositoryHistory, readRepositoryState } = require('./git-state.cjs');
const {
  add: addRepo,
  getState: getRepoState,
  list: listRepos,
  remove: removeRepo,
} = require('./repos.cjs');

const root = dirname(__dirname);
const windowSelectedRepos = new Map();

const getLaunchPath = () => resolve(process.env.CODIFF_REPOSITORY_PATH || process.cwd());

const handleAddRepoRequest = async (anyPath) => {
  try {
    const realRoot = await addRepo(anyPath);
    console.log(`[codiff] Added repository: ${realRoot}`);

    // Notify all open windows so the sidebar updates live
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('codiff:repo-added', realRoot);
      }
    });

    // Bring the first window to front
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].focus();
    }
  } catch (err) {
    console.error('[codiff] Failed to add repository:', err.message);
  }
};

const getCurrentCommit = () => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
};

const getBuildInfo = () => {
  const buildInfoPath = join(root, 'dist', 'build-info.json');
  if (!existsSync(buildInfoPath)) {
    return { isStale: false };
  }

  try {
    const raw = readFileSync(buildInfoPath, 'utf8');
    const info = JSON.parse(raw);
    const current = getCurrentCommit();

    if (!current || !info.commit) {
      return { isStale: false };
    }

    const isStale = current !== info.commit;
    return {
      builtCommit: info.commit,
      builtAt: info.builtAt,
      currentCommit: current,
      isStale,
    };
  } catch {
    return { isStale: false };
  }
};

const createWindow = (repositoryPath) => {
  const display = screen.getPrimaryDisplay();
  const { height, width } = display.workAreaSize;
  const window = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141414' : '#ffffff',
    center: true,
    height: Math.max(720, Math.floor(height * 0.86)),
    minHeight: 520,
    minWidth: 880,
    show: false,
    title: `Codiff - ${repositoryPath}`,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, 'preload.cjs'),
    },
    width: Math.max(1120, Math.floor(width * 0.86)),
  });

  const webContentsId = window.webContents.id;
  // Seed with the launch path immediately so early IPC calls have something to work with.
  // The async addRepo below will normalize it to the real git root and persist it.
  windowSelectedRepos.set(webContentsId, repositoryPath);

  // Fire-and-forget: ensure the path is a valid git repo, normalize to its root, and persist.
  addRepo(repositoryPath)
    .then((realRoot) => {
      if (windowSelectedRepos.has(webContentsId)) {
        windowSelectedRepos.set(webContentsId, realRoot);
      }
    })
    .catch(() => {
      // Not a git repo or inaccessible — leave the seeded path; renderer will surface the error on first load.
    });

  window.once('ready-to-show', () => window.show());
  window.on('closed', () => windowSelectedRepos.delete(webContentsId));

  const rendererURL = process.env.ELECTRON_RENDERER_URL;
  if (rendererURL) {
    window.loadURL(rendererURL);
  } else {
    window.loadURL(pathToFileURL(join(root, 'dist/index.html')).toString());
  }
};

const lock = app.requestSingleInstanceLock({ repositoryPath: getLaunchPath() });

if (!lock) {
  app.quit();
} else {
  app.setName('Codiff');
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin'
        ? [
            {
              label: app.name,
              submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }],
            },
          ]
        : []),
      {
        label: 'File',
        submenu: [process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }],
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          {
            accelerator: 'CommandOrControl+Alt+J',
            click: (_menuItem, browserWindow) => browserWindow?.webContents.toggleDevTools(),
            label: 'Toggle Developer Tools',
          },
        ],
      },
    ]),
  );

  app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    if (process.env.CODIFF_CLI_COMMAND === 'add' || additionalData?.command === 'add') {
      const pathToAdd = process.env.CODIFF_CLI_PATH || additionalData?.path || workingDirectory;
      handleAddRepoRequest(pathToAdd);
    } else {
      const nextPath = resolve(additionalData?.repositoryPath || workingDirectory);
      createWindow(nextPath);
    }
  });

  app.on('ready', () => {
    if (process.env.CODIFF_CLI_COMMAND === 'add') {
      const pathToAdd = process.env.CODIFF_CLI_PATH || getLaunchPath();
      createWindow(pathToAdd);
      // After window is created, add the repo
      setTimeout(() => handleAddRepoRequest(pathToAdd), 500);
    } else {
      createWindow(getLaunchPath());
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(getLaunchPath());
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}

// --- Existing per-window handlers (now resolve against the window's currently selected repo) ---

const getWindowRepo = (event) => windowSelectedRepos.get(event.sender.id) || getLaunchPath();

ipcMain.handle('codiff:getRepositoryState', async (event, source) => {
  const repositoryPath = getWindowRepo(event);
  return readRepositoryState(repositoryPath, source);
});

ipcMain.handle('codiff:getRepositoryHistory', async (event, limit) => {
  const repositoryPath = getWindowRepo(event);
  return listRepositoryHistory(repositoryPath, limit);
});

ipcMain.handle('codiff:showInFolder', async (event, filePath) => {
  const repositoryPath = getWindowRepo(event);
  const state = await readRepositoryState(repositoryPath);
  const absolutePath = resolve(state.root, filePath);

  if (existsSync(absolutePath)) {
    shell.showItemInFolder(absolutePath);
  } else {
    shell.openPath(state.root);
  }
});

ipcMain.handle('codiff:getRelativePath', async (event, filePath) => {
  const repositoryPath = getWindowRepo(event);
  const state = await readRepositoryState(repositoryPath);
  return relative(state.root, filePath);
});

// --- New multi-repo management handlers ---

ipcMain.handle('codiff:listRepos', async () => {
  // listRepos() already prunes dead/moved paths on read
  return listRepos();
});

ipcMain.handle('codiff:addRepo', async (_event, anyPath) => {
  return addRepo(anyPath);
});

ipcMain.handle('codiff:removeRepo', async (_event, root) => {
  await removeRepo(root);
  // If any open window was viewing this root, clear its selection so it falls back gracefully
  for (const [id, selected] of windowSelectedRepos.entries()) {
    if (selected === root) {
      windowSelectedRepos.delete(id);
    }
  }
});

ipcMain.handle('codiff:pickFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Add repository',
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('codiff:setSelectedRepo', async (event, root) => {
  const id = event.sender.id;
  // Only allow selecting a root that is currently in the persisted list (defensive)
  const currentList = await listRepos();
  if (currentList.includes(root)) {
    windowSelectedRepos.set(id, root);
    return true;
  }
  return false;
});

ipcMain.handle('codiff:getRepositoryStateForRoot', async (_event, root) => {
  return getRepoState(root);
});

ipcMain.handle('codiff:getBuildInfo', () => {
  return getBuildInfo();
});

ipcMain.handle('codiff:restartApp', () => {
  app.relaunch();
  app.quit();
});
