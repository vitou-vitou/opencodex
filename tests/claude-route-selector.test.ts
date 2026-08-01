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
