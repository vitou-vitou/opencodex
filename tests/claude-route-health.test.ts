import { describe, expect, test } from "bun:test";
import { providerUsable, buildRouteSnapshot, type RouteHealthSources } from "../src/claude/route-health";
import type { OcxConfig, OcxClaudeRouteCandidate } from "../src/types";

const NOW = 1_800_000_000_000;

function cfg(providers: Record<string, unknown>): OcxConfig {
  return { port: 10100, defaultProvider: "openai", providers } as unknown as OcxConfig;
}

describe("providerUsable", () => {
  test("false for missing provider", () => {
    expect(providerUsable(cfg({}), "kiro")).toBe(false);
  });
  test("false for a disabled provider", () => {
    expect(providerUsable(cfg({ kiro: { disabled: true } }), "kiro")).toBe(false);
  });
  test("true for a present, enabled provider", () => {
    expect(providerUsable(cfg({ kiro: {} }), "kiro")).toBe(true);
  });
});

describe("buildRouteSnapshot", () => {
  const c: OcxClaudeRouteCandidate = { provider: "anthropic", model: "claude-opus-4-8" };
  const sources: RouteHealthSources = {
    quotaPercent: () => 42,
    needsReauth: () => false,
    usable: () => true,
  };
  test("composes injected sources into CandidateHealth", () => {
    const snap = buildRouteSnapshot(cfg({ anthropic: {} }), sources, NOW);
    expect(snap.now).toBe(NOW);
    expect(snap.health(c)).toEqual({ quotaPercent: 42, needsReauth: false, usable: true });
  });
  test("cooldown delegates to the shared cooldown map (absent -> null)", () => {
    const snap = buildRouteSnapshot(cfg({ anthropic: {} }), sources, NOW);
    expect(snap.cooldown("anthropic/claude-opus-4-8")).toBeNull();
  });
});
