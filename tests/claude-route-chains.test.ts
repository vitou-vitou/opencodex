import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ROUTE_THRESHOLD,
  DEFAULT_ROUTE_MAX_HOPS,
  candidateKey,
  normalizeRouting,
  chainForModel,
  chainForRequest,
  resolveChainLookupIds,
  mergeRecommendedFamilyChains,
  ensureRecommendedFamilyChains,
  RECOMMENDED_FAMILY_CHAINS,
} from "../src/claude/route-chains";
import type { OcxConfig } from "../src/types";

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

describe("resolveChainLookupIds / chainForRequest", () => {
  const desktopAlias = "claude-opus-4-8-20260315";
  const profile = {
    version: 1 as const,
    assignments: {
      "kiro/claude-sonnet-4.5": { family: "sonnet" as const, alias: desktopAlias },
    },
    defaults: { opus: null, fable: null, sonnet: "kiro/claude-sonnet-4.5", haiku: null },
  };

  test("prefers Desktop family key before date-strip collapse", () => {
    const config = {
      port: 10100,
      defaultProvider: "openai",
      providers: {},
      claudeCode: { desktopProfile: profile },
    } as unknown as OcxConfig;
    expect(resolveChainLookupIds(desktopAlias, config)).toEqual([
      desktopAlias,
      "sonnet",
      "claude-opus-4-8",
    ]);
  });

  test("chainForRequest hits family chain for Desktop date alias", () => {
    const config = {
      port: 10100,
      defaultProvider: "openai",
      providers: { kiro: {}, xai: {} },
      claudeCode: {
        desktopProfile: profile,
        routing: {
          chains: {
            sonnet: RECOMMENDED_FAMILY_CHAINS.sonnet,
            "claude-opus-4-8": [
              { provider: "anthropic", model: "claude-opus-4-8" },
            ],
          },
        },
      },
    } as unknown as OcxConfig;
    // Family must win over date-stripped claude-opus-4-8 so Desktop sonnet traffic
    // does not inherit an opus-oriented chain.
    expect(chainForRequest(config.claudeCode?.routing, desktopAlias, config))
      .toEqual(RECOMMENDED_FAMILY_CHAINS.sonnet);
  });

  test("date-stripped Claude Code ids still resolve", () => {
    const config = {
      port: 10100,
      defaultProvider: "openai",
      providers: { anthropic: {} },
      claudeCode: {
        routing: {
          chains: {
            "claude-sonnet-4-5": [{ provider: "anthropic", model: "claude-sonnet-4-5" }],
          },
        },
      },
    } as unknown as OcxConfig;
    expect(chainForRequest(config.claudeCode?.routing, "claude-sonnet-4-5-20241022", config))
      .toEqual([{ provider: "anthropic", model: "claude-sonnet-4-5" }]);
  });
});

describe("mergeRecommendedFamilyChains", () => {
  test("fills missing family keys without overwriting", () => {
    const existing = [{ provider: "anthropic", model: "claude-opus-4-8" }];
    const { routing, added, replaced } = mergeRecommendedFamilyChains({
      chains: { opus: existing },
    });
    expect(added.sort()).toEqual(["fable", "haiku", "sonnet"]);
    expect(replaced).toEqual([]);
    expect(routing.chains!.opus).toEqual(existing);
    expect(routing.chains!.sonnet).toEqual(RECOMMENDED_FAMILY_CHAINS.sonnet);
    expect(routing.chains!.haiku).toEqual(RECOMMENDED_FAMILY_CHAINS.haiku);
    expect(routing.chains!.fable).toEqual(RECOMMENDED_FAMILY_CHAINS.fable);
  });

  test("replace overwrites family keys with arena-ranked template", () => {
    const { routing, added, replaced } = mergeRecommendedFamilyChains({
      chains: { opus: [{ provider: "kiro", model: "kiro-auto" }] },
    }, true);
    expect(added.sort()).toEqual(["fable", "haiku", "sonnet"]);
    expect(replaced).toEqual(["opus"]);
    expect(routing.chains!.opus).toEqual(RECOMMENDED_FAMILY_CHAINS.opus);
    expect(routing.chains!.opus[0]).toEqual({ provider: "xai", model: "grok-4.5" });
  });

  test("ensureRecommendedFamilyChains is a no-op when complete", () => {
    const config = {
      port: 10100,
      defaultProvider: "openai",
      providers: {},
      claudeCode: {
        routing: {
          chains: {
            opus: RECOMMENDED_FAMILY_CHAINS.opus,
            sonnet: RECOMMENDED_FAMILY_CHAINS.sonnet,
            haiku: RECOMMENDED_FAMILY_CHAINS.haiku,
            fable: RECOMMENDED_FAMILY_CHAINS.fable,
          },
        },
      },
    } as unknown as OcxConfig;
    expect(ensureRecommendedFamilyChains(config)).toEqual({ added: [], replaced: [] });
  });

  test("arena order: opus prefers higher Elo before lower", () => {
    const keys = RECOMMENDED_FAMILY_CHAINS.opus.map(c => `${c.provider}/${c.model}`);
    expect(keys).toEqual([
      "xai/grok-4.5",
      "kiro/glm-5",
      "kiro/claude-sonnet-4.5",
    ]);
  });
});
