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
