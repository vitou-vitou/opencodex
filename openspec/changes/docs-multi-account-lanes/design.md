## Context

opencodex Codex Auth already binds existing threads to one account generation and rebalances new sessions by quota / cooldown / failover (`src/codex/routing.ts`). Public discourse (Star Fleet–style) popularizes **parallel** multi-account. File-swap tools (`codex-rotate`) are another quota-pool pattern. Copy must separate these lanes without integrating third-party tools.

## Goals / Non-Goals

**Goals:**
- Docs + GUI + CLI state: one request path, thread affinity, quota/429 switching.
- Explicit “not N parallel Codex sessions” note where Pool mode is explained.

**Non-Goals:**
- New pool strategies (round-robin / fill-first).
- Integrating Star Fleet, codex-rotate, or auth.json daemons.
- Runtime routing algorithm changes.

## Decisions

1. **Callout on How It Works + Compare Proxies** — dual entry (lifecycle + peer positioning).
2. **One new i18n key** `codexAuth.poolNotParallelNote` under Pool banner — avoids burying the distinction.
3. **CLI help only** for product phase — clarity surface; affinity tests already cover behavior.

## Risks / Trade-offs

- **[Risk] Over-naming competitors** → Mitigation: category examples only, JTBD framing.
- **[Risk] Locale drift** → Mitigation: update all GUI locales + docs locales in the same change.

## Open Questions

- None (plan locked 1–3).
