import type { ProviderAccount } from "./types";

/** Expected SSO session lifetime per provider (ms). Conservative lower bounds. */
export const PROVIDER_SESSION_TTLS: Record<string, number> = {
  claude: 8 * 60 * 60 * 1000,       // 8 hours
  anthropic: 8 * 60 * 60 * 1000,    // 8 hours
  kiro: 24 * 60 * 60 * 1000,        // 24 hours
  cursor: 7 * 24 * 60 * 60 * 1000,  // 7 days
  kimi: 24 * 60 * 60 * 1000,        // 24 hours
};

const FALLBACK_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const SESSION_WARN_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

export type SessionLifetimeStatus = "ok" | "expiring" | "expired";

export interface SessionLifetime {
  /** epoch ms — same as account.addedAt */
  loginAt: number;
  /** loginAt + provider TTL */
  expiresAt: number;
  /** expiresAt - now; negative when expired */
  timeLeftMs: number;
  status: SessionLifetimeStatus;
}

/**
 * Derive session lifetime from when the account was added.
 * Returns null if addedAt is missing (cannot compute — shown as "—" in CLI).
 */
export function computeSessionLifetime(
  provider: string,
  account: ProviderAccount,
  now = Date.now(),
): SessionLifetime | null {
  if (typeof account.addedAt !== "number") return null;
  const ttl = PROVIDER_SESSION_TTLS[provider] ?? FALLBACK_TTL_MS;
  const loginAt = account.addedAt;
  const expiresAt = loginAt + ttl;
  const timeLeftMs = expiresAt - now;
  let status: SessionLifetimeStatus;
  if (timeLeftMs <= 0) {
    status = "expired";
  } else if (timeLeftMs < SESSION_WARN_THRESHOLD_MS) {
    status = "expiring";
  } else {
    status = "ok";
  }
  return { loginAt, expiresAt, timeLeftMs, status };
}

/** Format a duration in ms as a human-readable string. Negative = "X ago". */
export function formatTimeLeft(ms: number): string {
  const abs = Math.abs(ms);
  const suffix = ms < 0 ? " ago" : "";
  const totalMinutes = Math.floor(abs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h${suffix}` : `${days}d${suffix}`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m${suffix}` : `${hours}h${suffix}`;
  }
  return `${minutes}m${suffix}`;
}
