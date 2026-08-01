import type {
  OcxClaudeCodeRouting,
  OcxClaudeDesktopFamily,
  OcxClaudeDesktopProfile,
  OcxClaudeRouteCandidate,
  OcxConfig,
} from "../types";
import { DESKTOP_FAMILIES } from "./desktop-profile";
import { resolveDesktop3pAlias } from "./desktop-3p";
import {
  arenaMaxAgeHours,
  buildArenaSnapshotFromText,
  fetchArenaTextLeaderboard,
  isArenaSnapshotStale,
  type CatalogModelRef,
  type OcxArenaSnapshot,
} from "./arena-rank";

export const DEFAULT_ROUTE_THRESHOLD = 90;
export const DEFAULT_ROUTE_MAX_HOPS = 3;

/** Desktop family keys supported as `claudeCode.routing.chains` entries. */
export const DESKTOP_CHAIN_FAMILIES = DESKTOP_FAMILIES;

/**
 * Recommended reactive chains for Desktop family keys (offline fallback).
 *
 * Candidate order follows arena.ai text leaderboard Elo among models reachable via
 * kiro + xai catalogs (snapshot 2026-08-01, https://arena.ai/leaderboard/text).
 * Prefer a live `arenaSnapshot` from `refresh-arena` when present.
 *
 * Merged only for missing keys unless `ensure-chains --replace` (never clobber by default).
 */
export const RECOMMENDED_FAMILY_CHAINS: Record<OcxClaudeDesktopFamily, OcxClaudeRouteCandidate[]> = {
  opus: [
    { provider: "xai", model: "grok-4.5" },
    { provider: "kiro", model: "glm-5" },
    { provider: "kiro", model: "claude-sonnet-4.5" },
  ],
  sonnet: [
    { provider: "xai", model: "grok-4.5" },
    { provider: "kiro", model: "glm-5" },
    { provider: "kiro", model: "claude-sonnet-4.5" },
  ],
  haiku: [
    { provider: "kiro", model: "deepseek-3.2" },
    { provider: "kiro", model: "claude-haiku-4.5" },
    { provider: "kiro", model: "minimax-m2.5" },
  ],
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

/** Template used by ensure-chains: live snapshot chains when present, else static fallback. */
export function recommendedFamilyTemplate(
  routing: OcxClaudeCodeRouting | undefined,
): Record<OcxClaudeDesktopFamily, OcxClaudeRouteCandidate[]> {
  const snap = routing?.arenaSnapshot?.chains;
  if (!snap) return RECOMMENDED_FAMILY_CHAINS;
  const out = {} as Record<OcxClaudeDesktopFamily, OcxClaudeRouteCandidate[]>;
  let any = false;
  for (const family of DESKTOP_FAMILIES) {
    const raw = snap[family];
    const chain = Array.isArray(raw) ? raw.filter(isValidCandidate) : [];
    if (chain.length > 0) {
      out[family] = chain.map(c => ({ ...c }));
      any = true;
    } else {
      out[family] = RECOMMENDED_FAMILY_CHAINS[family].map(c => ({ ...c }));
    }
  }
  return any ? out : RECOMMENDED_FAMILY_CHAINS;
}

export function mergeRecommendedFamilyChains(
  routing: OcxClaudeCodeRouting | undefined,
  replace = false,
): { routing: OcxClaudeCodeRouting; added: OcxClaudeDesktopFamily[]; replaced: OcxClaudeDesktopFamily[] } {
  const template = recommendedFamilyTemplate(routing);
  const chains: Record<string, OcxClaudeRouteCandidate[]> = { ...(routing?.chains ?? {}) };
  const added: OcxClaudeDesktopFamily[] = [];
  const replaced: OcxClaudeDesktopFamily[] = [];
  for (const family of DESKTOP_FAMILIES) {
    const existing = chainForModel({ chains }, family);
    if (existing && !replace) continue;
    if (existing && replace) replaced.push(family);
    else if (!existing) added.push(family);
    chains[family] = template[family].map(c => ({ ...c }));
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

export function ensureRecommendedFamilyChains(
  config: OcxConfig,
  replace = false,
): { added: OcxClaudeDesktopFamily[]; replaced: OcxClaudeDesktopFamily[] } {
  const { routing, added, replaced } = mergeRecommendedFamilyChains(config.claudeCode?.routing, replace);
  if (added.length === 0 && replaced.length === 0) return { added: [], replaced: [] };
  config.claudeCode = { ...(config.claudeCode ?? {}), routing };
  return { added, replaced };
}

export function persistArenaSnapshot(config: OcxConfig, snapshot: OcxArenaSnapshot): void {
  const routing = { ...(config.claudeCode?.routing ?? {}) };
  routing.arenaSnapshot = {
    fetchedAt: snapshot.fetchedAt,
    source: snapshot.source,
    chains: snapshot.chains,
    matchedCount: snapshot.matchedCount,
  };
  config.claudeCode = { ...(config.claudeCode ?? {}), routing };
}

export type RefreshArenaResult =
  | { ok: true; snapshot: OcxArenaSnapshot; refreshed: boolean }
  | { ok: false; error: string; refreshed: false };

/**
 * Fetch arena + build snapshot for the given catalog.
 * Does not mutate config unless caller persists.
 */
export async function refreshArenaSnapshot(
  catalog: readonly CatalogModelRef[],
  opts?: { fetchImpl?: typeof fetch; text?: string },
): Promise<RefreshArenaResult> {
  try {
    const text = opts?.text ?? await fetchArenaTextLeaderboard(opts?.fetchImpl);
    const snapshot = buildArenaSnapshotFromText(text, catalog);
    return { ok: true, snapshot, refreshed: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), refreshed: false };
  }
}

/**
 * If snapshot missing/stale, attempt one best-effort refresh and persist on success.
 * Never throws; returns whether a network refresh ran.
 */
export async function maybeStaleArenaRefresh(
  config: OcxConfig,
  catalog: readonly CatalogModelRef[],
  opts?: { fetchImpl?: typeof fetch; nowMs?: number },
): Promise<{ attempted: boolean; updated: boolean; error?: string }> {
  const routing = config.claudeCode?.routing;
  const maxAge = arenaMaxAgeHours(routing?.arenaMaxAgeHours);
  const snap = routing?.arenaSnapshot as OcxArenaSnapshot | undefined;
  if (!isArenaSnapshotStale(snap, maxAge, opts?.nowMs)) {
    return { attempted: false, updated: false };
  }
  const result = await refreshArenaSnapshot(catalog, { fetchImpl: opts?.fetchImpl });
  if (!result.ok) return { attempted: true, updated: false, error: result.error };
  persistArenaSnapshot(config, result.snapshot);
  return { attempted: true, updated: true };
}
