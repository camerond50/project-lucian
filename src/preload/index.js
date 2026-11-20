const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lucianApi', {
  sendPrompt: (payload) => ipcRenderer.invoke('chat:send', payload),
  exportAnalytics: () => ipcRenderer.invoke('analytics:export'),
  analyticsPersistenceStatus: () =>
    ipcRenderer.invoke('analytics:persistence:status'),
  setAnalyticsPersistence: (enabled) =>
    ipcRenderer.invoke('analytics:persistence:set', enabled),
  observatorySnapshot: (filters) => ipcRenderer.invoke('observatory:snapshot', filters),
  onObservatorySnapshot: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('Callback required.');
    const handler = () => callback();
    ipcRenderer.on('observatory:dirty', handler);
    return () => ipcRenderer.removeListener('observatory:dirty', handler);
  },
  saveKey: (provider, keyValue) => ipcRenderer.invoke('keys:set', provider, keyValue),
  keyStatus: () => ipcRenderer.invoke('keys:status')
});
