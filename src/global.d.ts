import type { RepositoryHistory, RepositoryState, ReviewSource } from './types.ts';

declare global {
  interface Window {
    codiff: {
      addRepo: (path: string) => Promise<string>;
      getRelativePath: (path: string) => Promise<string>;
      getRepositoryHistory: (limit?: number) => Promise<RepositoryHistory>;
      getRepositoryState: (source?: ReviewSource) => Promise<RepositoryState>;
      getRepositoryStateForRoot: (root: string) => Promise<RepositoryState>;
      listRepos: () => Promise<Array<string>>;
      pickFolder: () => Promise<string | null>;
      removeRepo: (root: string) => Promise<void>;
      setSelectedRepo: (root: string) => Promise<boolean>;
      showInFolder: (path: string) => Promise<void>;
    };
  }
}
