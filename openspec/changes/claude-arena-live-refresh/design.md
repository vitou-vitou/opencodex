## Context

`RECOMMENDED_FAMILY_CHAINS` is hand-ranked from arena.ai (2026-08-01). Failover already hops on errors. Operators want rankings to stay current without a code bump.

## Goals / Non-Goals

**Goals:** On-demand refresh; stale auto-refresh on ensure-chains; match only local visible models; offline fallback; CI without live arena.

**Non-Goals:** Daemon; GUI sort; multi-board scrape; auto-overwrite user custom chains without `--replace` / `--apply`.

## Decisions

1. **Source:** `GET https://arena.ai/leaderboard/text` (HTML table). Parse rank + model name + Elo. No API key. Timeout ~15s.
2. **Trigger (locked):**
   - Explicit: `ocx claude route refresh-arena`
   - Stale: `ensure-chains` calls refresh if snapshot missing/older than `claudeCode.routing.arenaMaxAgeHours` (default **168**). Fail soft → use cache → static template.
   - No interval timer in the proxy process.
3. **Catalog scope:** Models from configured providers after the same visibility filter as Desktop/catalog (not a hard-coded kiro+xai-only list).
4. **Family builders (v1):**
   - `fable`: models matching `/fable/i`, else top Elo overall (cap 3).
   - `opus`: models matching `/opus/i`, else top Elo excluding haiku/flash/mini/m2 patterns (cap 3).
   - `sonnet`: models matching `/sonnet/i`, else mid-band Elo (cap 3).
   - `haiku`: models matching `/haiku|flash|mini|deepseek|minimax|m2\./i`, ranked by Elo (cap 3). Prefer same provider diversity when Elo ties (stable sort by `provider/model`).
5. **Dedup:** Same logical model on multiple providers → keep best Elo; if Elo tie, prefer `anthropic` then `github-copilot` then others (stable order).
6. **Persistence:** Snapshot under `claudeCode.routing.arenaSnapshot`: `{ fetchedAt, source, chains, rows? }` (rows optional/truncated for privacy size). `saveConfigPreservingClaudeCode`.
7. **Apply:**
   - `refresh-arena` alone → update snapshot only.
   - `refresh-arena --apply` → snapshot + merge missing family keys.
   - `refresh-arena --apply --replace` → snapshot + overwrite family keys.
8. **Privacy:** Do not log HTML body or model prompt content. Log only fetch status + matched count.
9. **Tests:** Fixture table → deterministic chains; stale/fresh age gate; network failure → static fallback.

## Risks

- Arena HTML markup changes → parse break → fallback static (warn once).
- Ambiguous name match → wrong route; mitigate with normalize + score threshold; skip low-confidence matches.
- Stale refresh on ensure-chains adds latency; gate by age + short timeout.
