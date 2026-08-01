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
  // Hard pin: lock to the pinned provider only, never hop
  if (pin?.hard) {
    const pinned = candidates.find(c => c.provider === pin.provider);
    if (pinned && isHealthy(pinned, snapshot, threshold)) {
      return { provider: pinned.provider, model: pinned.model, reason: "pinned" };
    }
    throw new NoHealthyRouteError(pin.provider);
  }

  // Soft pin or no pin: standard failover logic
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
  const last = ordered[ordered.length - 1]!;
  return { provider: last.provider, model: last.model, reason: "all_cooled" };
}
