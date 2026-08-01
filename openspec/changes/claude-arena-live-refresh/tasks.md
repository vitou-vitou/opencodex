## 1. OpenSpec

- [x] 1.1 proposal / design / spec / tasks (this change)

## 2. Arena rank module

- [x] 2.1 Parse arena text table → `{ rank, score, name }`
- [x] 2.2 Match names to local `provider/model` with confidence threshold
- [x] 2.3 Build family chains (fable/opus/sonnet/haiku, cap 3, dedupe)
- [x] 2.4 Fixture unit tests (no network)

## 3. Snapshot + CLI

- [x] 3.1 Persist `claudeCode.routing.arenaSnapshot` + `arenaMaxAgeHours`
- [x] 3.2 `ocx claude route refresh-arena [--apply] [--replace]`
- [x] 3.3 Wire stale refresh into `ensure-chains` path
- [x] 3.4 Help + status shows snapshot age

## 4. Docs

- [x] 4.1 EN Claude Code failover: live refresh + age gate
- [x] 4.2 Config reference: `arenaSnapshot` / `arenaMaxAgeHours`
- [x] 4.3 Locale pointers non-contradicting

## 5. Verify

- [x] 5.1 typecheck + focused tests
- [x] 5.2 Aikido on first-party edits
