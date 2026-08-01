# Claude Code Provider Failover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-failover across providers for Claude Code `/v1/messages`, with fast manual override, so a Claude model keeps working when its primary provider hits a quota/auth wall.

**Architecture:** A pure route **selector** picks the first healthy candidate from an ordered per-model provider chain (real-Claude hosts first, grok last-resort). A **health gate** skips candidates that are cooled, over quota threshold, need reauth, or are disabled. Reactive failures (429/401/5xx) **cool** a candidate and the request **hops** to the next candidate before the first streamed byte. A manual **pin** moves a provider to the front. Everything is hot (no restart): pin + cooldowns live in memory; pin persists via the existing config-preserving save path.

**Tech Stack:** TypeScript, Bun (runtime + test runner), existing opencodex server (`src/server`), Anthropic→Responses translate-and-replay path (`src/claude`, `src/server/claude-messages.ts`).

## Global Constraints

- **Scope:** Claude Code inbound (`/v1/messages`) ONLY. Do not touch `/v1/responses` (Codex) routing. (Spec Q5=A.)
- **Back-compat:** absence of `claudeCode.routing` MUST leave routing bit-for-bit identical to today. Every new branch is gated on a chain existing for the canonical id.
- **Defaults (locked):** `threshold = 90`; cooldown TTL `429 → 60000ms`, `401 → 60000ms`, `5xx/network → 30000ms`; `Retry-After` header or quota `resetAt` override the 429 TTL when present. `maxHops = 3`.
- **Pin semantics:** soft by default (preference — still hops if pinned provider cools); `--hard` locks (throw rather than hop). `ocx claude use auto` clears the pin only, NOT cooldowns.
- **Purity:** selector, cooldown TTL math, and chain lookup MUST be pure functions unit-tested without network — mirror `src/codex/quota-recovery.ts` + `tests/codex-quota-recovery.test.ts`.
- **Module budget:** keep each new file focused/small (repo convention ~400 lines/module).
- **Test runner:** `bun test <path>`; table-driven where the codex tests are.
- **Commits:** conventional-commit style, one per task (test+impl together).

---

## File structure

| file | responsibility |
|---|---|
| `src/types.ts` (modify) | add `OcxClaudeRouteCandidate`, `OcxClaudeCodeRouting`; add `routing?` to `OcxClaudeCodeConfig` |
| `src/claude/route-chains.ts` (create) | pure: normalize/validate `routing`, canonical-id → chain lookup, `candidateKey` |
| `src/claude/route-cooldowns.ts` (create) | in-memory `(provider/model) → {until,source}` map; set/get/clear/expire; TTL-from-status math |
| `src/claude/route-selector.ts` (create) | pure `pickRoute()` + `gate()` over a `RouteSnapshot` |
| `src/claude/route-health.ts` (create) | adapter: build `RouteSnapshot.health` from existing quota/reauth/provider state |
| `src/claude/route-pin.ts` (create) | runtime pin get/set + persist via `saveConfigPreservingClaudeCode` |
| `src/claude/inbound.ts` (modify) | `resolveInboundModel`: when a chain exists, delegate to the selector |
| `src/server/claude-messages.ts` (modify) | reactive hop: on 429/401/5xx pre-stream, cool + re-pick + replay, bounded by `maxHops` |
| `src/cli/claude-route.ts` (create) | `ocx claude route use|auto|status|clear-cooldowns` handlers |
| `src/cli/index.ts` (modify) | dispatch `args[1] === "route"` to `handleClaudeRouteCommand` |
| `src/server/management/agent-settings-routes.ts` (modify) | `PUT /api/claude/route/pin`, `GET /api/claude/route/status` |
| `tests/claude-route-chains.test.ts` … (create) | one test file per pure module + integration test |

---

## Task 1: Config types + chain lookup (`route-chains.ts`)

**Files:**
- Modify: `src/types.ts` (after `OcxClaudeDesktopProfile`, before `OcxCustomModel`)
- Create: `src/claude/route-chains.ts`
- Test: `tests/claude-route-chains.test.ts`

**Interfaces:**
- Produces:
  - `OcxClaudeRouteCandidate = { provider: string; model: string }`
  - `OcxClaudeCodeRouting = { threshold?: number; maxHops?: number; chains?: Record<string, OcxClaudeRouteCandidate[]>; pin?: { provider: string; hard: boolean } | null }`
  - `OcxClaudeCodeConfig.routing?: OcxClaudeCodeRouting`
  - `DEFAULT_ROUTE_THRESHOLD = 90`, `DEFAULT_ROUTE_MAX_HOPS = 3`
  - `candidateKey(c: OcxClaudeRouteCandidate): string` → `` `${provider}/${model}` ``
  - `normalizeRouting(r: OcxClaudeCodeRouting | undefined): { threshold: number; maxHops: number }`
  - `chainForModel(r: OcxClaudeCodeRouting | undefined, canonicalId: string): OcxClaudeRouteCandidate[] | null` (null when no `routing`, no `chains`, or the id maps to an empty/invalid list)

- [ ] **Step 1: Add types to `src/types.ts`**

```typescript
export interface OcxClaudeRouteCandidate {
  provider: string;
  model: string;
}

/** Per-model provider failover for Claude Code inbound (/v1/messages). */
export interface OcxClaudeCodeRouting {
  /** Proactive skip when a candidate's quota% >= this. Default 90. */
  threshold?: number;
  /** Max candidate tries within one request. Default 3. */
  maxHops?: number;
  /** canonical inbound id (post date-strip) -> ordered candidates, first = primary. */
  chains?: Record<string, OcxClaudeRouteCandidate[]>;
  /** Manual override; soft = preference (still hops), hard = lock. null/absent = auto. */
  pin?: { provider: string; hard: boolean } | null;
}
```

Then add to `OcxClaudeCodeConfig` (near `modelMap`):

```typescript
  /** Per-model provider failover chains + manual pin (Claude Code inbound only). */
  routing?: OcxClaudeCodeRouting;
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/claude-route-chains.test.ts
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ROUTE_THRESHOLD,
  DEFAULT_ROUTE_MAX_HOPS,
  candidateKey,
  normalizeRouting,
  chainForModel,
} from "../src/claude/route-chains";

describe("candidateKey", () => {
  test("joins provider and model with a slash", () => {
    expect(candidateKey({ provider: "anthropic", model: "claude-opus-4-8" }))
      .toBe("anthropic/claude-opus-4-8");
  });
});

describe("normalizeRouting", () => {
  test("applies defaults when unset", () => {
    expect(normalizeRouting(undefined)).toEqual({ threshold: 90, maxHops: 3 });
  });
  test("clamps threshold to 0..100 and maxHops to >=1", () => {
    expect(normalizeRouting({ threshold: 250, maxHops: 0 })).toEqual({ threshold: 100, maxHops: 1 });
    expect(normalizeRouting({ threshold: -5, maxHops: 9 })).toEqual({ threshold: 0, maxHops: 9 });
  });
  test("falls back to defaults on non-finite", () => {
    expect(normalizeRouting({ threshold: NaN, maxHops: Infinity }))
      .toEqual({ threshold: DEFAULT_ROUTE_THRESHOLD, maxHops: DEFAULT_ROUTE_MAX_HOPS });
  });
});

describe("chainForModel", () => {
  const routing = {
    chains: {
      "claude-opus-4-8": [
        { provider: "anthropic", model: "claude-opus-4-8" },
        { provider: "xai", model: "grok-4.5" },
      ],
      "empty": [],
    },
  };
  test("returns the ordered chain for a known id", () => {
    expect(chainForModel(routing, "claude-opus-4-8")).toEqual([
      { provider: "anthropic", model: "claude-opus-4-8" },
      { provider: "xai", model: "grok-4.5" },
    ]);
  });
  test("returns null when routing is absent", () => {
    expect(chainForModel(undefined, "claude-opus-4-8")).toBeNull();
  });
  test("returns null for an unknown id", () => {
    expect(chainForModel(routing, "claude-haiku-4-5")).toBeNull();
  });
  test("returns null for an empty or invalid chain", () => {
    expect(chainForModel(routing, "empty")).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/claude-route-chains.test.ts`
