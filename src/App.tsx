import { registerCustomTheme } from '@pierre/diffs';
import { PatchDiff, Virtualizer } from '@pierre/diffs/react';
import { FileTree, useFileTree } from '@pierre/trees/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dunkelTheme from './themes/dunkel.json' with { type: 'json' };
import lichtTheme from './themes/licht.json' with { type: 'json' };
import type { ChangedFile, GitFileStatus, RepositoryState } from './types.ts';

registerCustomTheme('Licht', async () => lichtTheme as never);
registerCustomTheme('Dunkel', async () => dunkelTheme as never);

const statusLabel: Record<GitFileStatus, string> = {
  added: 'Added',
  deleted: 'Deleted',
  modified: 'Modified',
  renamed: 'Renamed',
  untracked: 'Untracked',
};

const statusForTree: Record<
  GitFileStatus,
  'added' | 'deleted' | 'modified' | 'renamed' | 'untracked'
> = {
  added: 'added',
  deleted: 'deleted',
  modified: 'modified',
  renamed: 'renamed',
  untracked: 'untracked',
};

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const compactPath = (path: string) => {
  const homePath = path
    .replace(/^\/Users\/[^/]+(?=\/|$)/, '~')
    .replace(/^\/home\/[^/]+(?=\/|$)/, '~');
  const parts = homePath.split('/').filter(Boolean);

  if (parts.length <= 2) {
    return homePath;
  }

  const prefix = homePath.startsWith('/') ? '/' : '';
  const [first, ...rest] = parts;
  const last = rest.pop();
  const middle = rest.map((part) => part[0]).join('/');

  return `${prefix}${first}/${middle ? `${middle}/` : ''}${last}`;
};

const getViewedKey = (root: string) => `codiff:viewed:${root}`;

const readViewed = (root: string): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(getViewedKey(root)) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
};

const writeViewed = (root: string, viewed: Record<string, string>) => {
  localStorage.setItem(getViewedKey(root), JSON.stringify(viewed));
};

function Sidebar({
  files,
  onSelectPath,
  selectedPath,
}: {
  files: ReadonlyArray<ChangedFile>;
  onSelectPath: (path: string) => void;
  selectedPath: string | null;
}) {
  const suppressSelectionChange = useRef(false);
  const paths = useMemo(() => files.map((file) => file.path), [files]);
  const status = useMemo(
    () =>
      files.map((file) => ({
        path: file.path,
        status: statusForTree[file.status],
      })),
    [files],
  );
  const { model } = useFileTree({
    flattenEmptyDirectories: true,
    gitStatus: status,
    initialExpansion: 'open',
    initialSelectedPaths: selectedPath ? [selectedPath] : [],
    itemHeight: 30,
    onSelectionChange: (paths) => {
      if (suppressSelectionChange.current) {
        return;
      }

      const path = paths.at(-1);
      if (path) {
        onSelectPath(path);
      }
    },
    paths,
    unsafeCSS: `
      :host {
        color: var(--sidebar-text);
        font: 13px/1.35 var(--font-sans);
      }

      button[data-type='item'] {
        border-radius: 14px;
        corner-shape: squircle;
      }
    `,
  });

  useEffect(() => {
    if (!selectedPath) {
      return;
    }

    const selectedPaths = model.getSelectedPaths();
    if (selectedPaths.length === 1 && selectedPaths[0] === selectedPath) {
      return;
    }

    suppressSelectionChange.current = true;
    for (const path of selectedPaths) {
      model.getItem(path)?.deselect();
    }
    model.getItem(selectedPath)?.select();
    window.setTimeout(() => {
      suppressSelectionChange.current = false;
    }, 0);
  }, [model, selectedPath]);

  return <FileTree className="file-tree" model={model} />;
}

