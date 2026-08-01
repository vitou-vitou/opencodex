import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ROUTE_THRESHOLD,
  DEFAULT_ROUTE_MAX_HOPS,
  candidateKey,
  normalizeRouting,
  chainForModel,
} from "../src/claude/route-chains";

describe("candidateKey", () => {
  test("joins provider and model with a slash", () => {
    expect(candidateKey({ provider: "anthropic", model: "claude-opus-4-8" }))
      .toBe("anthropic/claude-opus-4-8");
  });
});

describe("normalizeRouting", () => {
  test("applies defaults when unset", () => {
    expect(normalizeRouting(undefined)).toEqual({ threshold: 90, maxHops: 3 });
  });
  test("clamps threshold to 0..100 and maxHops to >=1", () => {
    expect(normalizeRouting({ threshold: 250, maxHops: 0 })).toEqual({ threshold: 100, maxHops: 1 });
    expect(normalizeRouting({ threshold: -5, maxHops: 9 })).toEqual({ threshold: 0, maxHops: 9 });
  });
  test("falls back to defaults on non-finite", () => {
    expect(normalizeRouting({ threshold: NaN, maxHops: Infinity }))
      .toEqual({ threshold: DEFAULT_ROUTE_THRESHOLD, maxHops: DEFAULT_ROUTE_MAX_HOPS });
  });
});

describe("chainForModel", () => {
  const routing = {
    chains: {
      "claude-opus-4-8": [
        { provider: "anthropic", model: "claude-opus-4-8" },
        { provider: "xai", model: "grok-4.5" },
      ],
      "empty": [],
    },
  };
  test("returns the ordered chain for a known id", () => {
    expect(chainForModel(routing, "claude-opus-4-8")).toEqual([
      { provider: "anthropic", model: "claude-opus-4-8" },
      { provider: "xai", model: "grok-4.5" },
    ]);
  });
  test("returns null when routing is absent", () => {
    expect(chainForModel(undefined, "claude-opus-4-8")).toBeNull();
  });
  test("returns null for an unknown id", () => {
    expect(chainForModel(routing, "claude-haiku-4-5")).toBeNull();
  });
  test("returns null for an empty or invalid chain", () => {
    expect(chainForModel(routing, "empty")).toBeNull();
  });
});
