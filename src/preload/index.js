const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lucianApi', {
  sendPrompt: (payload) => ipcRenderer.invoke('chat:send', payload),
  saveKey: (provider, keyValue) =>
    ipcRenderer.invoke('keys:set', provider, keyValue),
  keyStatus: () => ipcRenderer.invoke('keys:status')
});