Expected: FAIL — `Cannot find module '../src/claude/route-chains'`.

- [ ] **Step 4: Write minimal implementation**

```typescript
// src/claude/route-chains.ts
import type { OcxClaudeCodeRouting, OcxClaudeRouteCandidate } from "../types";

export const DEFAULT_ROUTE_THRESHOLD = 90;
export const DEFAULT_ROUTE_MAX_HOPS = 3;

export function candidateKey(c: OcxClaudeRouteCandidate): string {
  return `${c.provider}/${c.model}`;
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function normalizeRouting(
  routing: OcxClaudeCodeRouting | undefined,
): { threshold: number; maxHops: number } {
  return {
    threshold: clampInt(routing?.threshold, 0, 100, DEFAULT_ROUTE_THRESHOLD),
    maxHops: clampInt(routing?.maxHops, 1, 64, DEFAULT_ROUTE_MAX_HOPS),
  };
}

function isValidCandidate(c: unknown): c is OcxClaudeRouteCandidate {
  return !!c && typeof c === "object"
    && typeof (c as OcxClaudeRouteCandidate).provider === "string"
    && (c as OcxClaudeRouteCandidate).provider.length > 0
    && typeof (c as OcxClaudeRouteCandidate).model === "string"
    && (c as OcxClaudeRouteCandidate).model.length > 0;
}

export function chainForModel(
  routing: OcxClaudeCodeRouting | undefined,
  canonicalId: string,
): OcxClaudeRouteCandidate[] | null {
  const raw = routing?.chains?.[canonicalId];
  if (!Array.isArray(raw)) return null;
  const chain = raw.filter(isValidCandidate);
  return chain.length > 0 ? chain : null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/claude-route-chains.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/claude/route-chains.ts tests/claude-route-chains.test.ts
git commit -m "feat(claude): add route chain config types and lookup"
```

---

## Task 2: Cooldown map + TTL math (`route-cooldowns.ts`)

**Files:**
- Create: `src/claude/route-cooldowns.ts`
- Test: `tests/claude-route-cooldowns.test.ts`

**Interfaces:**
- Consumes: `candidateKey` (Task 1) at call sites (not internally).
- Produces:
  - `type RouteCooldownSource = "rate_limit" | "reauth" | "upstream_error"`
  - `interface RouteCooldown { until: number; source: RouteCooldownSource }`
  - `ttlForStatus(status: number, opts?: { retryAfterMs?: number; resetAt?: number; now?: number }): { ttlMs: number; source: RouteCooldownSource }`
  - `coolCandidate(key: string, source: RouteCooldownSource, ttlMs: number, now?: number): void` (keeps the later `until` on repeat)
  - `candidateCooldown(key: string, now?: number): RouteCooldown | null` (null when absent or expired)
  - `clearCandidateCooldown(key: string): void`
  - `clearAllCooldowns(): void`
  - `activeCooldowns(now?: number): Record<string, RouteCooldown>` (for status output)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/claude-route-cooldowns.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import {
  ttlForStatus,
  coolCandidate,
  candidateCooldown,
  clearCandidateCooldown,
  clearAllCooldowns,
  activeCooldowns,
} from "../src/claude/route-cooldowns";

const NOW = 1_800_000_000_000;
afterEach(() => clearAllCooldowns());

describe("ttlForStatus", () => {
  test("429 defaults to 60s, source rate_limit", () => {
    expect(ttlForStatus(429, { now: NOW })).toEqual({ ttlMs: 60_000, source: "rate_limit" });
  });
  test("429 prefers Retry-After when present", () => {
    expect(ttlForStatus(429, { retryAfterMs: 5_000, now: NOW }))
      .toEqual({ ttlMs: 5_000, source: "rate_limit" });
  });
  test("429 falls to resetAt-derived when no Retry-After", () => {
    expect(ttlForStatus(429, { resetAt: NOW + 42_000, now: NOW }))
      .toEqual({ ttlMs: 42_000, source: "rate_limit" });
  });
  test("401 is 60s reauth", () => {
    expect(ttlForStatus(401, { now: NOW })).toEqual({ ttlMs: 60_000, source: "reauth" });
  });
  test("5xx and network(0) are 30s upstream_error", () => {
    expect(ttlForStatus(503, { now: NOW })).toEqual({ ttlMs: 30_000, source: "upstream_error" });
    expect(ttlForStatus(0, { now: NOW })).toEqual({ ttlMs: 30_000, source: "upstream_error" });
  });
});

