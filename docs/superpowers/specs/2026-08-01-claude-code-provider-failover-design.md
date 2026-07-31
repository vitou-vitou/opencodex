# Claude Code Provider Failover — Design

**Date:** 2026-08-01
**Status:** Approved (brainstorming) — pending spec review, then implementation plan
**Scope:** Claude Code inbound (`/v1/messages`) only. Engine designed to lift to Codex/other inbound later.

## Problem

Switching Claude Code between the many providers that can serve Claude models (anthropic,
kiro, github-copilot, google-antigravity) — plus non-Claude fallbacks (xai) — is manual and
slow today: edit `claudeCode.modelMap` in `config.json`, then **restart** the proxy. When the
active provider hits a quota wall (e.g. the observed Codex 30-day 100% / weekly limits) or needs
reauth, there is no automatic recovery — traffic just fails until the user hand-edits config.

## Goals

1. **Auto-failover (primary)** — when the active provider for a Claude model becomes unavailable,
   route to the next healthy provider automatically. Cross-provider.
2. **Fast manual switch** — one command / in-session picker flips the provider, no restart.

Both requested together; auto-failover is primary, manual override complements it.

## Requirements (locked during brainstorming)

| # | Decision | Choice |
|---|---|---|
| Q1 | Switch model | Fast manual switch (A) **+** auto-failover (B); B primary |
| Q2 | Failover trigger | **C** — proactive quota threshold **and** hard-error backstop |
| Q3 | Fallback target | **A** — same Claude model, hop provider (real-Claude hosts first, grok last-resort) |
| Q4 | Return to primary | **A** — sticky; reclaim primary only when current candidate cools/expires (no flap) |
| Q5 | Scope | **A** — Claude Code only; engine liftable to Codex/others later |
| Q6 | Manual surface | **A + B** — CLI (`ocx claude use`) + native `/model` picker |

## Non-goals (YAGNI)

- Codex / `/v1/responses` failover (scope is A).
- GUI dashboard panel (CLI + management API only for now).
- Round-robin / load-spread across providers.
- Active auto-return poller (reclaim is soft, via cooldown expiry).
- Per-request re-pick (would break stickiness + prompt cache).

## Architecture

### Lookup order (inbound `/v1/messages`)

1. Explicit `provider/model` from the `/model` picker → **bypass chains** (picker wins), one-shot,
   no pin written. Already respected by the router's slash-namespace path (`router.ts:325`).
2. Canonical inbound id (after `[1m]` strip, alias decode, date-suffix strip) has a chain in
   `claudeCode.routing.chains` → **ClaudeRouteSelector**.
3. Else existing `claudeCode.modelMap` → passthrough (unchanged).

**Back-compat:** absence of a `routing` block = today's behavior, bit-for-bit.

### Config schema (`claudeCode.routing`)

```jsonc
"claudeCode": {
  "routing": {
    "threshold": 90,          // proactive skip when candidate quota% >= this
    "maxHops": 3,             // max candidate tries per request
    "chains": {
      "claude-opus-4-8": [    // canonical inbound id (post date-strip)
        { "provider": "anthropic",      "model": "claude-opus-4-8" },
        { "provider": "kiro",           "model": "claude-opus-4.8" },
        { "provider": "github-copilot", "model": "claude-opus-4.8" },
        { "provider": "xai",            "model": "grok-4.5" }        // last-resort
      ],
      "claude-haiku-4-5": [ /* ... */ ]
    }
  }
}
```

`modelMap` remains for dumb static rewrites of ids that have no chain.

### Runtime state (not in config file except pin)

- `pinnedProvider: { provider: string; hard: boolean } | null` — manual override (A).
  Persisted to config runtime so it survives restart. Soft by default (preference, still hops if
  the pinned provider cools); `--hard` locks (fail rather than hop).
- `candidateCooldowns: Map<"provider/model", { until: number; source: CooldownSource }>` —
  reactive cools. Same shape as the Codex cooldown map.

### Route selector (pure)

```
pick(canonicalId, { chains, pinned, cooldowns, health, now }) -> { provider, model, reason }

candidates = chains[canonicalId]
if pinned: move first candidate whose provider == pinned.provider to front
for c in candidates:
    if gate(c) == healthy: return c
if pinned?.hard and no healthy: throw (locked)
return last(candidates) with reason="all_cooled"   // fail toward something + warn
```

`gate(c)` healthy iff ALL:

1. **not cooled** — `cooldowns["provider/model"]` absent or `until <= now`.
2. **quota under threshold** — `quotaPercent(c) < threshold`. Source: same windows
   `quota-recovery.ts` projects (`selectMostRestrictiveQuotaWindow`) via existing `getAccountQuota`
   / provider quota reports. **Unknown quota → treat healthy** (don't block on missing data).
3. **not reauth** — provider's active account not `needsReauth` (existing `isAccountNeedsReauth` /
   oauth health).
4. **provider usable** — not `disabled`, credential present.

Selector is a pure function of `(chains, pinned, cooldowns, healthSnapshot, now)` — unit-testable
without network, exactly like `projectCodexQuotaHealth`. A thin adapter gathers the health snapshot
and injects it.

