## Why

Recommended Desktop failover chains are a **static** arena.ai snapshot. Rankings drift weekly; operators must hand-edit or wait for a code release. After asking “is it auto?”, the gap is clear: hops are automatic, ranking refresh is not.

## What Changes

- Fetch + parse the arena.ai **text** leaderboard.
- Match rows to the operator’s **configured, visible** catalog (`provider/model`).
- Build per-family chains (opus / sonnet / haiku / fable) from that ranked match list.
- Persist a local **arena snapshot** (cache) used by `ensure-chains`.
- CLI: `ocx claude route refresh-arena [--apply] [--replace]`.
- Optional: if snapshot older than `arenaMaxAgeHours` (default **168**), `ensure-chains` refreshes once before merge (network best-effort; fall back to cache/static).
- Keep today’s static `RECOMMENDED_FAMILY_CHAINS` as **offline fallback**.

## Capabilities

### New Capabilities

- `claude-arena-live-refresh`: Live (on-demand / stale) arena text ranking → Desktop family chain recommendations.

### Modified Capabilities

- `claude-reactive-chains-desktop`: `ensure-chains` may consume a live snapshot when present/fresh.

## Impact

- New: `src/claude/arena-rank.ts` (fetch/parse/match/build)
- `src/claude/route-chains.ts`, `src/cli/claude-route.ts`, `src/cli/help.ts`
- Optional config fields under `claudeCode.routing`
- Tests with fixture HTML/table (no live network in CI)
- Docs: Claude Code failover section

## Non-Goals

- Background daemon / always-on poller
- GUI Providers page sort
- Proactive quota threshold wiring
- Scraping non-text arena boards (vision/coding-only) in v1