describe("cooldown map", () => {
  test("set then read within TTL returns the cooldown", () => {
    coolCandidate("anthropic/claude-opus-4-8", "rate_limit", 60_000, NOW);
    expect(candidateCooldown("anthropic/claude-opus-4-8", NOW + 1))
      .toEqual({ until: NOW + 60_000, source: "rate_limit" });
  });
  test("expired cooldown reads as null", () => {
    coolCandidate("k", "rate_limit", 1_000, NOW);
    expect(candidateCooldown("k", NOW + 1_001)).toBeNull();
  });
  test("repeat write keeps the later until", () => {
    coolCandidate("k", "rate_limit", 10_000, NOW);
    coolCandidate("k", "upstream_error", 5_000, NOW);
    expect(candidateCooldown("k", NOW + 1)?.until).toBe(NOW + 10_000);
  });
  test("clear removes a single key; clearAll empties", () => {
    coolCandidate("a", "rate_limit", 10_000, NOW);
    coolCandidate("b", "rate_limit", 10_000, NOW);
    clearCandidateCooldown("a");
    expect(candidateCooldown("a", NOW + 1)).toBeNull();
    expect(candidateCooldown("b", NOW + 1)).not.toBeNull();
    clearAllCooldowns();
    expect(activeCooldowns(NOW + 1)).toEqual({});
  });
  test("activeCooldowns omits expired entries", () => {
    coolCandidate("live", "rate_limit", 10_000, NOW);
    coolCandidate("dead", "rate_limit", 1_000, NOW);
    expect(activeCooldowns(NOW + 2_000)).toEqual({ live: { until: NOW + 10_000, source: "rate_limit" } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/claude-route-cooldowns.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/claude/route-cooldowns.ts
export type RouteCooldownSource = "rate_limit" | "reauth" | "upstream_error";

export interface RouteCooldown {
  until: number;
  source: RouteCooldownSource;
}

const DEFAULT_RATE_LIMIT_MS = 60_000;
const DEFAULT_REAUTH_MS = 60_000;
const DEFAULT_UPSTREAM_MS = 30_000;

const cooldowns = new Map<string, RouteCooldown>();

export function ttlForStatus(
  status: number,
  opts: { retryAfterMs?: number; resetAt?: number; now?: number } = {},
): { ttlMs: number; source: RouteCooldownSource } {
  const now = opts.now ?? Date.now();
  if (status === 401 || status === 403) return { ttlMs: DEFAULT_REAUTH_MS, source: "reauth" };
  if (status === 429) {
    if (typeof opts.retryAfterMs === "number" && Number.isFinite(opts.retryAfterMs) && opts.retryAfterMs > 0) {
      return { ttlMs: opts.retryAfterMs, source: "rate_limit" };
    }
    if (typeof opts.resetAt === "number" && Number.isFinite(opts.resetAt) && opts.resetAt > now) {
      return { ttlMs: opts.resetAt - now, source: "rate_limit" };
    }
    return { ttlMs: DEFAULT_RATE_LIMIT_MS, source: "rate_limit" };
  }
  return { ttlMs: DEFAULT_UPSTREAM_MS, source: "upstream_error" };
}

export function coolCandidate(
  key: string,
  source: RouteCooldownSource,
  ttlMs: number,
  now = Date.now(),
): void {
  const until = now + Math.max(0, ttlMs);
  const existing = cooldowns.get(key);
  if (existing && existing.until >= until) return; // keep the later expiry
  cooldowns.set(key, { until, source });
}

export function candidateCooldown(key: string, now = Date.now()): RouteCooldown | null {
  const cd = cooldowns.get(key);
  if (!cd) return null;
  if (cd.until <= now) { cooldowns.delete(key); return null; }
  return cd;
}

export function clearCandidateCooldown(key: string): void {
  cooldowns.delete(key);
}

export function clearAllCooldowns(): void {
  cooldowns.clear();
}

export function activeCooldowns(now = Date.now()): Record<string, RouteCooldown> {
  const out: Record<string, RouteCooldown> = {};
  for (const [key, cd] of cooldowns) {
    if (cd.until > now) out[key] = cd;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/claude-route-cooldowns.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/claude/route-cooldowns.ts tests/claude-route-cooldowns.test.ts
git commit -m "feat(claude): add route cooldown map and TTL derivation"
```

---

## Task 3: Route selector + gate (`route-selector.ts`)

**Files:**
- Create: `src/claude/route-selector.ts`
- Test: `tests/claude-route-selector.test.ts`

**Interfaces:**
- Consumes: `OcxClaudeRouteCandidate` (Task 1), `candidateKey` (Task 1), `RouteCooldown` (Task 2).
- Produces:
  - `interface CandidateHealth { quotaPercent?: number; needsReauth: boolean; usable: boolean }`
  - `interface RouteSnapshot { health(c: OcxClaudeRouteCandidate): CandidateHealth; cooldown(key: string): RouteCooldown | null; now: number }`
  - `interface RoutePin { provider: string; hard: boolean }`
  - `type RouteReason = "primary" | "failover" | "pinned" | "all_cooled"`
  - `interface RoutePick { provider: string; model: string; reason: RouteReason }`
  - `class NoHealthyRouteError extends Error` (thrown only for a hard pin with no healthy candidate)
  - `pickRoute(candidates: OcxClaudeRouteCandidate[], pin: RoutePin | null, snapshot: RouteSnapshot, threshold: number): RoutePick`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/claude-route-selector.test.ts
import { describe, expect, test } from "bun:test";
import { pickRoute, NoHealthyRouteError, type RouteSnapshot, type CandidateHealth } from "../src/claude/route-selector";
import { candidateKey } from "../src/claude/route-chains";
import type { OcxClaudeRouteCandidate } from "../src/types";

const NOW = 1_800_000_000_000;
const CHAIN: OcxClaudeRouteCandidate[] = [
  { provider: "anthropic", model: "claude-opus-4-8" },
  { provider: "kiro", model: "claude-opus-4.8" },
  { provider: "xai", model: "grok-4.5" },
];

function snap(
  health: Record<string, Partial<CandidateHealth>>,
  cooled: Record<string, true> = {},
): RouteSnapshot {
  return {
    now: NOW,
    cooldown: key => cooled[key] ? { until: NOW + 10_000, source: "rate_limit" } : null,
    health: c => ({
      usable: true,
      needsReauth: false,
      ...health[candidateKey(c)],
    }),
  };
}

describe("pickRoute", () => {
  test("returns the primary when healthy", () => {
    expect(pickRoute(CHAIN, null, snap({}), 90))
      .toEqual({ provider: "anthropic", model: "claude-opus-4-8", reason: "primary" });
  });
  test("skips a cooled primary -> failover to next", () => {
    const s = snap({}, { "anthropic/claude-opus-4-8": true });
    expect(pickRoute(CHAIN, null, s, 90))
      .toEqual({ provider: "kiro", model: "claude-opus-4.8", reason: "failover" });
  });
  test("skips over-threshold quota", () => {
    const s = snap({ "anthropic/claude-opus-4-8": { quotaPercent: 95 } });
    expect(pickRoute(CHAIN, null, s, 90).provider).toBe("kiro");
  });
  test("threshold is inclusive (>=)", () => {
    const s = snap({ "anthropic/claude-opus-4-8": { quotaPercent: 90 } });
    expect(pickRoute(CHAIN, null, s, 90).provider).toBe("kiro");
  });
  test("unknown quota is treated as healthy", () => {
    const s = snap({ "anthropic/claude-opus-4-8": { quotaPercent: undefined } });
    expect(pickRoute(CHAIN, null, s, 90).provider).toBe("anthropic");
  });
  test("skips needsReauth and not-usable", () => {
    const s = snap({
      "anthropic/claude-opus-4-8": { needsReauth: true },
      "kiro/claude-opus-4.8": { usable: false },
    });
    expect(pickRoute(CHAIN, null, s, 90).provider).toBe("xai");
  });
  test("soft pin moves matching provider to front", () => {
    expect(pickRoute(CHAIN, { provider: "kiro", hard: false }, snap({}), 90))
      .toEqual({ provider: "kiro", model: "claude-opus-4.8", reason: "pinned" });
  });
  test("soft pin still hops when the pinned provider is cooled", () => {
    const s = snap({}, { "kiro/claude-opus-4.8": true });
    const pick = pickRoute(CHAIN, { provider: "kiro", hard: false }, s, 90);
    expect(pick.provider).toBe("anthropic");
    expect(pick.reason).toBe("failover");
  });
  test("all cooled -> last candidate with reason all_cooled", () => {
    const s = snap({}, {
      "anthropic/claude-opus-4-8": true,
      "kiro/claude-opus-4.8": true,
      "xai/grok-4.5": true,
    });
    expect(pickRoute(CHAIN, null, s, 90))
      .toEqual({ provider: "xai", model: "grok-4.5", reason: "all_cooled" });
  });
  test("hard pin with no healthy candidate throws", () => {
    const s = snap({}, {
      "anthropic/claude-opus-4-8": true,
      "kiro/claude-opus-4.8": true,
      "xai/grok-4.5": true,
    });
    expect(() => pickRoute(CHAIN, { provider: "kiro", hard: true }, s, 90))
      .toThrow(NoHealthyRouteError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/claude-route-selector.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/claude/route-selector.ts
import type { OcxClaudeRouteCandidate } from "../types";
import { candidateKey } from "./route-chains";
import type { RouteCooldown } from "./route-cooldowns";

export interface CandidateHealth {
  /** Most-restrictive quota window percent, or undefined when unknown (treated healthy). */
  quotaPercent?: number;
  needsReauth: boolean;
  usable: boolean;
}

export interface RouteSnapshot {
  health(c: OcxClaudeRouteCandidate): CandidateHealth;
  cooldown(key: string): RouteCooldown | null;
  now: number;
}

export interface RoutePin {
  provider: string;
  hard: boolean;
}

export type RouteReason = "primary" | "failover" | "pinned" | "all_cooled";

export interface RoutePick {
  provider: string;
  model: string;
  reason: RouteReason;
}

export class NoHealthyRouteError extends Error {
  constructor(public readonly provider: string) {
    super(`No healthy candidate for hard-pinned provider: ${provider}`);
    this.name = "NoHealthyRouteError";
  }
}

/** Pin moves the FIRST matching-provider candidate to the front; order otherwise preserved. */
function orderForPin(
  candidates: OcxClaudeRouteCandidate[],
  pin: RoutePin | null,
): OcxClaudeRouteCandidate[] {
  if (!pin) return candidates;
  const idx = candidates.findIndex(c => c.provider === pin.provider);
  if (idx <= 0) return candidates;
  const copy = [...candidates];
  const [pinned] = copy.splice(idx, 1);
  copy.unshift(pinned!);
  return copy;
}

function isHealthy(
  c: OcxClaudeRouteCandidate,
  snapshot: RouteSnapshot,
  threshold: number,
): boolean {
  if (snapshot.cooldown(candidateKey(c))) return false;
  const h = snapshot.health(c);
  if (!h.usable) return false;
  if (h.needsReauth) return false;
  if (typeof h.quotaPercent === "number" && Number.isFinite(h.quotaPercent) && h.quotaPercent >= threshold) {
    return false;
  }
  return true;
}

export function pickRoute(
  candidates: OcxClaudeRouteCandidate[],
  pin: RoutePin | null,
  snapshot: RouteSnapshot,
  threshold: number,
): RoutePick {
  const ordered = orderForPin(candidates, pin);
  for (let i = 0; i < ordered.length; i++) {
    const c = ordered[i]!;
    if (isHealthy(c, snapshot, threshold)) {
      const reason: RouteReason = pin && c.provider === pin.provider && i === 0 ? "pinned"
        : i === 0 ? "primary"
        : "failover";
      return { provider: c.provider, model: c.model, reason };
    }
  }
  if (pin?.hard) throw new NoHealthyRouteError(pin.provider);
  const last = ordered[ordered.length - 1]!;
  return { provider: last.provider, model: last.model, reason: "all_cooled" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/claude-route-selector.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/claude/route-selector.ts tests/claude-route-selector.test.ts
git commit -m "feat(claude): add pure route selector with health gate"
```

---

## Task 4: Health snapshot adapter (`route-health.ts`)

Builds a `RouteSnapshot` from live proxy state. Quota data is only available for some providers; per the spec, **unknown quota → healthy**. First implementation wires the signals that already exist: provider `disabled`/credential presence (usable), OAuth/account reauth state (needsReauth), and quota where a report exists.

**Files:**
- Create: `src/claude/route-health.ts`
- Test: `tests/claude-route-health.test.ts`

**Interfaces:**
- Consumes: `OcxConfig`, `OcxClaudeRouteCandidate` (types); `RouteSnapshot`, `CandidateHealth` (Task 3); `candidateCooldown` (Task 2).
- Produces:
  - `interface RouteHealthSources { quotaPercent(c: OcxClaudeRouteCandidate): number | undefined; needsReauth(c: OcxClaudeRouteCandidate): boolean; usable(c: OcxClaudeRouteCandidate): boolean }`
  - `providerUsable(config: OcxConfig, provider: string): boolean` (pure over config)
  - `buildRouteSnapshot(config: OcxConfig, sources: RouteHealthSources, now?: number): RouteSnapshot` (pure: composes injected sources + the cooldown map)

Keeping the live signal gathering behind the injected `RouteHealthSources` keeps `buildRouteSnapshot` pure and unit-testable; the server passes a real `sources` implementation built from `getAccountQuota` / `isAccountNeedsReauth` / provider quota reports.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/claude-route-health.test.ts
import { describe, expect, test } from "bun:test";
import { providerUsable, buildRouteSnapshot, type RouteHealthSources } from "../src/claude/route-health";
import type { OcxConfig, OcxClaudeRouteCandidate } from "../src/types";

const NOW = 1_800_000_000_000;

function cfg(providers: Record<string, unknown>): OcxConfig {
  return { port: 10100, defaultProvider: "openai", providers } as unknown as OcxConfig;
}

describe("providerUsable", () => {
  test("false for missing provider", () => {
    expect(providerUsable(cfg({}), "kiro")).toBe(false);
  });
  test("false for a disabled provider", () => {
    expect(providerUsable(cfg({ kiro: { disabled: true } }), "kiro")).toBe(false);
  });
  test("true for a present, enabled provider", () => {
    expect(providerUsable(cfg({ kiro: {} }), "kiro")).toBe(true);
  });
});

describe("buildRouteSnapshot", () => {
  const c: OcxClaudeRouteCandidate = { provider: "anthropic", model: "claude-opus-4-8" };
  const sources: RouteHealthSources = {
    quotaPercent: () => 42,
    needsReauth: () => false,
    usable: () => true,
  };
  test("composes injected sources into CandidateHealth", () => {
    const snap = buildRouteSnapshot(cfg({ anthropic: {} }), sources, NOW);
    expect(snap.now).toBe(NOW);
    expect(snap.health(c)).toEqual({ quotaPercent: 42, needsReauth: false, usable: true });
  });
  test("cooldown delegates to the shared cooldown map (absent -> null)", () => {
    const snap = buildRouteSnapshot(cfg({ anthropic: {} }), sources, NOW);
    expect(snap.cooldown("anthropic/claude-opus-4-8")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/claude-route-health.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/claude/route-health.ts
import type { OcxConfig, OcxClaudeRouteCandidate } from "../types";
import { candidateCooldown } from "./route-cooldowns";
import type { RouteSnapshot } from "./route-selector";

export interface RouteHealthSources {
  quotaPercent(c: OcxClaudeRouteCandidate): number | undefined;
  needsReauth(c: OcxClaudeRouteCandidate): boolean;
  usable(c: OcxClaudeRouteCandidate): boolean;
}

/** Pure over config: a provider is usable when present and not explicitly disabled. */
export function providerUsable(config: OcxConfig, provider: string): boolean {
  const prov = config.providers?.[provider];
  if (!prov) return false;
  return (prov as { disabled?: boolean }).disabled !== true;
}

export function buildRouteSnapshot(
  config: OcxConfig,
  sources: RouteHealthSources,
  now = Date.now(),
): RouteSnapshot {
  return {
    now,
    cooldown: key => candidateCooldown(key, now),
    health: c => ({
      usable: sources.usable(c) && providerUsable(config, c.provider),
      needsReauth: sources.needsReauth(c),
      quotaPercent: sources.quotaPercent(c),
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/claude-route-health.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the live sources factory (no new test — thin glue over verified APIs)**

Append to `src/claude/route-health.ts`. `getAccountQuota` lives in `src/codex/quota.ts` (verified import used by `src/codex/routing.ts:7`); `isAccountNeedsReauth` in `src/codex/account-runtime-state.ts` (verified import at `src/codex/routing.ts:6`). Quota is only meaningful for the OpenAI/Codex provider today; other providers return `undefined` (→ healthy) until their quota is wired.

```typescript
import { getAccountQuota } from "../codex/quota";
import { isAccountNeedsReauth } from "../codex/account-runtime-state";

/** Live sources for the running proxy. Extend quotaPercent per provider as quota data lands. */
export function liveRouteHealthSources(config: OcxConfig): RouteHealthSources {
  return {
    usable: c => providerUsable(config, c.provider),
    // Cross-provider reauth signal is per-account; only the codex/openai family exposes it today.
    needsReauth: c => c.provider === "openai" && isAccountNeedsReauth(c.model),
    quotaPercent: c => {
      if (c.provider !== "openai") return undefined; // unknown -> healthy (spec)
      const q = getAccountQuota(c.model);
      const pct = q?.weeklyPercent ?? q?.monthlyPercent;
      return typeof pct === "number" && Number.isFinite(pct) ? pct : undefined;
    },
  };
}
```

> Implementer note: confirm the `getAccountQuota` return shape in `src/codex/quota.ts` and adjust the field names (`weeklyPercent`/`monthlyPercent`) if they differ. If the API keys quota by account id rather than model, thread the active account id here. This factory is intentionally the single seam where provider-specific quota lookups grow; the pure `buildRouteSnapshot` and selector never change.

- [ ] **Step 6: Run the module test again (factory is additive)**

Run: `bun test tests/claude-route-health.test.ts`
Expected: PASS (unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/claude/route-health.ts tests/claude-route-health.test.ts
git commit -m "feat(claude): add route health snapshot adapter"
```

---

## Task 5: Pin state + persistence (`route-pin.ts`)

**Files:**
- Create: `src/claude/route-pin.ts`
- Test: `tests/claude-route-pin.test.ts`

**Interfaces:**
- Consumes: `OcxConfig`, `OcxClaudeCodeRouting` (types); `saveConfigPreservingClaudeCode` (`src/config.ts:995`, verified).
- Produces:
  - `getRoutePin(config: OcxConfig): { provider: string; hard: boolean } | null`
  - `setRoutePin(config: OcxConfig, pin: { provider: string; hard: boolean } | null): OcxConfig` (returns the mutated config; persists it)

Pin is stored in `config.claudeCode.routing.pin` so it survives restart, matching the spec ("persisted to config runtime"). Reads go through the config object the server already holds; writes persist via the existing preserving-save.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/claude-route-pin.test.ts
import { describe, expect, test, mock } from "bun:test";

const saved: unknown[] = [];
mock.module("../src/config", () => ({
  saveConfigPreservingClaudeCode: (c: unknown) => { saved.push(structuredClone(c)); },
}));

import { getRoutePin, setRoutePin } from "../src/claude/route-pin";
import type { OcxConfig } from "../src/types";

function cfg(routing?: unknown): OcxConfig {
  return { port: 10100, defaultProvider: "openai", providers: {}, claudeCode: routing ? { routing } : {} } as unknown as OcxConfig;
}

describe("route pin", () => {
  test("getRoutePin returns null when unset", () => {
    expect(getRoutePin(cfg())).toBeNull();
  });
  test("getRoutePin returns a stored pin", () => {
    expect(getRoutePin(cfg({ pin: { provider: "kiro", hard: true } })))
      .toEqual({ provider: "kiro", hard: true });
  });
  test("setRoutePin writes into claudeCode.routing.pin and persists", () => {
    saved.length = 0;
    const c = setRoutePin(cfg(), { provider: "anthropic", hard: false });
    expect(c.claudeCode?.routing?.pin).toEqual({ provider: "anthropic", hard: false });
    expect(saved).toHaveLength(1);
  });
  test("setRoutePin(null) clears the pin and persists", () => {
    saved.length = 0;
    const c = setRoutePin(cfg({ pin: { provider: "kiro", hard: false } }), null);
    expect(c.claudeCode?.routing?.pin ?? null).toBeNull();
    expect(saved).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/claude-route-pin.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/claude/route-pin.ts
import type { OcxConfig } from "../types";
import { saveConfigPreservingClaudeCode } from "../config";

export function getRoutePin(config: OcxConfig): { provider: string; hard: boolean } | null {
  const pin = config.claudeCode?.routing?.pin;
  if (!pin || typeof pin.provider !== "string" || pin.provider.length === 0) return null;
  return { provider: pin.provider, hard: pin.hard === true };
}

export function setRoutePin(
  config: OcxConfig,
  pin: { provider: string; hard: boolean } | null,
): OcxConfig {
  const claudeCode = { ...(config.claudeCode ?? {}) };
  const routing = { ...(claudeCode.routing ?? {}) };
  if (pin) routing.pin = { provider: pin.provider, hard: pin.hard };
  else delete routing.pin;
  claudeCode.routing = routing;
  config.claudeCode = claudeCode;
  saveConfigPreservingClaudeCode(config);
  return config;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/claude-route-pin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/claude/route-pin.ts tests/claude-route-pin.test.ts
git commit -m "feat(claude): add persisted route pin state"
```

---

## Task 6: Inbound wiring — proactive selection in `resolveInboundModel`

Make `resolveInboundModel` consult the selector when a chain exists for the canonical id, returning the chosen candidate as a `provider/model` route key (which the router already resolves at `router.ts:325`). No chain → existing behavior (modelMap → passthrough) unchanged.

**Files:**
- Modify: `src/claude/inbound.ts` (`resolveInboundModel`, currently ends `return model;` at line 48)
- Test: `tests/claude-inbound-routing.test.ts`

**Interfaces:**
- Consumes: `chainForModel`, `normalizeRouting` (Task 1); `pickRoute`, `RouteSnapshot` (Task 3); `getRoutePin` (Task 5); `candidateKey` (Task 1).
- Produces:
  - `resolveClaudeRoute(canonicalId: string, config: OcxConfig, snapshot: RouteSnapshot): { routeKey: string; reason: RouteReason } | null` (null when no chain applies)

The existing `resolveInboundModel(model, cc?)` signature stays for callers that only remap; add the new pure helper and call it from `claude-messages.ts` (Task 7) where a config + snapshot are available. This keeps `resolveInboundModel` free of live state.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/claude-inbound-routing.test.ts
import { describe, expect, test } from "bun:test";
import { resolveClaudeRoute } from "../src/claude/inbound";
import type { RouteSnapshot } from "../src/claude/route-selector";
import type { OcxConfig } from "../src/types";

const NOW = 1_800_000_000_000;
const routing = {
  chains: {
    "claude-opus-4-8": [
      { provider: "anthropic", model: "claude-opus-4-8" },
      { provider: "xai", model: "grok-4.5" },
    ],
  },
};
function cfg(): OcxConfig {
  return { port: 10100, defaultProvider: "openai", providers: { anthropic: {}, xai: {} }, claudeCode: { routing } } as unknown as OcxConfig;
}
function snap(cooled: Record<string, true> = {}): RouteSnapshot {
  return {
    now: NOW,
    cooldown: k => cooled[k] ? { until: NOW + 10_000, source: "rate_limit" } : null,
    health: () => ({ usable: true, needsReauth: false }),
  };
}

describe("resolveClaudeRoute", () => {
  test("returns null when no chain matches (preserve legacy path)", () => {
    expect(resolveClaudeRoute("claude-haiku-4-5", cfg(), snap())).toBeNull();
  });
  test("returns the primary route key when healthy", () => {
    expect(resolveClaudeRoute("claude-opus-4-8", cfg(), snap()))
      .toEqual({ routeKey: "anthropic/claude-opus-4-8", reason: "primary" });
  });
  test("fails over when the primary is cooled", () => {
    expect(resolveClaudeRoute("claude-opus-4-8", cfg(), snap({ "anthropic/claude-opus-4-8": true })))
      .toEqual({ routeKey: "xai/grok-4.5", reason: "failover" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/claude-inbound-routing.test.ts`
Expected: FAIL — `resolveClaudeRoute` not exported.

- [ ] **Step 3: Add imports + helper to `src/claude/inbound.ts`**

Add near the top imports:

```typescript
import type { OcxConfig } from "../types";
import { chainForModel, normalizeRouting, candidateKey } from "./route-chains";
import { pickRoute, type RouteSnapshot, type RouteReason } from "./route-selector";
import { getRoutePin } from "./route-pin";
```

Add the exported helper (after `resolveInboundModel`):

```typescript
/**
 * Failover route for a canonical Claude id. Returns a `provider/model` route key the
 * router resolves directly (router.ts:325), or null when no chain applies (legacy path).
 * Pure: all live state arrives via `snapshot`.
 */
export function resolveClaudeRoute(
  canonicalId: string,
  config: OcxConfig,
  snapshot: RouteSnapshot,
): { routeKey: string; reason: RouteReason } | null {
  const routing = config.claudeCode?.routing;
  const chain = chainForModel(routing, canonicalId);
  if (!chain) return null;
  const { threshold } = normalizeRouting(routing);
  const pin = getRoutePin(config);
  const pick = pickRoute(chain, pin, snapshot, threshold);
  return { routeKey: candidateKey(pick), reason: pick.reason };
}
```

Note: `candidateKey` accepts `{provider, model}`; `pick` has both, so `candidateKey(pick)` yields `provider/model`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/claude-inbound-routing.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full claude inbound suite for regressions**

Run: `bun test tests/ 2>&1 | tail -5` (or the existing inbound test file if present)
Expected: no new failures.

- [ ] **Step 6: Commit**

```bash
git add src/claude/inbound.ts tests/claude-inbound-routing.test.ts
git commit -m "feat(claude): resolve failover route from chain + selector"
```

---

## Task 7: Reactive hop in `claude-messages.ts`

Wire the selector into the replay path: pick the route from the chain before the first replay, and on a pre-stream 429/401/5xx cool the candidate and re-pick up to `maxHops`. Mid-stream failures cannot hop (already 200) — cool for next time and surface the error.

**Files:**
- Modify: `src/server/claude-messages.ts` (model resolution ~line 550; replay ~line 679; status handling ~line 703–718)
- Test: `tests/claude-messages-failover.test.ts` (integration, injected replay)

**Interfaces:**
- Consumes: `resolveClaudeRoute` (Task 6); `buildRouteSnapshot`, `liveRouteHealthSources` (Task 4); `coolCandidate`, `ttlForStatus` (Task 2); `normalizeRouting` (Task 1); `resolveClientRetryAfter` (already imported at `claude-messages.ts:18`).

Because `handleResponses` is called directly (not an HTTP boundary), structure the hop as a small local loop around the existing replay. Extract the current single replay into a helper `replayOnce(routeKey)` that sets `body.model = routeKey` before building the internal request, then loop.

- [ ] **Step 1: Write the failing integration test**

```typescript
// tests/claude-messages-failover.test.ts
import { afterEach, describe, expect, test, mock } from "bun:test";
import { clearAllCooldowns, candidateCooldown } from "../src/claude/route-cooldowns";

// Inject handleResponses: first route 429, second route 200.
const calls: string[] = [];
mock.module("../src/server/responses", () => ({
  handleResponses: async (req: Request) => {
    const body = await req.clone().json().catch(() => ({}));
    const model = (body as { model?: string }).model ?? "";
    calls.push(model);
    if (model.startsWith("anthropic/")) {
      return new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 });
    }
    return new Response(JSON.stringify({ status: "completed", output: [] }), { status: 200 });
  },
}));

import { handleClaudeMessages } from "../src/server/claude-messages";
import type { OcxConfig } from "../src/types";

afterEach(() => { calls.length = 0; clearAllCooldowns(); });

function cfg(): OcxConfig {
  return {
    port: 10100, defaultProvider: "openai",
    providers: { anthropic: {}, xai: {} },
    claudeCode: { routing: { maxHops: 3, chains: {
      "claude-opus-4-8": [
        { provider: "anthropic", model: "claude-opus-4-8" },
        { provider: "xai", model: "grok-4.5" },
      ],
    } } },
  } as unknown as OcxConfig;
}

function req(): Request {
  return new Request("http://x/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer sk-local" },
    body: JSON.stringify({ model: "claude-opus-4-8", max_tokens: 16, stream: false, messages: [{ role: "user", content: "hi" }] }),
  });
}

describe("claude messages failover", () => {
  test("hops from a 429 primary to the next candidate", async () => {
    const res = await handleClaudeMessages(req(), cfg());
    expect(res.status).toBe(200);
    expect(calls).toEqual(["anthropic/claude-opus-4-8", "xai/grok-4.5"]);
    expect(candidateCooldown("anthropic/claude-opus-4-8")).not.toBeNull();
  });
});
```

> Implementer note: confirm the exact exported handler name and signature in `src/server/claude-messages.ts` (it may be `handleClaudeMessages(req, config, ...)` with extra args like a log context). Adapt the test's call and the wrapper accordingly. If the handler needs a log context, construct a minimal one as the existing tests in the repo do.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/claude-messages-failover.test.ts`
Expected: FAIL — no hop yet (only one call recorded, or 429 returned to client).

- [ ] **Step 3: Refactor the replay into a route-parameterized loop**

In the request handler, after the canonical id is known (near `resolveInboundModel(anthropicBody.model, config.claudeCode)` at line ~550), compute the failover route and loop the replay. Pseudocode-anchored edit:

```typescript
import { resolveClaudeRoute } from "../claude/inbound";
import { buildRouteSnapshot, liveRouteHealthSources } from "../claude/route-health";
import { coolCandidate, ttlForStatus } from "../claude/route-cooldowns";
import { normalizeRouting } from "../claude/route-chains";
```

Replace the single replay with:

```typescript
const canonicalId = resolveInboundModel(anthropicBody.model, config.claudeCode);
const { maxHops } = normalizeRouting(config.claudeCode?.routing);

let upstream: Response | undefined;
let lastRouteKey: string | null = null;
for (let hop = 0; hop < maxHops; hop++) {
  const snapshot = buildRouteSnapshot(config, liveRouteHealthSources(config));
  const route = resolveClaudeRoute(canonicalId, config, snapshot);
  // No chain -> legacy single replay path with the translated body's own model.
  const routeKey = route?.routeKey ?? null;
  lastRouteKey = routeKey;

  // Build the translated body; when a chain applies, force the chosen route key.
  const translation = anthropicToResponsesTranslation(anthropicBody, config.claudeCode);
  if (routeKey) (translation.body as Record<string, unknown>).model = routeKey;
  // ... existing internalReq construction using translation.body ...

  upstream = await handleResponses(internalReq, buildClaudeReplayConfig(config), logCtx, /* opts */);

  // Only a chained route can hop; legacy path returns immediately.
  if (!routeKey) break;
  const hoppable = upstream.status === 429 || upstream.status === 401 || upstream.status === 403
    || (upstream.status >= 500 && upstream.status <= 599);
  if (!hoppable) break;

  const retryAfterMs = resolveClientRetryAfter(upstream.headers) ?? undefined;
  const { ttlMs, source } = ttlForStatus(upstream.status, { retryAfterMs });
  coolCandidate(routeKey, source, ttlMs);
  // loop: next iteration re-picks; the just-cooled candidate is now skipped.
}
// fall through to the existing response-shaping code using `upstream`.
```

> Implementer notes:
> - Keep the EXISTING internal-request construction (headers, auth, cache key) — only the `translation.body.model` override and the surrounding loop are new. Do not duplicate translation logic; call `anthropicToResponsesTranslation` once per hop (cheap, pure) so the forced model is applied.
> - `resolveClientRetryAfter` is already imported (line 18); confirm it returns milliseconds — if it returns seconds, multiply by 1000.
> - Streaming: this loop inspects `upstream.status` BEFORE the body is streamed to the client (the existing code already branches on `upstream.status` at line ~703/717 before piping). A hop therefore never interrupts a started stream. Do not attempt to hop after streaming begins.
> - If all hops are exhausted, `upstream` holds the last error response — the existing error-shaping code (lines ~689–718) handles it unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/claude-messages-failover.test.ts`
Expected: PASS — two calls, second is `xai/grok-4.5`, primary cooled.

- [ ] **Step 5: Run the broader server suite for regressions**

Run: `bun test tests/ 2>&1 | tail -8`
Expected: no new failures (legacy no-chain path unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/server/claude-messages.ts tests/claude-messages-failover.test.ts
git commit -m "feat(claude): reactive provider hop on pre-stream failures"
```

---

## Task 8: CLI — `ocx claude route` + `ocx claude use`

**Files:**
- Create: `src/cli/claude-route.ts`
- Modify: `src/cli/index.ts` (add `route`/`use` dispatch beside the `desktop` branch at line ~996)
- Test: `tests/cli-claude-route.test.ts`

**Interfaces:**
- Consumes: `loadConfig` (`src/config.ts`), `setRoutePin`/`getRoutePin` (Task 5), `clearAllCooldowns`/`activeCooldowns` (Task 2), `normalizeRouting`/`chainForModel` (Task 1).
- Produces:
  - `parseRouteUseArgs(args: string[]): { action: "pin"; provider: string; hard: boolean } | { action: "auto" } | { error: string }`
  - `handleClaudeRouteCommand(args: string[]): Promise<number>` (subcommands: `use <provider> [--hard]`, `use auto`, `status`, `clear-cooldowns`)

- [ ] **Step 1: Write the failing test (arg parsing — pure)**

```typescript
// tests/cli-claude-route.test.ts
import { describe, expect, test } from "bun:test";
import { parseRouteUseArgs } from "../src/cli/claude-route";

describe("parseRouteUseArgs", () => {
  test("soft pin", () => {
    expect(parseRouteUseArgs(["kiro"])).toEqual({ action: "pin", provider: "kiro", hard: false });
  });
  test("hard pin", () => {
    expect(parseRouteUseArgs(["kiro", "--hard"])).toEqual({ action: "pin", provider: "kiro", hard: true });
  });
  test("auto clears the pin", () => {
    expect(parseRouteUseArgs(["auto"])).toEqual({ action: "auto" });
  });
  test("missing provider is an error", () => {
    expect(parseRouteUseArgs([])).toHaveProperty("error");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/cli-claude-route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/cli/claude-route.ts`**

```typescript
// src/cli/claude-route.ts
import { loadConfig } from "../config";
import { setRoutePin, getRoutePin } from "../claude/route-pin";
import { clearAllCooldowns, activeCooldowns } from "../claude/route-cooldowns";
import { normalizeRouting } from "../claude/route-chains";

export type RouteUseParse =
  | { action: "pin"; provider: string; hard: boolean }
  | { action: "auto" }
  | { error: string };

export function parseRouteUseArgs(args: string[]): RouteUseParse {
  const positional = args.filter(a => !a.startsWith("-"));
  const hard = args.includes("--hard");
  const first = positional[0];
  if (!first) return { error: "Usage: ocx claude use <provider|auto> [--hard]" };
  if (first === "auto") return { action: "auto" };
  return { action: "pin", provider: first, hard };
}

export async function handleClaudeRouteCommand(args: string[]): Promise<number> {
  const sub = args[0];
  const config = loadConfig();

  if (sub === "use") {
    const parsed = parseRouteUseArgs(args.slice(1));
    if ("error" in parsed) { console.error(parsed.error); return 1; }
    if (parsed.action === "auto") {
      setRoutePin(config, null);
      console.log("Route pin cleared — auto-failover active.");
      return 0;
    }
    if (!config.providers?.[parsed.provider]) {
      console.error(`Unknown provider '${parsed.provider}'. See 'ocx provider list'.`);
      return 1;
    }
    setRoutePin(config, { provider: parsed.provider, hard: parsed.hard });
    console.log(`Pinned Claude Code -> ${parsed.provider}${parsed.hard ? " (hard)" : " (soft)"}.`);
    return 0;
  }

  if (sub === "status") {
    const routing = config.claudeCode?.routing;
    const { threshold, maxHops } = normalizeRouting(routing);
    const pin = getRoutePin(config);
    console.log(`threshold=${threshold} maxHops=${maxHops} pin=${pin ? `${pin.provider}${pin.hard ? " (hard)" : ""}` : "none"}`);
    console.log("chains:");
    for (const [id, chain] of Object.entries(routing?.chains ?? {})) {
      console.log(`  ${id}: ${chain.map(c => `${c.provider}/${c.model}`).join(" -> ")}`);
    }
    const cds = activeCooldowns();
    const keys = Object.keys(cds);
    console.log(keys.length ? `cooldowns:` : "cooldowns: none");
    for (const k of keys) {
      console.log(`  ${k}: ${cds[k]!.source} until ${new Date(cds[k]!.until).toISOString()}`);
    }
    return 0;
  }

  if (sub === "clear-cooldowns") {
    clearAllCooldowns();
    console.log("Cleared all Claude route cooldowns.");
    return 0;
  }

  console.error("Usage: ocx claude route <use|status|clear-cooldowns>");
  return 1;
}
```

- [ ] **Step 4: Wire dispatch in `src/cli/index.ts`**

Inside `case "claude":` (line ~993), before the `cmdClaude` fallthrough at line ~1007, add:

```typescript
    if (args[1] === "route") {
      const { handleClaudeRouteCommand } = await import("./claude-route");
      process.exit(await handleClaudeRouteCommand(args.slice(2)));
    }
    if (args[1] === "use") {
      const { handleClaudeRouteCommand } = await import("./claude-route");
      // `ocx claude use <provider>` is sugar for `ocx claude route use <provider>`.
      process.exit(await handleClaudeRouteCommand(["use", ...args.slice(2)]));
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/cli-claude-route.test.ts`
Expected: PASS.

- [ ] **Step 6: Manual smoke (proxy running)**

```bash
ocx claude use xai && ocx claude route status && ocx claude use auto
```
Expected: pin set → status shows `pin=xai (soft)` → pin cleared.

- [ ] **Step 7: Commit**

```bash
git add src/cli/claude-route.ts src/cli/index.ts tests/cli-claude-route.test.ts
git commit -m "feat(cli): ocx claude route use/status/clear-cooldowns"
```

---

## Task 9: Management API — pin + status endpoints

**Files:**
- Modify: `src/server/management/agent-settings-routes.ts` (add two `if (url.pathname === …)` branches beside the `/api/claude-code` handlers at lines ~591/667)
- Test: `tests/claude-route-management.test.ts`

**Interfaces:**
- Consumes: `setRoutePin`/`getRoutePin` (Task 5); `normalizeRouting`/`chainForModel` (Task 1); `activeCooldowns` (Task 2); `buildRouteSnapshot`/`liveRouteHealthSources` (Task 4); `candidateKey` (Task 1).
- Produces (HTTP):
  - `PUT /api/claude/route/pin` body `{ provider: string | null, hard?: boolean }` → `{ pin: {provider,hard} | null }`
  - `GET /api/claude/route/status` → `{ threshold, maxHops, pin, chains, candidates: [{ id, provider, model, healthy, quotaPercent, needsReauth, cooledUntil }] }`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/claude-route-management.test.ts
import { describe, expect, test, mock } from "bun:test";

const saved: unknown[] = [];
mock.module("../src/config", () => ({
  loadConfig: () => ({
    port: 10100, defaultProvider: "openai",
    providers: { anthropic: {}, xai: {} },
    claudeCode: { routing: { chains: { "claude-opus-4-8": [
      { provider: "anthropic", model: "claude-opus-4-8" },
      { provider: "xai", model: "grok-4.5" },
    ] } } },
  }),
  saveConfigPreservingClaudeCode: (c: unknown) => { saved.push(c); },
}));

import { handleClaudeRouteRequest } from "../src/server/management/agent-settings-routes";

describe("claude route management", () => {
  test("PUT pin then GET status reflects it", async () => {
    const put = await handleClaudeRouteRequest(new Request("http://x/api/claude/route/pin", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "xai", hard: false }),
    }), new URL("http://x/api/claude/route/pin"));
    expect(put?.status).toBe(200);

    const get = await handleClaudeRouteRequest(new Request("http://x/api/claude/route/status"),
      new URL("http://x/api/claude/route/status"));
    const json = await get!.json();
    expect(json.pin).toEqual({ provider: "xai", hard: false });
    expect(json.chains["claude-opus-4-8"]).toHaveLength(2);
  });
  test("returns null for unrelated paths", async () => {
    expect(await handleClaudeRouteRequest(new Request("http://x/api/other"), new URL("http://x/api/other"))).toBeNull();
  });
});
```

> Implementer note: match the existing dispatch convention in `agent-settings-routes.ts`. If that file dispatches inside one big function rather than exporting per-feature handlers, add the two branches there and export a small `handleClaudeRouteRequest(req, url)` used both by the dispatcher and this test (mirror how `/api/claude-code` is structured).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/claude-route-management.test.ts`
Expected: FAIL — `handleClaudeRouteRequest` not exported.

- [ ] **Step 3: Implement the handler**

Add to `src/server/management/agent-settings-routes.ts`:

```typescript
import { getRoutePin, setRoutePin } from "../../claude/route-pin";
import { normalizeRouting, candidateKey } from "../../claude/route-chains";
import { activeCooldowns } from "../../claude/route-cooldowns";
import { buildRouteSnapshot, liveRouteHealthSources } from "../../claude/route-health";
import { loadConfig } from "../../config";

export async function handleClaudeRouteRequest(req: Request, url: URL): Promise<Response | null> {
  if (url.pathname === "/api/claude/route/pin" && req.method === "PUT") {
    const body = await req.json().catch(() => ({})) as { provider?: string | null; hard?: boolean };
    const config = loadConfig();
    const pin = body.provider ? { provider: body.provider, hard: body.hard === true } : null;
    setRoutePin(config, pin);
    return new Response(JSON.stringify({ pin: getRoutePin(config) }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }
  if (url.pathname === "/api/claude/route/status" && req.method === "GET") {
    const config = loadConfig();
    const routing = config.claudeCode?.routing;
    const { threshold, maxHops } = normalizeRouting(routing);
    const snapshot = buildRouteSnapshot(config, liveRouteHealthSources(config));
    const cds = activeCooldowns(snapshot.now);
    const candidates = Object.entries(routing?.chains ?? {}).flatMap(([id, chain]) =>
      chain.map(c => {
        const key = candidateKey(c);
        const h = snapshot.health(c);
        return {
          id, provider: c.provider, model: c.model,
          quotaPercent: h.quotaPercent ?? null,
          needsReauth: h.needsReauth,
          cooledUntil: cds[key]?.until ?? null,
          healthy: !cds[key] && h.usable && !h.needsReauth
            && !(typeof h.quotaPercent === "number" && h.quotaPercent >= threshold),
        };
      }),
    );
    return new Response(JSON.stringify({
      threshold, maxHops, pin: getRoutePin(config), chains: routing?.chains ?? {}, candidates,
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return null;
}
```

Then call it from the file's main dispatcher (where `/api/claude-code` is handled): early-return `const routed = await handleClaudeRouteRequest(req, url); if (routed) return routed;`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/claude-route-management.test.ts`
Expected: PASS.

- [ ] **Step 5: Manual smoke (proxy running)**

```bash
curl -s -X PUT http://127.0.0.1:10100/api/claude/route/pin -H content-type:application/json -d '{"provider":"xai"}'
curl -s http://127.0.0.1:10100/api/claude/route/status | python -m json.tool
```
Expected: pin echoed; status lists candidates with health.

- [ ] **Step 6: Commit**

```bash
git add src/server/management/agent-settings-routes.ts tests/claude-route-management.test.ts
git commit -m "feat(server): claude route pin + status management endpoints"
```

---

## Task 10: Docs + end-to-end verification

**Files:**
- Modify: `docs-site/src/content/docs/guides/claude-code.md` (add a "Provider failover" section after "Model map (interception)")
- Modify: `src/cli/help.ts` (add `ocx claude route` lines to help output)

- [ ] **Step 1: Document the feature**

Add to `claude-code.md` after the model-map section: the `claudeCode.routing` schema (chains/threshold/maxHops/pin), the lookup order (explicit picker route → chain selector → modelMap → passthrough), failover triggers + TTLs, and the CLI (`ocx claude use <provider> [--hard]`, `ocx claude use auto`, `ocx claude route status`, `ocx claude route clear-cooldowns`). Keep values consistent with the Global Constraints above.

- [ ] **Step 2: Add CLI help lines**

In `src/cli/help.ts`, under the `ocx claude` help block, add:

```
  ocx claude use <provider> [--hard]   Pin Claude Code routing to a provider (soft/hard)
  ocx claude use auto                  Clear the pin (auto-failover)
  ocx claude route status              Show chains, pin, live health, cooldowns
  ocx claude route clear-cooldowns     Reset live route cooldowns
```

- [ ] **Step 3: Full suite + typecheck**

Run: `bun run typecheck && bun test tests/ 2>&1 | tail -8`
Expected: typecheck clean; all tests pass.

- [ ] **Step 4: Live end-to-end (proxy running, a chain configured for `claude-opus-4-8`)**

```bash
# configure a chain (anthropic -> xai) via config.json routing, restart proxy, then:
ocx claude route status
curl -s -X POST http://127.0.0.1:10100/v1/messages -H content-type:application/json \
  -H "authorization: Bearer sk-local" \
  -d '{"model":"claude-opus-4-8","max_tokens":32,"messages":[{"role":"user","content":"which company built you?"}]}'
```
Expected: served by the primary (anthropic) when healthy; after pinning `ocx claude use xai`, the same call is answered by Grok — no restart.

- [ ] **Step 5: Commit**

```bash
git add docs-site/src/content/docs/guides/claude-code.md src/cli/help.ts
git commit -m "docs(claude): document provider failover routing + CLI"
```

---

## Self-review notes

- **Spec coverage:** chains + selector (Tasks 1,3) · health gate w/ quota/reauth/disabled (Tasks 3,4) · proactive threshold + reactive 429/401/5xx (Tasks 3,7) · same-model-hop-provider ordering (Task 1 config + Task 3) · sticky via cooldown (Task 2) · soft/hard pin + `/model` picker bypass (Tasks 5,6; picker bypass is the pre-existing `router.ts:325` slash path, no code) · CLI A+B (Task 8) · management/hot-reload (Tasks 5,9) · defaults locked (Global Constraints) · back-compat (Tasks 1,6,7 gate on chain existence).
- **Out of scope confirmed absent:** Codex/`/v1/responses`, GUI panel, round-robin, auto-return poller, per-request re-pick.
- **Type consistency:** `candidateKey` used everywhere for map keys and route keys; `RouteSnapshot`/`CandidateHealth` defined in Task 3 and consumed unchanged in Tasks 4/6/9; `RoutePick.reason` values (`primary|failover|pinned|all_cooled`) consistent across selector, inbound helper, and status output.
- **Known implementer confirmations (flagged inline):** exact `handleClaudeMessages` signature (Task 7), `getAccountQuota` field names + keying (Task 4), `resolveClientRetryAfter` unit ms vs s (Task 7), and the `agent-settings-routes.ts` dispatch shape (Task 9). Each is a lookup in a named file, not a design gap.
