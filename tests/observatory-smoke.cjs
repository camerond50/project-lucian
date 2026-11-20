'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { createEventObservatory, normalizeEvent, percentile } = require('../src/engine/modules/eventObservatory');
const { startObservatoryReceiver } = require('../src/engine/modules/observatoryReceiver');

const SECRET = 'test-only-strong-token-32-bytes-minimum-123';

function emit(store, status = 'completed', other = {}) {
  return store.ingest({ source: 'lucian-desktop', kind: 'chat.turn', status, ...other });
}

test('event allowlist rejects sensitive content and unrecognized states', () => {
  const input = {
    source: 'Lucian Desktop', kind: 'chat.turn', status: 'completed',
    latencyMs: 12, prompt: 'TOP SECRET PROMPT',
    apiKey: 'top-secret-key', error: 'unredacted stacktrace',
    workId: 'track_123', errorCode: 'timeout'
  };
  const safe = normalizeEvent(input, 1000);
  assert.equal(safe.source, 'lucian-desktop');
  assert.equal(safe.kind, 'chat.turn');
  assert.equal(safe.workId, 'track_123');
  assert.ok(!JSON.stringify(safe).includes('TOP SECRET'));
  assert.ok(!JSON.stringify(safe).includes('top-secret-key'));
  assert.ok(!JSON.stringify(safe).includes('stacktrace'));
  assert.throws(() => normalizeEvent({ source: 'x', kind: 'test', status: 'hacked' }), /Invalid event status/);
  assert.throws(() => normalizeEvent('x'), /JSON object/);
});

test('metrics use actual events and follow work-state transitions', () => {
  let clock = 1_700_000_000_000;
  const store = createEventObservatory({ now: () => clock });
  assert.equal(store.snapshot().metrics.totalEvents, 0);
  emit(store, 'queued', { workId: 'work-1' });
  emit(store, 'running', { workId: 'work-1' });
  emit(store, 'retrying', { workId: 'work-2', attempt: 2 });
  assert.equal(store.snapshot().metrics.backlog, 2);
  emit(store, 'completed', { workId: 'work-1', latencyMs: 14 });
  emit(store, 'failed', { workId: 'work-2', latencyMs: 190 });
  let snap = store.snapshot();
  assert.equal(snap.metrics.backlog, 0);
  assert.equal(snap.metrics.totalEvents, 5);
  assert.equal(snap.metrics.eventsPerSec, 0.08);
  assert.equal(snap.metrics.retries60s, 1);
  assert.equal(snap.metrics.failures60s, 1);
  assert.equal(snap.metrics.p90LatencyMs, 14); // only completed events
  assert.equal(snap.metrics.activeSources, 1);
  assert.equal(snap.timeline.reduce((s, x) => s + x.count, 0), 5);
  assert.equal(store.snapshot({ status: 'failed' }).events.length, 1);
  clock += 180_000;
  snap = store.snapshot();
  assert.equal(snap.metrics.eventsPerSec, 0);
  assert.equal(snap.metrics.activeSources, 0);
  assert.equal(snap.metrics.p90LatencyMs, null);
  assert.deepEqual([percentile([10, 20, 30], .5), percentile([10, 20, 30], .9)], [20, 30]);
});

test('privacy-safe storage is opt-in, bounded, and restorable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucian-observatory-test-'));
  try {
    const store = createEventObservatory({ storageDir: dir, limit: 50 });
    for (let i = 0; i < 75; i++) emit(store, 'completed', { workId: `w-${i}`, latencyMs: i });
    store.flush();
    const file = path.join(dir, 'lucian-observatory-events.v1.json');
    assert.equal(fs.existsSync(file), false);
    assert.equal(store.snapshot().metrics.bufferedEvents, 50);
    assert.equal(store.snapshot().metrics.totalEvents, 75);
    store.setPersistenceEnabled(true);
    store.flush();
    assert.equal(fs.existsSync(file), true);
    const restored = createEventObservatory({ storageDir: dir, persistenceEnabled: true });
    const snap = restored.snapshot();
    assert.equal(snap.metrics.totalEvents, 75);
    assert.equal(snap.metrics.bufferedEvents, 50);
    assert.ok(!fs.readFileSync(file, 'utf8').includes('prompt'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('listener failures do not block ingested telemetry', () => {
  const store = createEventObservatory();
  const unsubscribe = store.subscribe(() => { throw new Error('bad subscriber'); });
  const ev = emit(store);
  assert.equal(store.snapshot().events[0].id, ev.id);
  unsubscribe();
});

test('loopback HTTP receiver requires authorization and never executes payloads', async () => {
  const store = createEventObservatory();
  const server = startObservatoryReceiver({ observatory: store, token: SECRET, port: 0 });
  try {
    await new Promise((resolve, reject) => {
      if (server.listening) return resolve();
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const endpoint = `http://127.0.0.1:${server.address().port}/v1/events`;
    const body = JSON.stringify({ source: 'openclaw', kind: 'agent.run', status: 'completed', workId: 'work-5', prompt: 'never log' });
    const bad = await fetch(endpoint, { method: 'POST', body });
    assert.equal(bad.status, 401);
    assert.equal(store.snapshot().metrics.totalEvents, 0);
    const good = await fetch(endpoint, {
      method: 'POST', headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' }, body
    });
    assert.equal(good.status, 202);
    assert.equal(store.snapshot().metrics.totalEvents, 1);
    const safeEvent = store.snapshot().events[0];
    assert.equal(safeEvent.source, 'openclaw');
    assert.ok(!JSON.stringify(safeEvent).includes('never log'));
    const oversized = await fetch(endpoint, {
      method: 'POST', headers: { Authorization: `Bearer ${SECRET}` }, body: 'x'.repeat(6000)
    });
    assert.equal(oversized.status, 413);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('receiver cannot bind to interfaces other than loopback', () => {
  assert.throws(() => startObservatoryReceiver({
    observatory: createEventObservatory(), token: SECRET, port: 0, host: '0.0.0.0'
  }), /loopback/);
});
