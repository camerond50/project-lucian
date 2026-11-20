const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const crypto = require('crypto');
const { handlePrompt } = require('../engine/engine');
const { exportInteractionAnalytics } = require('../engine/modules/analyticsLogger');
const {
  createAnalyticsPersistence
} = require('../engine/modules/analyticsPersistence');
const { createEventObservatory } = require('../engine/modules/eventObservatory');
const { startObservatoryReceiver } = require('../engine/modules/observatoryReceiver');
const { secureKeyStore } = require('../engine/secureKeyStore');

let analyticsPersistence;
let observatory;
let receiver;
let changeTimer = null;

function notifyObservatory() {
  // A dirty notification rather than a full event payload avoids IPC flooding.
  if (changeTimer) return;
  changeTimer = setTimeout(() => {
    changeTimer = null;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('observatory:dirty');
    }
  }, 180);
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
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
  observatory = createEventObservatory({
    storageDir: app.getPath('userData'),
    persistenceEnabled: analyticsPersistence.getStatus().enabled
  });
  observatory.subscribe(notifyObservatory);

  // This is strictly opt-in. Never bind to 0.0.0.0 or expose on the LAN.
  const token = process.env.LUCIAN_OBSERVATORY_INGEST_TOKEN;
  if (token) {
    try {
      const port = Number(process.env.LUCIAN_OBSERVATORY_PORT || 8791);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new TypeError('Invalid observatory port.');
      }
      receiver = startObservatoryReceiver({ observatory, token, port });
      receiver.on('error', (error) => {
        console.error('Observatory loopback receiver unavailable:', error.code || 'error');
      });
    } catch (error) {
      console.error('Observatory receiver disabled:', error.message);
    }
  }

  ipcMain.handle('chat:send', async (_event, payload) => {
    const startedAt = Date.now();
    const workId = crypto.randomUUID();
    observatory.ingest({
      source: 'lucian-desktop', kind: 'chat.turn', status: 'running', workId
    });
    try {
      const result = await handlePrompt(payload);
      analyticsPersistence.persist(exportInteractionAnalytics());
      observatory.ingest({
        source: 'lucian-desktop', kind: 'chat.turn', status: 'completed',
        workId, latencyMs: Date.now() - startedAt
      });
      return result;
    } catch (error) {
      // Capture only a code, not a raw exception or the prompt.
      observatory.ingest({
        source: 'lucian-desktop', kind: 'chat.turn', status: 'failed',
        workId, errorCode: 'chat-handler-failed'
      });
      throw error;
    }
  });

  ipcMain.handle('observatory:snapshot', (_event, filters) => {
    return observatory.snapshot({
      source: typeof filters?.source === 'string' ? filters.source : 'all',
      status: typeof filters?.status === 'string' ? filters.status : 'all'
    });
  });

  ipcMain.handle('analytics:export', () => exportInteractionAnalytics());
  ipcMain.handle('analytics:persistence:status', () => {
    return analyticsPersistence.getStatus();
  });
  ipcMain.handle('analytics:persistence:set', (_event, enabled) => {
    const status = analyticsPersistence.setEnabled(enabled, exportInteractionAnalytics());
    observatory.setPersistenceEnabled(status.enabled);
    notifyObservatory();
    return status;
  });
  ipcMain.handle('keys:set', (_event, provider, keyValue) => {
    return secureKeyStore.set(provider, keyValue);
  });
  ipcMain.handle('keys:status', () => secureKeyStore.status());

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (changeTimer) clearTimeout(changeTimer);
  if (observatory) observatory.flush();
  if (receiver) receiver.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
