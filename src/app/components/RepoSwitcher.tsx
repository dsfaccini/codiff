import { compactPath } from '../../lib/files.ts';

// The fork's multi-repo layer: a Zed-style list of the repositories the user has
// opened, shown at the top of the sidebar. Selecting one repoints this window at
// that repo (electron/main.cjs `switchWindowRepository`). Purely presentational —
// all persistence lives in electron/repos.cjs.
export function RepoSwitcher({
  activeRoot,
  onAdd,
  onRemove,
  onSelect,
  repos,
}: {
  activeRoot: string;
  onAdd: () => void;
  onRemove: (repositoryRoot: string) => void;
  onSelect: (repositoryRoot: string) => void;
  repos: ReadonlyArray<string>;
}) {
  return (
    <div className="repo-switcher">
      <div className="repo-switcher-header">
        <span className="repo-switcher-title">Repositories</span>
        <button className="repo-switcher-add" onClick={onAdd} title="Add repository" type="button">
          +
        </button>
      </div>
      <ul className="repo-switcher-list">
        {repos.map((repositoryRoot) => (
          <li
            className={`repo-switcher-item${repositoryRoot === activeRoot ? ' active' : ''}`}
            key={repositoryRoot}
          >
            <button
              className="repo-switcher-select"
              onClick={() => onSelect(repositoryRoot)}
              title={repositoryRoot}
              type="button"
            >
              {compactPath(repositoryRoot)}
            </button>
            <button
              className="repo-switcher-remove"
              onClick={() => onRemove(repositoryRoot)}
              title="Remove from list"
              type="button"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
