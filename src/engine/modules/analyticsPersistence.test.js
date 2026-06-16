import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import analyticsPersistence from './analyticsPersistence.js';

const {
  ANALYTICS_PERSISTENCE_SCHEMA_VERSION,
  createAnalyticsPersistence
} = analyticsPersistence;

let tempDir;

function buildExportPayload(eventCount = 1) {
  return {
    schemaVersion: 'lucian.analytics.export.v1',
    generatedAt: new Date(5000).toISOString(),
    eventCount,
    summary: {
      totalInteractions: eventCount,
      byIntent: {
        development: eventCount
      },
      byProvider: {
        'local-engine': eventCount
      },
      lastEventAt: new Date(5000).toISOString()
    },
    events: [
      {
        id: 'interaction_test',
        createdAt: new Date(5000).toISOString(),
        provider: 'local-engine',
        intent: 'development',
        promptStats: {
          characterCount: 12,
          wordCount: 2,
          hasQuestion: false
        },
        avatarMood: 'focused',
        latencyMs: 100
      }
    ]
  };
}

describe('analyticsPersistence', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucian-analytics-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { force: true, recursive: true });
  });

  it('starts disabled and does not persist analytics until explicitly enabled', () => {
    const persistence = createAnalyticsPersistence({ storageDir: tempDir });

    const status = persistence.persist(buildExportPayload());

    expect(status).toMatchObject({
      schemaVersion: ANALYTICS_PERSISTENCE_SCHEMA_VERSION,
      enabled: false,
      persistedEventCount: 0,
      lastPersistedAt: null
    });
    expect(persistence.loadPersistedAnalytics()).toBeNull();
  });

  it('enables local persistence and writes privacy-safe export payloads', () => {
    const persistence = createAnalyticsPersistence({ storageDir: tempDir });
    const sourcePrompt = 'this raw prompt must not be persisted';
    const exportPayload = buildExportPayload();

    persistence.setEnabled(true, exportPayload);
    const status = persistence.persist(exportPayload);
    const persistedAnalytics = persistence.loadPersistedAnalytics();

    expect(status.enabled).toBe(true);
    expect(status.persistedEventCount).toBe(1);
    expect(persistedAnalytics.eventCount).toBe(1);
    expect(JSON.stringify(persistedAnalytics)).not.toContain(sourcePrompt);
    expect(persistedAnalytics.events[0].prompt).toBeUndefined();
  });

  it('keeps existing analytics file when persistence is disabled', () => {
    const persistence = createAnalyticsPersistence({ storageDir: tempDir });
    const firstPayload = buildExportPayload(1);
    const secondPayload = buildExportPayload(2);

    persistence.setEnabled(true, firstPayload);
    persistence.setEnabled(false, secondPayload);
    const status = persistence.persist(secondPayload);
    const persistedAnalytics = persistence.loadPersistedAnalytics();

    expect(status.enabled).toBe(false);
    expect(persistedAnalytics.eventCount).toBe(1);
  });

  it('rejects settings and event filenames that escape the storage directory', () => {
    expect(() =>
      createAnalyticsPersistence({
        storageDir: tempDir,
        settingsFilename: '../lucian-analytics-settings.json'
      })
    ).toThrow('Analytics persistence path must stay inside storage directory.');

    expect(() =>
      createAnalyticsPersistence({
        storageDir: tempDir,
        eventsFilename: '../lucian-analytics-local.json'
      })
    ).toThrow('Analytics persistence path must stay inside storage directory.');
  });
});
