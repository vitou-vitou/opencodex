## Why

The Logs list (`#logs`) already filters by Surface and Conversation, but operators hunting failures must scan the Status column by eye. The management API already accepts `?status=5xx|429`; the dashboard list does not expose that affordance.

## What Changes

- Add a **Status** segmented filter on the Logs list: All · 2xx · 4xx · 5xx.
- Match **parent** `LogEntry.status` only (same rule as `filterRequestLogs` status filtering).
- Combine with existing Surface + Conversation filters (AND).
- Keep fetch on `GET /api/logs` unfiltered; filter client-side like Surface (auto-refresh stays simple).
- i18n keys in all GUI locales; focused GUI regression test.

## Capabilities

### New Capabilities

- `gui-logs-status-filter`: Logs list status class filter (All / 2xx / 4xx / 5xx).

### Modified Capabilities

- (none)

## Impact

- `gui/src/pages/Logs.tsx` — filter bar + `filteredLogs`
- `gui/src/log-status-filter.ts` — pure match helper (portal)
- `gui/src/i18n/{en,de,ko,zh,ru,ja}.ts`
- `gui/tests/` — status filter regression

## Non-Goals

- Exact status code input (e.g. only `429`) in v1
- Server-side `?status=` from the GUI fetch path
- Filtering by attempt-level status inside combos
- Debug tab changes
