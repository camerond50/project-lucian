'use strict';

(function startObservatoryView() {
  const $ = (id) => document.getElementById(id);
  const tabChat = $('tab-chat');
  const tabObs = $('tab-observatory');
  const chatView = $('chat-view');
  const obsView = $('observatory-view');
  const sourceFilter = $('obs-source-filter');
  const statusFilter = $('obs-status-filter');
  const canvas = $('obs-canvas');
  const ctx = canvas.getContext('2d');
  const pauseButton = $('obs-pause');
  const exportButton = $('obs-export');
  let latest = null;
  let paused = false;
  let viewVisible = false;
  let animationId = null;
  let pulses = [];
  let previousEventIds = new Set();
  let hasSnapshot = false;
  let selectedId = null;
  let renderError = false;

  const format = (n) => Number(n || 0).toLocaleString('en-US');
  const latency = (n) => n === null || n === undefined ? '—' : `${format(n)}ms`;
  const eventTime = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour12: false });

  function activate(observatory) {
    tabChat.setAttribute('aria-selected', String(!observatory));
    tabObs.setAttribute('aria-selected', String(observatory));
    chatView.hidden = observatory;
    obsView.hidden = !observatory;
    viewVisible = observatory;
    if (observatory) {
      refresh().catch(showError);
      animate();
    } else if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  function showError(error) {
    renderError = true;
    $('obs-status').textContent = 'TELEMETRY UNAVAILABLE';
    console.error('Observatory error', error);
  }

  async function refresh() {
    if (!window.lucianApi || typeof window.lucianApi.observatorySnapshot !== 'function') {
      throw new Error('Observatory integration unavailable in this desktop build.');
    }
    const data = await window.lucianApi.observatorySnapshot({
      source: sourceFilter.value,
      status: statusFilter.value
    });
    ingestSnapshot(data);
  }

  function setFilters() {
    if (paused) {
      paused = false;
      pauseButton.textContent = 'PAUSE VIEW';
      pauseButton.setAttribute('aria-pressed', 'false');
    }
    refresh().catch(showError);
  }

  function updateSources(sources) {
    const selected = sourceFilter.value;
    const present = new Set([...sourceFilter.options].map((option) => option.value));
    for (const source of sources) {
      if (!present.has(source.name)) {
        const option = document.createElement('option');
        option.value = source.name;
        option.textContent = source.name.toUpperCase();
        sourceFilter.appendChild(option);
      }
    }
    sourceFilter.value = [...sourceFilter.options].some((o) => o.value === selected) ? selected : 'all';
    const list = $('obs-source-list');
    list.replaceChildren();
    const displayed = [...sources].sort((a, b) => Number(b.active) - Number(a.active)).slice(0, 7);
    for (const source of displayed) {
      const row = document.createElement('div');
      row.className = 'obs-source-row';
      const name = document.createElement('span');
      name.textContent = source.name;
      const state = document.createElement('strong');
      state.className = source.active ? 'active' : '';
      state.textContent = source.active ? 'SIGNAL ACTIVE' : 'NO RECENT SIGNAL';
      row.append(name, state);
      list.appendChild(row);
    }
  }

  function renderTrail(events) {
    const list = $('obs-trail');
    list.replaceChildren();
    if (!events.length) {
      const empty = document.createElement('p');
      empty.className = 'obs-empty';
      empty.textContent = 'NO MATCHING EVENTS';
      list.appendChild(empty);
      return;
    }
    for (const event of events.slice(0, 80)) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'obs-trail-row';
      const time = document.createElement('time');
      time.dateTime = event.occurredAt;
      time.textContent = eventTime(event.occurredAt);
      const kind = document.createElement('span');
      kind.className = 'obs-event-kind';
      kind.textContent = `${event.source} / ${event.kind}`;
      const state = document.createElement('span');
      state.className = `obs-event-state ${event.status}`;
      state.textContent = event.status.toUpperCase();
      row.append(time, kind, state);
      row.addEventListener('click', () => {
        selectedId = event.id;
        $('obs-selected').textContent = JSON.stringify(event, null, 2);
      });
      list.appendChild(row);
    }
    if (selectedId && !events.some((event) => event.id === selectedId)) {
      selectedId = null;
      $('obs-selected').textContent = 'Select an event in the trail for sanitized details.';
    }
  }

  function renderTimeline(timeline) {
    const host = $('obs-bars');
    host.replaceChildren();
    const max = Math.max(1, ...timeline.map((bucket) => bucket.count));
    for (const bucket of timeline) {
      const bar = document.createElement('div');
      bar.className = 'obs-bar';
      bar.style.height = `${Math.max(2, (bucket.count / max) * 100)}%`;
      bar.title = `${bucket.count} events in a two-second interval`;
      host.appendChild(bar);
    }
  }

  function ingestSnapshot(data) {
    if (paused || !data || !data.metrics) return;
    const m = data.metrics;
    latest = data;
    renderError = false;
    $('obs-total').textContent = format(m.totalEvents);
    $('obs-backlog').textContent = format(m.backlog);
    $('obs-rate').textContent = m.eventsPerSec.toFixed(2);
    $('obs-flow-rate').textContent = m.eventsPerSec.toFixed(2);
    $('obs-stage-rate').textContent = `${m.eventsPerSec.toFixed(2)} EV/S`;
    $('obs-p90').textContent = latency(m.p90LatencyMs);
    $('obs-failures').textContent = format(m.failures60s);
    $('obs-sources-count').textContent = format(m.activeSources);
    $('obs-retries').textContent = format(m.retries60s);
    $('obs-fail-count').textContent = format(m.failures60s);
    $('obs-latency-range').textContent = `${latency(m.p50LatencyMs)} / ${latency(m.p99LatencyMs)}`;
    $('obs-persist').textContent = data.persistence.error ? 'ERROR' : data.persistence.enabled ? 'ON / LOCAL' : 'OFF';
    $('obs-status').textContent = m.activeSources > 0 ? 'LIVE EVENT SIGNAL' : 'NO RECENT EVENTS';
    $('obs-mode-dot').classList.toggle('live', m.activeSources > 0);
    $('obs-canvas-fallback').hidden = m.totalEvents > 0;
    updateSources(data.sources || []);
    renderTrail(data.events || []);
    renderTimeline(data.timeline || []);

    const now = performance.now();
    const newIds = new Set((data.events || []).map((e) => e.id));
    for (const event of (data.events || []).slice(0, 60)) {
      if (hasSnapshot && !previousEventIds.has(event.id)) pulses.push({ event, seenAt: now });
    }
    hasSnapshot = true; // Historical events never replay as live animation.
    previousEventIds = newIds;
    pulses = pulses.slice(-80);
  }

  function hash(string) {
    let h = 2166136261;
    for (const char of string) {
      h = Math.imul(h ^ char.charCodeAt(0), 16777619);
    }
    return h >>> 0;
  }

  function eventColor(status, alpha) {
    if (status === 'failed' || status === 'dead_letter') return `rgba(239,151,151,${alpha})`;
    if (status === 'retrying' || status === 'blocked') return `rgba(227,192,144,${alpha})`;
    if (status === 'completed') return `rgba(204,232,222,${alpha})`;
    return `rgba(163,186,204,${alpha})`;
  }

  function drawFrame(time) {
    if (!viewVisible || !ctx || !latest) return;
    const bounds = canvas.getBoundingClientRect();
    const w = bounds.width;
    const h = bounds.height;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w < 660 ? w * .36 : w * .39;
    const cy = h * .53;
    const r = Math.min(h * .40, w * .32);

    // Reticle and orbit. These are visual guides, not fake traffic.
    ctx.lineWidth = .5;
    for (const fraction of [.67, .79, .88, 1, 1.07]) {
      ctx.strokeStyle = fraction === 1 ? 'rgba(159,180,190,.32)' : 'rgba(100,116,127,.18)';
      ctx.beginPath();
      ctx.arc(cx, cy, r * fraction, 0, Math.PI * 2);
      ctx.stroke();
    }
    const ticks = 200;
    for (let i = 0; i < ticks; i++) {
      const a = i * (Math.PI * 2) / ticks - Math.PI / 2;
      const outer = r * (i % 10 === 0 ? 1.07 : 1.035);
      ctx.strokeStyle = i % 10 === 0 ? 'rgba(181,197,208,.44)' : 'rgba(127,144,155,.22)';
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * .94, cy + Math.sin(a) * r * .94);
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
      ctx.stroke();
    }

    const evs = [...latest.events].reverse();
    const max = Math.min(evs.length, 140);
    for (let i = 0; i < max; i++) {
      const event = evs[i];
      const seed = hash(event.id);
      const angle = (seed / 4294967295) * Math.PI * 2;
      const length = .22 + ((seed >>> 10) % 600) / 1000;
      const alpha = .075 + (i / Math.max(max, 1)) * .42;
      ctx.strokeStyle = eventColor(event.status, alpha);
      ctx.lineWidth = (i % 6 === 0 ? 1.1 : .6);
      ctx.beginPath();
      const start = r * (.17 + ((seed >>> 19) % 240) / 1000);
      const end = Math.min(r * .93, start + r * length);
      ctx.moveTo(cx + Math.cos(angle) * start, cy + Math.sin(angle) * start);
      ctx.lineTo(cx + Math.cos(angle) * end, cy + Math.sin(angle) * end);
      ctx.stroke();
      ctx.strokeStyle = eventColor(event.status, alpha * .8);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r * 1.09, cy + Math.sin(angle) * r * 1.09);
      ctx.lineTo(cx + Math.cos(angle) * r * (1.25 + ((seed >>> 16) % 650) / 1100), cy + Math.sin(angle) * r * (1.25 + ((seed >>> 16) % 650) / 1100));
      ctx.stroke();
    }

    // Each highlight starts only when a real event arrives; never synthesize events.
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    pulses = pulses.filter((p) => time - p.seenAt < 1800);
    for (const p of pulses) {
      const duration = reduceMotion ? 100 : 1800;
      const life = Math.max(0, 1 - (time - p.seenAt) / duration);
      if (life <= 0) continue;
      const angle = (hash(p.event.id) / 4294967295) * Math.PI * 2;
      ctx.strokeStyle = eventColor(p.event.status, life * .96);
      ctx.lineWidth = 1 + life * 1.2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r * .18, cy + Math.sin(angle) * r * .18);
      ctx.lineTo(cx + Math.cos(angle) * r * 1.35, cy + Math.sin(angle) * r * 1.35);
      ctx.stroke();
      ctx.fillStyle = eventColor(p.event.status, life);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, 2.5 + life, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function animate() {
    if (!viewVisible || animationId !== null) return;
    const loop = (time) => {
      animationId = null;
      if (!viewVisible) return;
      if (document.visibilityState === 'visible' && !renderError) drawFrame(time);
      animationId = requestAnimationFrame(loop);
    };
    animationId = requestAnimationFrame(loop);
  }

  function exportSafeJson() {
    if (!latest) return;
    const file = new Blob([JSON.stringify(latest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lucian-observatory-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  tabChat.addEventListener('click', () => activate(false));
  tabObs.addEventListener('click', () => activate(true));
  sourceFilter.addEventListener('change', setFilters);
  statusFilter.addEventListener('change', setFilters);
  pauseButton.addEventListener('click', () => {
    paused = !paused;
    pauseButton.textContent = paused ? 'RESUME VIEW' : 'PAUSE VIEW';
    pauseButton.setAttribute('aria-pressed', String(paused));
    if (!paused) refresh().catch(showError);
  });
  exportButton.addEventListener('click', exportSafeJson);

  if (window.lucianApi && typeof window.lucianApi.onObservatorySnapshot === 'function') {
    window.lucianApi.onObservatorySnapshot(() => {
      if (viewVisible && !paused) refresh().catch(showError);
    });
  }
  // Initialize actual in-memory stats; an empty store remains visibly empty.
  refresh().catch(showError);
})();
