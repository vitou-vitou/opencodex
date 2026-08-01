import type {
  OcxClaudeCodeRouting,
  OcxClaudeDesktopFamily,
  OcxClaudeDesktopProfile,
  OcxClaudeRouteCandidate,
  OcxConfig,
} from "../types";
import { DESKTOP_FAMILIES } from "./desktop-profile";
import { resolveDesktop3pAlias } from "./desktop-3p";

export const DEFAULT_ROUTE_THRESHOLD = 90;
export const DEFAULT_ROUTE_MAX_HOPS = 3;

/** Desktop family keys supported as `claudeCode.routing.chains` entries. */
export const DESKTOP_CHAIN_FAMILIES = DESKTOP_FAMILIES;

/**
 * Recommended reactive chains for Desktop family keys.
 *
 * Candidate order follows arena.ai text leaderboard Elo among models reachable via
 * kiro + xai catalogs (snapshot 2026-08-01, https://arena.ai/leaderboard/text):
 *   grok-4.5 ~#33 Elo 1469 → glm-5 ~#48 Elo 1457 → claude-sonnet-4.5 ~#53 Elo 1455
 *   → deepseek-v3.2 / kiro deepseek-3.2 ~#96 Elo 1425 → claude-haiku-4.5 ~#120 Elo 1412
 *   → minimax-m2.5 ~#148 Elo 1390
 *
 * Merged only for missing keys unless `ensure-chains --replace` (never clobber by default).
 */
export const RECOMMENDED_FAMILY_CHAINS: Record<OcxClaudeDesktopFamily, OcxClaudeRouteCandidate[]> = {
  // Flagship: highest arena Elo first.
  opus: [
    { provider: "xai", model: "grok-4.5" },
    { provider: "kiro", model: "glm-5" },
    { provider: "kiro", model: "claude-sonnet-4.5" },
  ],
  // Mid tier: same top arena slate (best available quality under sonnet slot).
  sonnet: [
    { provider: "xai", model: "grok-4.5" },
    { provider: "kiro", model: "glm-5" },
    { provider: "kiro", model: "claude-sonnet-4.5" },
  ],
  // Light tier: arena order among faster/cheaper kiro models (no Grok — keep haiku-cost shape).
  haiku: [
    { provider: "kiro", model: "deepseek-3.2" },
    { provider: "kiro", model: "claude-haiku-4.5" },
    { provider: "kiro", model: "minimax-m2.5" },
  ],
  // Fable slot: best arena among xai + kiro (Anthropic Fable #1 omitted unless anthropic is configured).
  fable: [
    { provider: "xai", model: "grok-4.5" },
    { provider: "kiro", model: "glm-5" },
    { provider: "kiro", model: "claude-sonnet-4.5" },
  ],
};

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

/**
 * Ordered chain lookup keys for an inbound Claude model id.
 *
 * Order: exact id → Desktop family (`opus`/`sonnet`/`haiku`/`fable`) → date-stripped id.
 * Family is resolved before date-strip so Desktop date aliases
 * (`claude-opus-4-8-2026MMDD`) do not all collapse onto a single `claude-opus-4-8` chain.
 */
export function resolveChainLookupIds(
  requestedModel: string,
  config: OcxConfig,
): string[] {
  const ids: string[] = [];
  const push = (id: string | null | undefined) => {
    if (typeof id === "string" && id.length > 0 && !ids.includes(id)) ids.push(id);
  };

  push(requestedModel);

  const profile = config.claudeCode?.desktopProfile;
  for (const family of familiesForDesktopRequest(requestedModel, profile)) {
    push(family);
  }

  const dateStripped = requestedModel.replace(/-\d{8}$/, "");
  if (dateStripped !== requestedModel) push(dateStripped);

  return ids;
}

function familiesForDesktopRequest(
  requestedModel: string,
  profile: OcxClaudeDesktopProfile | undefined,
): OcxClaudeDesktopFamily[] {
  if (!profile) return [];
  const found: OcxClaudeDesktopFamily[] = [];
  const pushFamily = (family: OcxClaudeDesktopFamily) => {
    if (!found.includes(family)) found.push(family);
  };

  for (const assignment of Object.values(profile.assignments)) {
    if (assignment.alias === requestedModel) pushFamily(assignment.family);
  }

  const routed = resolveDesktop3pAlias(requestedModel);
  if (routed) {
    const byRoute = profile.assignments[routed];
    if (byRoute) pushFamily(byRoute.family);
    for (const family of DESKTOP_FAMILIES) {
      if (profile.defaults[family] === routed) pushFamily(family);
    }
  }

  return found;
}

/** First matching chain across {@link resolveChainLookupIds} order. */
export function chainForRequest(
  routing: OcxClaudeCodeRouting | undefined,
  requestedModel: string,
  config: OcxConfig,
): OcxClaudeRouteCandidate[] | null {
  for (const id of resolveChainLookupIds(requestedModel, config)) {
    const chain = chainForModel(routing, id);
    if (chain) return chain;
  }
  return null;
}

/**
 * Merge recommended family chains into routing.
 * @param replace When true, overwrite family keys with the recommended template.
 *   When false (default), only fill missing / empty keys.
 */
export function mergeRecommendedFamilyChains(
  routing: OcxClaudeCodeRouting | undefined,
  replace = false,
): { routing: OcxClaudeCodeRouting; added: OcxClaudeDesktopFamily[]; replaced: OcxClaudeDesktopFamily[] } {
  const chains: Record<string, OcxClaudeRouteCandidate[]> = { ...(routing?.chains ?? {}) };
  const added: OcxClaudeDesktopFamily[] = [];
  const replaced: OcxClaudeDesktopFamily[] = [];
  for (const family of DESKTOP_FAMILIES) {
    const existing = chainForModel({ chains }, family);
    if (existing && !replace) continue;
    if (existing && replace) replaced.push(family);
    else if (!existing) added.push(family);
    chains[family] = RECOMMENDED_FAMILY_CHAINS[family].map(c => ({ ...c }));
  }
  return {
    routing: {
      ...routing,
      chains,
    },
    added,
    replaced,
  };
}

/** Apply recommended family chains onto config (in memory). */
export function ensureRecommendedFamilyChains(
  config: OcxConfig,
  replace = false,
): { added: OcxClaudeDesktopFamily[]; replaced: OcxClaudeDesktopFamily[] } {
  const { routing, added, replaced } = mergeRecommendedFamilyChains(config.claudeCode?.routing, replace);
  if (added.length === 0 && replaced.length === 0) return { added: [], replaced: [] };
  config.claudeCode = { ...(config.claudeCode ?? {}), routing };
  return { added, replaced };
}
