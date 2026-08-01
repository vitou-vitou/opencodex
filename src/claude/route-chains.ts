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
