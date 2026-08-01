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
