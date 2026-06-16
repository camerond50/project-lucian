const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lucianApi', {
  sendPrompt: (payload) => ipcRenderer.invoke('chat:send', payload),
  exportAnalytics: () => ipcRenderer.invoke('analytics:export'),
  analyticsPersistenceStatus: () =>
    ipcRenderer.invoke('analytics:persistence:status'),
  setAnalyticsPersistence: (enabled) =>
    ipcRenderer.invoke('analytics:persistence:set', enabled),
  saveKey: (provider, keyValue) =>
    ipcRenderer.invoke('keys:set', provider, keyValue),
  keyStatus: () => ipcRenderer.invoke('keys:status')
});
