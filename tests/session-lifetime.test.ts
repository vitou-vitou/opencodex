import { describe, expect, test } from "bun:test";
import {
  computeSessionLifetime,
  formatTimeLeft,
  SESSION_WARN_THRESHOLD_MS,
} from "../src/oauth/session-lifetime";
import type { ProviderAccount } from "../src/oauth/types";

function makeAccount(addedAt?: number): ProviderAccount {
  return {
    id: "abc12345",
    addedAt,
    credential: { access: "tok", refresh: "ref", expires: Date.now() + 3600_000 },
  };
}

describe("computeSessionLifetime", () => {
  test("returns null when addedAt missing", () => {
    expect(computeSessionLifetime("claude", makeAccount(undefined))).toBeNull();
  });

  test("status ok when well within TTL", () => {
    const now = Date.now();
    const addedAt = now - 1 * 60 * 60 * 1000; // 1h ago
    const result = computeSessionLifetime("claude", makeAccount(addedAt), now);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("ok");
    expect(result!.loginAt).toBe(addedAt);
    expect(result!.timeLeftMs).toBeGreaterThan(SESSION_WARN_THRESHOLD_MS);
  });

  test("status expiring when timeLeft < warn threshold", () => {
    const now = Date.now();
    const addedAt = now - 7 * 60 * 60 * 1000; // 7h ago, claude TTL=8h -> 1h left
    const result = computeSessionLifetime("claude", makeAccount(addedAt), now);
    expect(result!.status).toBe("expiring");
    expect(result!.timeLeftMs).toBeLessThan(SESSION_WARN_THRESHOLD_MS);
    expect(result!.timeLeftMs).toBeGreaterThan(0);
  });

  test("status expired when past TTL", () => {
    const now = Date.now();
    const addedAt = now - 9 * 60 * 60 * 1000; // 9h ago, claude TTL=8h
    const result = computeSessionLifetime("claude", makeAccount(addedAt), now);
    expect(result!.status).toBe("expired");
    expect(result!.timeLeftMs).toBeLessThan(0);
  });

  test("uses fallback TTL for unknown provider", () => {
    const now = Date.now();
    const addedAt = now - 20 * 60 * 60 * 1000; // 20h ago, fallback=24h -> 4h left
    const result = computeSessionLifetime("unknown-provider", makeAccount(addedAt), now);
    expect(result!.status).toBe("ok");
  });

  test("cursor TTL is 7 days", () => {
    const now = Date.now();
    const addedAt = now - 6 * 24 * 60 * 60 * 1000; // 6 days ago
    const result = computeSessionLifetime("cursor", makeAccount(addedAt), now);
    expect(result!.status).toBe("ok");
  });
});

describe("formatTimeLeft", () => {
  test("formats hours and minutes", () => {
    expect(formatTimeLeft(2 * 60 * 60 * 1000 + 30 * 60 * 1000)).toBe("2h 30m");
  });

  test("formats minutes only when under 1 hour", () => {
    expect(formatTimeLeft(45 * 60 * 1000)).toBe("45m");
  });

  test("formats days when >= 24h", () => {
    expect(formatTimeLeft(25 * 60 * 60 * 1000)).toBe("1d 1h");
  });

  test("formats negative as ago string", () => {
    expect(formatTimeLeft(-2 * 60 * 60 * 1000)).toBe("2h ago");
  });
});
