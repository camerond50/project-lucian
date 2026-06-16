const fs = require('fs');
const path = require('path');

const ANALYTICS_PERSISTENCE_SCHEMA_VERSION = 'lucian.analytics.persistence.v1';
const DEFAULT_SETTINGS = {
  schemaVersion: ANALYTICS_PERSISTENCE_SCHEMA_VERSION,
  enabled: false,
  updatedAt: null
};

function createSafeStoragePath(storageDir, filename) {
  const resolvedDir = path.resolve(storageDir);
  const resolvedPath = path.resolve(resolvedDir, filename);

  if (!resolvedPath.startsWith(resolvedDir)) {
    throw new Error('Analytics persistence path must stay inside storage directory.');
  }

  return resolvedPath;
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function createAnalyticsPersistence({
  storageDir,
  settingsFilename = 'lucian-analytics-settings.json',
  eventsFilename = 'lucian-analytics-local.json'
}) {
  if (!storageDir) {
    throw new Error('storageDir is required for analytics persistence.');
  }

  const settingsPath = createSafeStoragePath(storageDir, settingsFilename);
  const eventsPath = createSafeStoragePath(storageDir, eventsFilename);

  function loadSettings() {
    const settings = readJsonFile(settingsPath, DEFAULT_SETTINGS);

    return {
      ...DEFAULT_SETTINGS,
      ...settings,
      schemaVersion: ANALYTICS_PERSISTENCE_SCHEMA_VERSION,
      enabled: Boolean(settings.enabled)
    };
  }

  function loadPersistedAnalytics() {
    return readJsonFile(eventsPath, null);
  }

  function getStatus() {
    const settings = loadSettings();
    const persistedAnalytics = loadPersistedAnalytics();

    return {
      schemaVersion: ANALYTICS_PERSISTENCE_SCHEMA_VERSION,
      enabled: settings.enabled,
      updatedAt: settings.updatedAt,
      storagePath: eventsPath,
      settingsPath,
      persistedEventCount: persistedAnalytics?.eventCount ?? 0,
      lastPersistedAt: persistedAnalytics?.generatedAt ?? null
    };
  }

  function setEnabled(enabled, exportPayload = null) {
    const settings = {
      schemaVersion: ANALYTICS_PERSISTENCE_SCHEMA_VERSION,
      enabled: Boolean(enabled),
      updatedAt: new Date().toISOString()
    };

    writeJsonFile(settingsPath, settings);

    if (settings.enabled && exportPayload) {
      persist(exportPayload);
    }

    return getStatus();
  }

  function persist(exportPayload) {
    const settings = loadSettings();

    if (!settings.enabled || !exportPayload) {
      return getStatus();
    }

    writeJsonFile(eventsPath, exportPayload);
    return getStatus();
  }

  return {
    getStatus,
    loadPersistedAnalytics,
    persist,
    setEnabled
  };
}

module.exports = {
  ANALYTICS_PERSISTENCE_SCHEMA_VERSION,
  createAnalyticsPersistence
};
