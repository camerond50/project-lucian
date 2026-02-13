const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { handlePrompt } = require('../engine/engine');
const { secureKeyStore } = require('../engine/secureKeyStore');

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
  ipcMain.handle('chat:send', async (_event, payload) => {
    return handlePrompt(payload);
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
