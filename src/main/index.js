const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { handlePrompt } = require('../engine/engine');
const { exportInteractionAnalytics } = require('../engine/modules/analyticsLogger');
const {
  createAnalyticsPersistence
} = require('../engine/modules/analyticsPersistence');
const { secureKeyStore } = require('../engine/secureKeyStore');

let analyticsPersistence;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 740,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  analyticsPersistence = createAnalyticsPersistence({
    storageDir: app.getPath('userData')
  });

  ipcMain.handle('chat:send', async (_event, payload) => {
    const result = await handlePrompt(payload);
    analyticsPersistence.persist(exportInteractionAnalytics());
    return result;
  });

  ipcMain.handle('analytics:export', () => {
    return exportInteractionAnalytics();
  });

  ipcMain.handle('analytics:persistence:status', () => {
    return analyticsPersistence.getStatus();
  });

  ipcMain.handle('analytics:persistence:set', (_event, enabled) => {
    return analyticsPersistence.setEnabled(enabled, exportInteractionAnalytics());
  });

  ipcMain.handle('keys:set', (_event, provider, keyValue) => {
    return secureKeyStore.set(provider, keyValue);
  });

  ipcMain.handle('keys:status', () => {
    return secureKeyStore.status();
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
