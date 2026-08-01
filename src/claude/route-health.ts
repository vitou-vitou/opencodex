import type { OcxConfig, OcxClaudeRouteCandidate } from "../types";
import { candidateCooldown } from "./route-cooldowns";
import type { RouteSnapshot } from "./route-selector";
import { getAccountQuota } from "../codex/quota";
import { isAccountNeedsReauth } from "../codex/account-runtime-state";

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

/**
 * Live sources for the running proxy. Extend quotaPercent per provider as quota data lands.
 *
 * Verified against the real APIs (src/codex/quota.ts, src/codex/account-runtime-state.ts):
 * `getAccountQuota(accountId)` returns `StoredAccountQuota | null` with `weeklyPercent` /
 * `monthlyPercent` fields (brief's guessed field names were correct) and `isAccountNeedsReauth(id)`
 * returns a plain boolean (also matches). Both are keyed by Codex ACCOUNT ID, not model name.
 * `OcxClaudeRouteCandidate` only carries `{ provider, model }` — there is no account id available
 * here — so for now `c.model` is passed through as a best-effort key. For the "openai" provider
 * this will not match a real account id (falling through to "unknown -> healthy/no-reauth"), which
 * is a safe default but not yet load-bearing. Threading the actual active/resolved account id
 * through this factory is a follow-up once Claude-Code failover targets the Codex pool.
 */
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
