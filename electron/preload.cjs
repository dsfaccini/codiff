const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codiff', {
  addRepo: (path) => ipcRenderer.invoke('codiff:addRepo', path),
  getRelativePath: (path) => ipcRenderer.invoke('codiff:getRelativePath', path),
  getRepositoryHistory: (limit) => ipcRenderer.invoke('codiff:getRepositoryHistory', limit),
  getRepositoryState: (source) => ipcRenderer.invoke('codiff:getRepositoryState', source),
  getRepositoryStateForRoot: (root) => ipcRenderer.invoke('codiff:getRepositoryStateForRoot', root),
  listRepos: () => ipcRenderer.invoke('codiff:listRepos'),
  pickFolder: () => ipcRenderer.invoke('codiff:pickFolder'),
  removeRepo: (root) => ipcRenderer.invoke('codiff:removeRepo', root),
  setSelectedRepo: (root) => ipcRenderer.invoke('codiff:setSelectedRepo', root),
  showInFolder: (path) => ipcRenderer.invoke('codiff:showInFolder', path),
});
