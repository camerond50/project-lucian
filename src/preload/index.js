const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lucianApi', {
  sendPrompt: (payload) => ipcRenderer.invoke('chat:send', payload),
  exportAnalytics: () => ipcRenderer.invoke('analytics:export'),
  saveKey: (provider, keyValue) =>
    ipcRenderer.invoke('keys:set', provider, keyValue),
  keyStatus: () => ipcRenderer.invoke('keys:status')
});
