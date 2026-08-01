// tests/claude-route-pin.test.ts
import { describe, expect, test, mock } from "bun:test";

const saved: unknown[] = [];
mock.module("../src/config", () => ({
  saveConfigPreservingClaudeCode: (c: unknown) => { saved.push(structuredClone(c)); },
}));

import { getRoutePin, setRoutePin } from "../src/claude/route-pin";
import type { OcxConfig } from "../src/types";

function cfg(routing?: unknown): OcxConfig {
  return { port: 10100, defaultProvider: "openai", providers: {}, claudeCode: routing ? { routing } : {} } as unknown as OcxConfig;
}

describe("route pin", () => {
  test("getRoutePin returns null when unset", () => {
    expect(getRoutePin(cfg())).toBeNull();
  });
  test("getRoutePin returns a stored pin", () => {
    expect(getRoutePin(cfg({ pin: { provider: "kiro", hard: true } })))
      .toEqual({ provider: "kiro", hard: true });
  });
  test("setRoutePin writes into claudeCode.routing.pin and persists", () => {
    saved.length = 0;
    const c = setRoutePin(cfg(), { provider: "anthropic", hard: false });
    expect(c.claudeCode?.routing?.pin).toEqual({ provider: "anthropic", hard: false });
    expect(saved).toHaveLength(1);
  });
  test("setRoutePin(null) clears the pin and persists", () => {
    saved.length = 0;
    const c = setRoutePin(cfg({ pin: { provider: "kiro", hard: false } }), null);
    expect(c.claudeCode?.routing?.pin ?? null).toBeNull();
    expect(saved).toHaveLength(1);
  });
});
