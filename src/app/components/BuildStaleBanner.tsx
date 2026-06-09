import type { CodiffBuildInfo } from '../../types.ts';

// Fork dev aid: when the running app's bundle predates the working-tree HEAD
// (e.g. you edited source but haven't rebuilt), offer a one-click restart. Build
// info is stamped into dist/build-info.json by the codiff-build-info Vite plugin.
export function BuildStaleBanner({
  dismissed,
  info,
  onDismiss,
  onRestart,
}: {
  dismissed: boolean;
  info: CodiffBuildInfo | null;
  onDismiss: () => void;
  onRestart: () => void;
}) {
  if (!info?.isStale || dismissed) {
    return null;
  }

  return (
    <div className="build-stale-banner">
      <span className="build-stale-message">
        A newer build is available ({info.builtCommit} → {info.currentCommit}).
      </span>
      <div className="build-stale-actions">
        <button className="build-stale-restart" onClick={onRestart} type="button">
          Restart
        </button>
        <button className="build-stale-dismiss" onClick={onDismiss} type="button">
          Dismiss
        </button>
      </div>
    </div>
  );
}
