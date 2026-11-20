# Lucian Event Observatory — implementation and integration handoff

**Build date:** 2026-11-20  
**Target:** Existing `camerond50/project-lucian` Electron companion.  
**Scope:** Add a real-event *read-only observability tab*. Do **not** create another Command Center, agent, local Second Brain, or repository.

## State of implementation

- `Event Observatory` tab added to the existing desktop window.
- Circular event map uses actual recorded events only; at zero events the display explicitly says it is awaiting data. The radial scaffold is decorative; event rays and pulses correspond to ingested events.
- Main process emits `running`, `completed`, and `failed` events for real Lucian chat turns. It does not capture raw prompts, responses, files, tool inputs, error stack traces, or secrets.
- A local-only event store captures `source`, `kind`, `status`, `workId`, `traceId`, `latencyMs`, `attempt`, `errorCode`, `occurredAt`, `id` with bounded retention (900 in memory by default).
- Snapshot API provides measured events/sec, P50/P90/P99 of completed events, active work backlog, failure and retry counts, source heartbeats, and 60-second arrival timeline.
- A loopback HTTP receiver can be enabled **explicitly** using an environment secret. It does not execute work or control agents. Without configuration it does not listen on any port.
- Privacy-safe local persistence follows the pre-existing analytics persistence toggle. When disabled, new events remain in memory; previously saved files are retained consistently with pre-existing analytics behavior.
- Tests cover input validation, privacy redaction, state transitions, metrics, persistence, HTTP authentication, 4 KB body cap, and loopback-only binding.

## Important deployment boundary

`Dixon-Desktop` was offline at build time, so the existing Windows installation, local Command Center at `127.0.0.1:8787`, OpenClaw source checkout, and canonical Second Brain could not be inspected, modified, or smoke-tested. This contribution is prepared for **the existing GitHub Electron companion**, not yet deployed to the live Command Center. Do not replace or repoint the canonical Command Center, alter port 8787, start a new Second Brain, change OpenClaw configurations, or merge without confirming which local build is current.

## Installation and local smoke test

1. Review the branch against your existing Electron companion. Merge only after Codex confirms alignment with current local version.
2. In the existing companion's checkout run `npm ci`, `npm test`, and `npm start`.
3. Select **Event Observatory**. At first it should show zero events and *Awaiting real events*.
4. Select **Conversation**, send a normal chat prompt, return to **Event Observatory**. A `running` and a `completed` event should be visible, and the backlog should return to zero.
5. Toggle existing **Persist analytics locally** in Conversation. Observatory events should now be written in the Electron userData directory to `lucian-observatory-events.v1.json`. Confirm files are permission-restricted by the local OS account.
6. Disconnect/restart and confirm opt-in persisted history loads without requiring raw prompt access.

## Receiving events from local services (optional)

This receiver is **disabled unless** the environment variable `LUCIAN_OBSERVATORY_INGEST_TOKEN` is set to a random string of 32 bytes or more. It binds to `127.0.0.1:8791` (port configurable via `LUCIAN_OBSERVATORY_PORT`). It never binds to LAN interfaces.

Windows PowerShell example for a temporary current-process token:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$env:LUCIAN_OBSERVATORY_INGEST_TOKEN = [Convert]::ToBase64String($bytes)
$env:LUCIAN_OBSERVATORY_PORT = '8791'
npm start
```

From another process running as the authorized local user *with the same token*, submit sanitized metadata (never send a full agent transcript):

```powershell
$event = @{ source='openclaw'; kind='agent.run'; status='completed'; workId='example-run-123'; latencyMs=250; attempt=1 } | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8791/v1/events' -Headers @{ Authorization = "Bearer $env:LUCIAN_OBSERVATORY_INGEST_TOKEN" } -ContentType 'application/json' -Body $event
```

The receiver responds HTTP `202` with a generated event ID, `401` for bad authorization, `400` for invalid events, or `413` for oversized bodies. The secret is not exposed to the renderer. Never hardcode or commit the token. Note: the ingest endpoint accepts trusted *telemetry claims*; it cannot independently prove a worker succeeded. Real verification requires upstream completion receipts.

### Minimal event schema

```json
{
  "source": "codex",
  "kind": "build.test",
  "status": "completed",
  "workId": "example-build-123",
  "traceId": "example-trace-123",
  "latencyMs": 872,
  "attempt": 1
}
```

Required: `source`, `kind`, `status` (`queued`, `running`, `completed`, `failed`, `retrying`, `blocked`, `dead_letter`). Optional: `workId`, `traceId`, `latencyMs`, `attempt`, `errorCode`. Unknown fields are dropped. Identifiers are normalized to safe short tokens; **do not pass file paths, private customer details, personal content, or secret-bearing IDs** in identifier fields.

### Mapping external runtimes — integration checklist for Codex

| Source | Candidate signal | Dependency |
|---|---|---|
| Existing Command Center | Operator request, routed tool, completed/failed dispatch | Verify active handler schema at port 8787; add adapter in place |
| OpenClaw | Agent run started/finished, tool call, retry | Verify current gateway and authorized hook path; no assumed live runtime |
| Codex | Build/test started/finished, patch validation | Use local commit/test receipt hooks or explicit wrappers; no claim of auto-run |
| Ollama/Qwen | Inference request/complete, latency | Instrument existing Ollama gateway/wrapper; no invasive process interception |
| Second Brain | Ingestion started, indexed, verified readback | Connect to canonical ingest receipts; no duplicate writer |
| Automations | Due, launched, completed, missed, failed | Wire existing scheduler and result receipts, not time-based guesses |

Prefer one event envelope and one existing authenticated local intake rather than a second agent orchestration loop. Correlation IDs should be stable across services without encoding private material.

## What is **not** built yet

- Not installed in the currently running Command Center at port 8787; no promise of desktop deployment while offline.
- Not connected to live OpenClaw, Codex, Ollama, scheduler, Gmail, or Second Brain services: each integration requires verification and adapter installation.
- No Postgres transactional outbox, message broker, agent replay, write-ahead queue, alerting pager, or guaranteed exactly-once delivery. The HTTP receiver can lose telemetry if the app is stopped; `202` signifies acceptance into the local in-memory store, not durable execution.
- No authenticated remote/mobile access. Do not expose this HTTP receiver outside loopback or add open firewall rules.
- No benchmark claim of 210 events/sec, 30ms P90, or other numbers from the reference image. Those numbers belong to the reference, not this implementation.

## Follow-on Codex work after the desktop is reachable

1. Confirm the **current** canonical Command Center code, Electron companion relationship, and whether the GitHub repo is deployed anywhere. Preserve all existing backups, data, configs, work logs and path identities.
2. Integrate event schema at **existing execution boundaries** (not fake timers). Map work IDs, structured run receipts, error codes, and safe latencies. Verify via actual operations and readback.
3. Decide where the authoritative event ledger lives (existing database/outbox if present). Migrate the UI to consume that ledger instead of running two event stores; leave action execution under existing approval gates.
4. Add explicit backlog SLA, error budget, retry policy observability, dead-letter panels, freshness, and selected-run trace drilldowns.
5. Verify end-to-end on Windows, using low-volume tests first, then controlled load tests. Never use test fixtures as production metrics.

**Acceptance rule:** The system must report zero/unknown if no real event evidence exists. A graph, animation, or “success” badge without a run receipt is not sufficient proof that work happened.
