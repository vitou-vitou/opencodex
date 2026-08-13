## 1. Helper + tests

- [x] 1.1 Add `gui/src/log-status-filter.ts` with `LogStatusFilter` + `matchesLogStatusFilter`
- [x] 1.2 Add unit tests for all / 2xx / 4xx / 5xx edge boundaries

## 2. Logs UI

- [x] 2.1 Wire Status segmented control beside Surface in `Logs.tsx`
- [x] 2.2 AND into `filteredLogs`; improve empty copy when filters active
- [x] 2.3 Add i18n keys to en/de/ko/zh/ru/ja

## 3. Verify

- [x] 3.1 GUI test: selecting 4xx hides 200, keeps 429
- [x] 3.2 `bun run lint:i18n` + focused gui/unit tests