function DiffFile({
  file,
  isSelected,
  isViewed,
  onToggleViewed,
}: {
  file: ChangedFile;
  isSelected: boolean;
  isViewed: boolean;
  onToggleViewed: (file: ChangedFile, isViewed: boolean) => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const toggleViewed = () => {
    onToggleViewed(file, isViewed);
    setIsCollapsed(!isViewed);
  };

  return (
    <section
      className={`diff-file squircle${isSelected ? ' selected' : ''}${isViewed ? ' viewed' : ''}`}
      id={`file-${hashString(file.path)}`}
    >
      <div className="diff-file-header">
        <button
          aria-label={isCollapsed ? 'Expand file' : 'Collapse file'}
          className="icon-button"
          onClick={() => setIsCollapsed((value) => !value)}
          title={isCollapsed ? 'Expand' : 'Collapse'}
          type="button"
        >
          <span className={isCollapsed ? 'chevron collapsed' : 'chevron'} />
        </button>
        <div className="file-heading">
          <div className="file-path">{file.path}</div>
          {file.oldPath ? <div className="file-old-path">{file.oldPath}</div> : null}
        </div>
        <button
          aria-pressed={isViewed}
          className={`viewed-button${isViewed ? ' active' : ''}`}
          onClick={toggleViewed}
          type="button"
        >
          <span aria-hidden className="viewed-checkbox" />
          Viewed
        </button>
        <div className={`status-badge ${file.status}`}>{statusLabel[file.status]}</div>
      </div>
      {isCollapsed ? null : (
        <div className="diff-sections">
          {file.sections.map((section) => (
            <div className="diff-section" key={section.id}>
              {file.sections.length > 1 ? (
                <div className="section-label">
                  {section.kind === 'staged'
                    ? 'Staged'
                    : section.kind === 'unstaged'
                      ? 'Unstaged'
                      : 'Commit'}
                </div>
              ) : null}
              {section.binary ? (
                <div className="binary-diff squircle">Binary file changed</div>
              ) : (
                <Virtualizer>
                  <PatchDiff
                    options={{
                      diffIndicators: 'bars',
                      diffStyle: 'split',
                      disableFileHeader: true,
                      hunkSeparators: 'simple',
                      lineDiffType: 'char',
                      theme: {
                        dark: 'Dunkel',
                        light: 'Licht',
                      },
                      themeType: 'system',
                    }}
                    patch={section.patch}
                  />
                </Virtualizer>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [repos, setRepos] = useState<Array<string>>([]);
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const [state, setState] = useState<RepositoryState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [viewed, setViewed] = useState<Record<string, string>>({});
  const fileRefs = useRef(new Map<string, HTMLElement>());
  const programmaticScrollPathRef = useRef<string | null>(null);
  const programmaticScrollTimerRef = useRef<number | null>(null);
  const reviewRef = useRef<HTMLElement | null>(null);
  const initialLoadDone = useRef(false);
  const selectedRootRef = useRef<string | null>(null);
  const [buildInfo, setBuildInfo] = useState<{
    builtCommit?: string;
    currentCommit?: string;
    isStale: boolean;
  } | null>(null);
  const [buildWarningDismissed, setBuildWarningDismissed] = useState(false);

  // Load the persisted repo list on mount. The main process already auto-added any
  // launch path (from CLI or second-instance). We pick the most recently added one
  // so that `codiff /new/path` naturally selects the folder the user just opened.
  useEffect(() => {
    let canceled = false;

    const load = async () => {
      try {
        const list = await window.codiff.listRepos();
        if (canceled) {
          return;
        }

        setRepos(list);

        if (list.length === 0) {
          setState(null);
          setSelectedRoot(null);
          selectedRootRef.current = null;
          setError(null);
          return;
        }

        // Prefer the last entry (most recently added via CLI launch)
        const target = list.at(-1)!;
        setSelectedRoot(target);
        selectedRootRef.current = target;
        await window.codiff.setSelectedRepo(target);

        const nextState = await window.codiff.getRepositoryStateForRoot(target);
        if (canceled) {
          return;
        }

        setState(nextState);
        setError(null);
        setViewed(readViewed(nextState.root));
        setSelectedPath((current) => current ?? nextState.files[0]?.path ?? null);
      } catch (error: unknown) {
        if (!canceled) {
          setError(error instanceof Error ? error.message : String(error));
        }
      }
      initialLoadDone.current = true;
    };

    load();

    return () => {
      canceled = true;
    };
  }, []);

  // Check once on mount whether the running build is older than the current source.
  useEffect(() => {
    window.codiff
      .getBuildInfo?.()
      .then((info) => {
        if (info?.isStale) {
          setBuildInfo(info);
        }
      })
      .catch(() => {
        // Non-fatal
      });
  }, []);

  useEffect(
    () => () => {
      if (programmaticScrollTimerRef.current != null) {
        window.clearTimeout(programmaticScrollTimerRef.current);
      }
    },
    [],
  );

  const selectPath = useCallback((path: string) => {
    setSelectedPath(path);
    programmaticScrollPathRef.current = path;
    if (programmaticScrollTimerRef.current != null) {
      window.clearTimeout(programmaticScrollTimerRef.current);
    }

    requestAnimationFrame(() => {
      fileRefs.current.get(path)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      programmaticScrollTimerRef.current = window.setTimeout(() => {
        programmaticScrollPathRef.current = null;
      }, 1200);
    });
  }, []);

  const updateSelectedPathFromScroll = useCallback(() => {
    const review = reviewRef.current;
    if (!review || !state?.files.length) {
      return;
    }

    const reviewTop = review.getBoundingClientRect().top;
    const programmaticScrollPath = programmaticScrollPathRef.current;
    if (programmaticScrollPath) {
      const target = fileRefs.current.get(programmaticScrollPath);
      if (!target || Math.abs(target.getBoundingClientRect().top - reviewTop) > 16) {
        return;
      }

      programmaticScrollPathRef.current = null;
      if (programmaticScrollTimerRef.current != null) {
        window.clearTimeout(programmaticScrollTimerRef.current);
        programmaticScrollTimerRef.current = null;
      }
    }

    let nextPath = state.files[0]?.path ?? null;
    let nextDistance = Number.NEGATIVE_INFINITY;

    for (const file of state.files) {
      const element = fileRefs.current.get(file.path);
      if (!element) {
        continue;
      }

      const distance = element.getBoundingClientRect().top - reviewTop - 12;
      if (distance <= 0 && distance > nextDistance) {
        nextDistance = distance;
        nextPath = file.path;
      }
    }

    if (nextPath) {
      setSelectedPath((current) => (current === nextPath ? current : nextPath));
    }
  }, [state]);

  const toggleViewed = useCallback(
    (file: ChangedFile, isViewed: boolean) => {
      if (!state) {
        return;
      }

      setViewed((current) => {
        if (isViewed) {
          const next = { ...current };
          delete next[file.path];
          writeViewed(state.root, next);
          return next;
        }

        const next = {
          ...current,
          [file.path]: file.fingerprint,
        };
        writeViewed(state.root, next);
        return next;
      });
    },
    [state],
  );

  const loadRepo = useCallback(async (root: string) => {
    try {
      const ok = await window.codiff.setSelectedRepo(root);
      if (!ok) {
        throw new Error('Repository is no longer in the list');
      }

      const nextState = await window.codiff.getRepositoryStateForRoot(root);
      setState(nextState);
      setError(null);
      setViewed(readViewed(nextState.root));
      setSelectedPath(nextState.files[0]?.path ?? null);
      setSelectedRoot(root);
      selectedRootRef.current = root;
      // Clear any stale element references from the previous repo
      fileRefs.current.clear();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : String(error));
      // Prune it from our local list if it has become invalid
      setRepos((current) => current.filter((r) => r !== root));
      // If the failed root was the one we were viewing, clear the view
      // (we compare against the current state value, not a closed-over one)
      if (selectedRootRef.current === root) {
        setSelectedRoot(null);
        selectedRootRef.current = null;
        setState(null);
      }
    }
  }, []);

  const switchRepo = useCallback(
    (root: string) => {
      if (root === selectedRoot) {
        return;
      }
      loadRepo(root);
    },
    [selectedRoot, loadRepo],
  );

  const addCurrentFolder = useCallback(async () => {
    try {
      const picked = await window.codiff.pickFolder();
      if (!picked) {
        return;
      }

      const realRoot = await window.codiff.addRepo(picked);
      const freshList = await window.codiff.listRepos();
      setRepos(freshList);

      // Select the one we just added
      await loadRepo(realRoot);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }, [loadRepo]);

  const removeRepo = useCallback(
    async (root: string, e?: { stopPropagation?: () => void }) => {
      e?.stopPropagation?.();
      try {
        await window.codiff.removeRepo(root);
        const freshList = await window.codiff.listRepos();
        setRepos(freshList);

        if (selectedRoot === root) {
          if (freshList.length > 0) {
            await loadRepo(freshList.at(-1)!);
          } else {
            setSelectedRoot(null);
            selectedRootRef.current = null;
            setState(null);
            setSelectedPath(null);
            setViewed({});
          }
        }
      } catch (error: unknown) {
        setError(error instanceof Error ? error.message : String(error));
      }
    },
    [selectedRoot, loadRepo],
  );

  const handleRestart = useCallback(async () => {
    try {
      await window.codiff.restartApp?.();
    } catch {
      // The app should be quitting anyway
    }
  }, []);

  if (error) {
    return (
      <main className="empty-state">
        <div className="empty-panel squircle">
          <strong>Unable to read repository</strong>
          <span>{error}</span>
          {repos.length > 0 ? (
            <button
              onClick={() => {
                setError(null);
                if (selectedRoot) {
                  loadRepo(selectedRoot);
                }
              }}
              style={{ marginTop: 12 }}
              type="button"
            >
              Retry
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  // No repositories registered yet — first-run experience
  if (repos.length === 0) {
    return (
      <main className="empty-state">
        <div className="empty-panel squircle">
          <strong>Welcome to Codiff</strong>
          <span style={{ maxWidth: 320, textAlign: 'center' }}>
            Add a Git repository to start reviewing its staged and unstaged changes.
          </span>
          <button
            onClick={addCurrentFolder}
            style={{
              background: 'var(--viewed)',
              border: 'none',
              borderRadius: 999,
              color: 'white',
              cursor: 'pointer',
              marginTop: 16,
              padding: '6px 18px',
            }}
            type="button"
          >
            Add folder
          </button>
        </div>
      </main>
    );
  }

  // We have repos in the list but nothing loaded yet (very early in initial mount)
  if (!state || !selectedRoot) {
    return <main className="loading">Loading</main>;
  }

  const repoRows = repos.map((root) => {
    const isActive = root === selectedRoot;
    return (
      <div
        className={`repo-row${isActive ? ' active' : ''}`}
        key={root}
        onClick={() => switchRepo(root)}
        title={root}
      >
        <span className="repo-path">{compactPath(root)}</span>
        <button
          aria-label="Remove repository"
          className="repo-remove"
          onClick={(e) => removeRepo(root, e)}
          title="Remove from list"
          type="button"
        >
          ×
        </button>
      </div>
    );
  });

  const showBuildWarning = buildInfo?.isStale && !buildWarningDismissed;

  return (
    <>
      {showBuildWarning && (
        <div className="build-warning">
          <span>
            Newer build available ({buildInfo?.builtCommit} → {buildInfo?.currentCommit})
          </span>
          <button className="build-warning-restart" onClick={handleRestart} type="button">
            Restart app
          </button>
          <button
            className="build-warning-dismiss"
            onClick={() => setBuildWarningDismissed(true)}
            type="button"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="app-shell">
        <aside className="sidebar squircle">
          {/* Repositories list (Zed-style switcher) */}
          <div className="repos-section">
            <div className="repos-header">
              <span className="sidebar-title">Repositories</span>
              <button
                aria-label="Add repository folder"
                className="icon-button add-repo-btn"
                onClick={addCurrentFolder}
                title="Add folder"
                type="button"
              >
                +
              </button>
            </div>
            <div className="repo-list">
              {repoRows.length > 0 ? (
                repoRows
              ) : (
                <div className="repo-empty-hint">No repositories</div>
              )}
            </div>
          </div>

          {/* Active repo header + file tree */}
          <div className="files-section">
            <div className="sidebar-header">
              <div className="sidebar-path-row">
                <div className="sidebar-path" title={state.root}>
                  {compactPath(state.root)}
                </div>
              </div>
              <div className="sidebar-title">
                Changed Files
                {state.files.length > 0 ? ` (${state.files.length})` : ''}
              </div>
            </div>
            <Sidebar
              files={state.files}
              key={selectedRoot}
              onSelectPath={selectPath}
              selectedPath={selectedPath}
            />
          </div>
        </aside>

        <main className="review" onScroll={updateSelectedPathFromScroll} ref={reviewRef}>
          {state.files.length === 0 ? (
            <div className="empty-state" key={selectedRoot}>
              <div className="empty-panel squircle">
                <strong>No local changes</strong>
                <span>{state.root}</span>
              </div>
            </div>
          ) : (
            <div className="file-list" key={selectedRoot}>
              {state.files.map((file) => (
                <div
                  key={file.path}
                  ref={(element) => {
                    if (element) {
                      fileRefs.current.set(file.path, element);
                    } else {
                      fileRefs.current.delete(file.path);
                    }
                  }}
                >
                  <DiffFile
                    file={file}
                    isSelected={selectedPath === file.path}
                    isViewed={viewed[file.path] === file.fingerprint}
                    onToggleViewed={toggleViewed}
                  />
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
