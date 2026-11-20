'use strict';

// Read-only operational telemetry. No raw prompts, tool arguments, file paths,
// email content or arbitrary error messages are accepted into the event store.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCHEMA = 'lucian.observatory.v1';
const STATUSES = new Set([
  'queued', 'running', 'completed', 'failed', 'retrying', 'blocked', 'dead_letter'
]);
const ACTIVE = new Set(['queued', 'running', 'retrying']);
const DEFAULT_SOURCES = ['lucian-desktop', 'command-center', 'openclaw', 'codex', 'ollama', 'second-brain', 'automation'];

function token(value, fallback = 'unknown', length = 72) {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9._:-]/g, '-').slice(0, length);
  return cleaned || fallback;
}

function optionalToken(value, length = 96) {
  return typeof value === 'string' && value.trim() ? token(value, '', length) : null;
}

function boundedNumber(value, max) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.min(max, Math.round(value));
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

function normalizeEvent(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Event must be a JSON object.');
  }
  if (typeof raw.source !== 'string' || !raw.source.trim()) {
    throw new TypeError('A source identifier is required.');
  }
  if (typeof raw.kind !== 'string' || !raw.kind.trim()) {
    throw new TypeError('An event kind is required.');
  }
  if (!STATUSES.has(raw.status)) {
    throw new TypeError('Invalid event status.');
  }

  // Never trust upstream timestamps for throughput metrics. Use receipt time.
  return Object.freeze({
    id: crypto.randomUUID(),
    occurredAt: new Date(now).toISOString(),
    source: token(raw.source),
    kind: token(raw.kind),
    status: raw.status,
    workId: optionalToken(raw.workId),
    traceId: optionalToken(raw.traceId),
    latencyMs: boundedNumber(raw.latencyMs, 3_600_000),
    attempt: boundedNumber(raw.attempt, 1_000),
    errorCode: optionalToken(raw.errorCode, 48)
  });
}

function createEventObservatory({
  now = Date.now,
  limit = 900,
  storageDir = null,
  persistenceEnabled = false
} = {}) {
  const capacity = Math.max(50, Math.min(5_000, Math.trunc(limit) || 900));
  const events = [];
  const listeners = new Set();
  const filePath = storageDir ? path.join(storageDir, 'lucian-observatory-events.v1.json') : null;
  let totalIngested = 0;
  let enabled = Boolean(persistenceEnabled && filePath);
  let writeTimer = null;
  let persistenceError = null;

  if (enabled && fs.existsSync(filePath)) {
    try {
      const restored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (restored.schemaVersion === SCHEMA && Array.isArray(restored.events)) {
        // Restored events are re-normalized into the same strict schema.
        for (const raw of restored.events.slice(-capacity)) {
          const time = Date.parse(raw.occurredAt);
          const e = normalizeEvent(raw, Number.isFinite(time) ? time : now());
          events.push({ ...e, id: e.id });
        }
        totalIngested = Math.max(events.length, Number(restored.totalIngested) || 0);
      }
    } catch (error) {
      persistenceError = `restore:${error.code || 'invalid-file'}`;
    }
  }

  function flush() {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = null;
    if (!enabled || !filePath) return;
    const tmp = `${filePath}.tmp`;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify({ schemaVersion: SCHEMA, totalIngested, events }), {
        encoding: 'utf8', mode: 0o600
      });
      fs.renameSync(tmp, filePath);
      persistenceError = null;
    } catch (error) {
      persistenceError = `save:${error.code || 'write-error'}`;
    }
  }

  function scheduleFlush() {
    if (!enabled || writeTimer) return;
    writeTimer = setTimeout(flush, 250);
    if (typeof writeTimer.unref === 'function') writeTimer.unref();
  }

  function ingest(raw) {
    const event = normalizeEvent(raw, now());
    events.push(event);
    if (events.length > capacity) events.splice(0, events.length - capacity);
    totalIngested += 1;
    scheduleFlush();
    for (const listener of listeners) {
      try { listener(event); } catch { /* isolate subscribers */ }
    }
    return event;
  }

  function snapshot({ source = 'all', status = 'all', limit: take = 140 } = {}) {
    const currentTime = now();
    const recentTime = currentTime - 60_000;
    const recent = events.filter((e) => Date.parse(e.occurredAt) >= recentTime);
    const latencies = recent
      .filter((e) => e.status === 'completed' && e.latencyMs !== null)
      .map((e) => e.latencyMs);
    const workStates = new Map();
    for (const e of events) {
      if (e.workId) workStates.set(`${e.source}:${e.workId}`, e.status);
    }
    const backlog = [...workStates.values()].filter((s) => ACTIVE.has(s)).length;
    const sourceMap = new Map(DEFAULT_SOURCES.map((name) => [name, null]));
    for (const e of events) sourceMap.set(e.source, e.occurredAt);
    // The primary app is integrated, but it is not marked 'active' before its first event.
    const sources = [...sourceMap].map(([name, lastSeenAt]) => ({
      name,
      lastSeenAt,
      active: Boolean(lastSeenAt && Date.parse(lastSeenAt) >= currentTime - 120_000)
    }));
    const timeline = Array.from({ length: 30 }, (_, index) => ({
      second: (index - 29) * 2,
      count: 0
    }));
    for (const e of recent) {
      const index = Math.min(29, Math.floor((Date.parse(e.occurredAt) - recentTime) / 2_000));
      if (index >= 0 && index < timeline.length) timeline[index].count += 1;
    }
    const selected = events
      .filter((e) => (source === 'all' || e.source === source) && (status === 'all' || e.status === status))
      .slice(-Math.min(Math.max(Math.trunc(take) || 140, 1), capacity))
      .reverse();

    return {
      schemaVersion: SCHEMA,
      generatedAt: new Date(currentTime).toISOString(),
      metrics: {
        totalEvents: totalIngested,
        bufferedEvents: events.length,
        eventsPerSec: Number((recent.length / 60).toFixed(2)),
        backlog,
        failures60s: recent.filter((e) => e.status === 'failed' || e.status === 'dead_letter').length,
        retries60s: recent.filter((e) => e.status === 'retrying').length,
        p50LatencyMs: percentile(latencies, 0.5),
        p90LatencyMs: percentile(latencies, 0.9),
        p99LatencyMs: percentile(latencies, 0.99),
        activeSources: sources.filter((s) => s.active).length
      },
      timeline,
      sources,
      events: selected,
      persistence: { enabled, error: persistenceError }
    };
  }

  function setPersistenceEnabled(value) {
    enabled = Boolean(value && filePath);
    if (enabled) flush();
    return { enabled, error: persistenceError };
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Expected callback.');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { ingest, snapshot, subscribe, flush, setPersistenceEnabled };
}

module.exports = {
  SCHEMA, STATUSES, createEventObservatory, normalizeEvent, percentile
};
