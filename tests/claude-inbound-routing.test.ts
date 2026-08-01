import { describe, expect, test } from "bun:test";
import { resolveClaudeRoute } from "../src/claude/inbound";
import type { RouteSnapshot } from "../src/claude/route-selector";
import type { OcxConfig } from "../src/types";

const NOW = 1_800_000_000_000;
const routing = {
  chains: {
    "claude-opus-4-8": [
      { provider: "anthropic", model: "claude-opus-4-8" },
      { provider: "xai", model: "grok-4.5" },
    ],
  },
};
function cfg(): OcxConfig {
  return { port: 10100, defaultProvider: "openai", providers: { anthropic: {}, xai: {} }, claudeCode: { routing } } as unknown as OcxConfig;
}
function snap(cooled: Record<string, true> = {}): RouteSnapshot {
  return {
    now: NOW,
    cooldown: k => cooled[k] ? { until: NOW + 10_000, source: "rate_limit" } : null,
    health: () => ({ usable: true, needsReauth: false }),
  };
}

describe("resolveClaudeRoute", () => {
  test("returns null when no chain matches (preserve legacy path)", () => {
    expect(resolveClaudeRoute("claude-haiku-4-5", cfg(), snap())).toBeNull();
  });
  test("returns the primary route key when healthy", () => {
    expect(resolveClaudeRoute("claude-opus-4-8", cfg(), snap()))
      .toEqual({ routeKey: "anthropic/claude-opus-4-8", reason: "primary" });
  });
  test("fails over when the primary is cooled", () => {
    expect(resolveClaudeRoute("claude-opus-4-8", cfg(), snap({ "anthropic/claude-opus-4-8": true })))
      .toEqual({ routeKey: "xai/grok-4.5", reason: "failover" });
  });
});
