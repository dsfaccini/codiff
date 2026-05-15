import type { RepositoryHistory, RepositoryState, ReviewSource } from './types.ts';

declare global {
  interface Window {
    codiff: {
      addRepo: (path: string) => Promise<string>;
      getBuildInfo: () => Promise<{
        builtAt?: string;
        builtCommit?: string;
        currentCommit?: string;
        isStale: boolean;
      }>;
      getRelativePath: (path: string) => Promise<string>;
      getRepositoryHistory: (limit?: number) => Promise<RepositoryHistory>;
      getRepositoryState: (source?: ReviewSource) => Promise<RepositoryState>;
      getRepositoryStateForRoot: (root: string) => Promise<RepositoryState>;
      listRepos: () => Promise<Array<string>>;
      onRepoAdded: (callback: (root: string) => void) => void;
      pickFolder: () => Promise<string | null>;
      removeRepo: (root: string) => Promise<void>;
      restartApp: () => Promise<void>;
      setSelectedRepo: (root: string) => Promise<boolean>;
      showInFolder: (path: string) => Promise<void>;
    };
  }
}
