# API Keys Model Status Automation — Design

**Date:** 2026-08-09
**Status:** Approved (brainstorming) — pending spec review, then implementation plan
**Scope:** GUI API Keys → External model catalog Status column only. Builds on the structure-first Status column (manual per-row Test).

## Problem

The Status column after Protocols is filled only when the user clicks **Test** per row. With dozens of callable models, that does not surface health at a glance. Automation should reuse the same Status field so a later change does not invent a second UI.

## Goals

1. **Auto-probe on catalog load** — after models load successfully, probe every model and write HTTP status into Status.
2. **Manual batch retest** — a **Test all** control re-runs probes for the **current filtered** list (respects search).
3. **Keep per-row Test** — single-model probe stays available.

## Requirements (locked during brainstorming)

| # | Decision | Choice |
|---|---|---|
| Q1 | Status display | HTTP codes (`200`, `401`, …); network failure → localized `Failed`; idle `—`; in-flight `…` |
| Q2 | Structure vs automation | Structure first (done); this spec is automation |
| Q3 | Trigger | **Both** — auto on load **and** Test all / retest |
| Q4 | Batch membership | Auto-load → **all** loaded models; Test all → **filtered** list only |
| Q5 | Concurrency | **Balanced** — **5** in-flight probes at a time |

## Non-goals (YAGNI)

- Persisting Status across reloads (reload re-runs auto probe).
- Per-protocol Status (responses / messages). One chat-completions ping only.
- New server batch / management probe API (client queue only for this round).
- Configurable concurrency UI.
- Cancelling an in-flight batch mid-run (optional later).

## Architecture

### Data (unchanged shape)

```ts
type ModelTestEntry = {
  state: "idle" | "testing" | "ok" | "error";
  httpStatus?: number;
  detail?: string;
};
```

Status cell mapping stays as shipped in the structure-first pass.

### Probe

Reuse the existing GUI `fetch` to `endpoints.chatCompletions` with a minimal ping body (`max_tokens: 1`, non-streaming). Extract a shared `runModelTest(model)` used by:

- per-row **Test**
- auto-load batch
- **Test all** batch

Success → `{ state: "ok", httpStatus: res.status }`.  
HTTP error → `{ state: "error", httpStatus: res.status, detail }`.  
Network failure → `{ state: "error", detail }` (no `httpStatus` → Status shows `Failed`).

### Batch runner

Client-side pool in `ApiKeys.tsx` (or a tiny helper next to api-keys utils):

- `runPool(models, concurrency = 5)` — at most 5 concurrent `runModelTest` calls.
- Auto-start once after a successful `fetchModels` that yields a non-empty list.
- Do not auto-start on load failure or empty catalog.
- **Test all** starts the same pool over `filteredModels`.
- While a batch is active: disable **Test all**; show progress via i18n (`api.testingAll` with `{done}` / `{total}`).
- If a model is already `testing`, skip enqueueing a duplicate for that id.
- Per-row **Test** remains enabled; if that model is already in the active batch, no second request.

No new backend routes.

### UI

In `ApiKeysModelsPanel` header (near title / count):

- **Test all** button when idle.
- Progress label while batching (e.g. Testing 12/86…).
- Status column unchanged.

### i18n

Add keys in all locales (`en`, `de`, `ja`, `ko`, `ru`, `zh`):

- `api.testAll` — button label
- `api.testingAll` — progress (`{done}`, `{total}`)

Reuse existing `api.testFailed` / Status literals.

## Testing

- Layout / source guard: Test all control present; auto-batch wiring referenced from `ApiKeys.tsx`.
- Unit test the pool helper if extracted (ordering, concurrency cap, skip-when-already-testing).
- No e2e live provider calls in CI.

## Out of scope (later)

- Persist last Status to disk / management API.
- Per-protocol matrix.
- Server-side batch probe with shared rate limits.
- Cancel / pause batch.