### Failover triggers

**Proactive (before send):** the gate skips over-threshold / reauth / disabled / cooled candidates.
The normal path — no failure required.

**Reactive (on upstream failure), classified by response:**

| upstream | action | cooldown TTL | source |
|---|---|---|---|
| 429 | cool candidate | `Retry-After` → quota `resetAt` → default 60s | `rate_limit` |
| 401 / auth | mark provider `needsReauth` + cool short | 60s | `reauth` |
| 5xx / network | cool short | 30s | `upstream_error` |
| 2xx | success; clear a stale cool on this candidate if any | — | — |

**In-request hop:** on a reactive failure that cooled the candidate, re-run the selector (now skips
the just-cooled one) and forward to the next candidate. Bounded by `maxHops`. Exhausted → return the
last upstream error to the client.

### Stickiness (Q4=A)

The cooldown IS the stickiness: once the primary is cooled it is skipped until its TTL expires — no
active flapping. The primary is soft-reclaimed when its cooldown lapses and it is again the
first-healthy candidate on the next request. No auto-return poller.

### Streaming boundary

- Hop is only possible **before the first byte** is streamed to the client.
- 429/error arriving pre-stream → hop silently within `maxHops`.
- Failure mid-stream (already a 200 in flight, rare) → cannot rebuild; surface the error and cool
  the candidate for the **next** request.
- Non-streaming requests → hop freely within `maxHops`.

### Concurrency

Cooldown-map writes are idempotent (keep the max/last TTL). No probe-lease needed here (unlike Codex
#433): Claude hosts are not single-account-exhaustion; a cooled candidate is simply skipped and
naturally retried after TTL expiry.

## Manual switch surfaces

**Pin (A):** soft preference by default (still hops if pinned provider cools); `--hard` locks.
Pin does not disable failover.

**`/model` picker (B):** picker sends explicit `provider/model` → bypasses chains (lookup step 1),
one-shot, writes no pin. Gateway discovery already lists these ids. Zero new routing code — just
ensure chains/modelMap never swallow an explicit slash route (already true at `router.ts:325`).

**CLI:**

```bash
ocx claude use <provider>            # soft pin (hot, no restart)
ocx claude use <provider> --hard     # hard lock
ocx claude use auto                  # clear pin -> full auto-failover
ocx claude route status              # chains, pin, live per-candidate health/cooldowns
ocx claude route clear-cooldowns     # explicit manual reset of live cooldowns
```

**Management API (hot-reload; backs CLI + future GUI):**

- `PUT /api/claude/route/pin` `{ provider: string | null, hard?: boolean }`
- `GET /api/claude/route/status` → chains + pin + per-candidate
  `{ healthy, quotaPercent, cooledUntil, needsReauth }`

**Hot-reload:** pin + chain edits mutate in-memory config through the management layer (same path as
existing account switches) → **no proxy restart**. Only raw `config.json` file edits still need a
restart (documented gap; not regressed).

## Modules

| file | purpose | deps |
|---|---|---|
| `src/claude/route-chains.ts` | pure: parse/validate `routing` config, canonical-id lookup | types |
| `src/claude/route-selector.ts` | pure `pick()` + `gate()` | chains + injected health snapshot |
| `src/claude/route-cooldowns.ts` | `(provider/model) -> {until,source}` map; set/clear/expire | none |
| `src/claude/route-health.ts` | adapter: build health snapshot from existing quota/reauth sources | quota-recovery, account state |
| `src/claude/route-pin.ts` | runtime pin state + persist | config mutate |

**Wiring:** `inbound.ts` `resolveInboundModel` — after date-strip, if a chain exists, call the
selector. The reactive hop wraps the Claude forward in the `/v1/messages` handler.

## Testing (bun, table-driven — mirrors `codex-quota-recovery.test.ts`)

- **selector:** pin-to-front (soft + hard), gate skips (cooled / over-threshold / reauth / disabled),
  all-cooled → last + warn, `maxHops` respected, unknown-quota → healthy.
- **cooldowns:** TTL derivation (Retry-After vs resetAt vs default), expiry, idempotent writes.
- **triggers:** 429/401/5xx → correct source + TTL; 2xx clears a stale cool.
- **integration:** `/v1/messages` hops on injected 429 pre-stream; no hop mid-stream; exhausted hops
  → last error surfaced.
- **back-compat:** no `routing` block → identical routing to today.

## Observability

- `ocx claude route status` — chains, pin, live candidate health.
- `ocx observe claude-inbound` — chosen candidate + hop reason per request.
- Log line per hop: `route hop opus: anthropic->kiro (429, cool 42s)`.

## Resolved defaults (approved 2026-08-01)

- **`threshold` = 90**; cooldown TTLs **429 → 60s**, **5xx/network → 30s**, **401/auth → 60s**
  (Retry-After / quota `resetAt` override when present). All tunable via `claudeCode.routing`.
- **`ocx claude use auto` clears the pin only** — live cooldowns reflect real upstream limits;
  wiping them would instantly re-hit the wall. A separate `ocx claude route clear-cooldowns`
  provides an explicit manual reset when needed.
