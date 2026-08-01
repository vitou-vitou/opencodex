import { describe, expect, test } from "bun:test";
import {
  parseArenaTextLeaderboard,
  matchCatalogToArena,
  buildArenaFamilyChains,
  isArenaSnapshotStale,
  buildArenaSnapshotFromText,
  arenaNameMatchScore,
} from "../src/claude/arena-rank";

const FIXTURE = `
| Rank | Rank Spread | Model | Score | Votes |
| --- | --- | --- | --- | --- |
| 1 | 13 | Anthropic claude-fable-5 Anthropic · Proprietary | 1509±6 | 100 |
| 5 | 415 | Anthropic claude-opus-4-8 Anthropic · Proprietary | 1475±5 | 100 |
| 10 | 518 | Anthropic claude-sonnet-4-6 Anthropic · Proprietary | 1472±4 | 100 |
| 20 | 1238 | grok-4.5 SpaceXAI · Proprietary | 1469±6 | 100 |
| 30 | 1745 | glm-5 Z.ai · MIT | 1457±4 | 100 |
| 40 | 4163 | Anthropic claude-sonnet-4-5-20250929 Anthropic · Proprietary | 1455±3 | 100 |
| 50 | 5378 | deepseek-v3.2 DeepSeek · MIT | 1425±4 | 100 |
| 60 | 86114 | Anthropic claude-haiku-4-5-20251001 Anthropic · Proprietary | 1412±3 | 100 |
| 70 | 138162 | minimax-m2.5 MiniMax · Modified MIT | 1390±4 | 100 |
`;

describe("parseArenaTextLeaderboard", () => {
  test("extracts rank score and slug", () => {
    const rows = parseArenaTextLeaderboard(FIXTURE);
    expect(rows[0]).toMatchObject({ rank: 1, score: 1509, slug: "claude-fable-5" });
    expect(rows.find(r => r.slug.includes("grok-4.5"))?.rank).toBe(20);
  });
});

describe("arenaNameMatchScore", () => {
  const rows = parseArenaTextLeaderboard(FIXTURE);
  test("matches dotted kiro ids to dashed arena names", () => {
    const opus = rows.find(r => r.slug.includes("opus-4-8"))!;
    expect(arenaNameMatchScore("claude-opus-4.8", opus)).toBeGreaterThanOrEqual(65);
  });
  test("matches deepseek-3.2 to deepseek-v3.2", () => {
    const ds = rows.find(r => r.slug.includes("deepseek"))!;
    expect(arenaNameMatchScore("deepseek-3.2", ds)).toBeGreaterThanOrEqual(80);
  });
});

describe("match + family chains", () => {
  const rows = parseArenaTextLeaderboard(FIXTURE);
  const catalog = [
    { provider: "anthropic", id: "claude-fable-5" },
    { provider: "github-copilot", id: "claude-fable-5" },
    { provider: "anthropic", id: "claude-opus-4-8" },
    { provider: "xai", id: "grok-4.5" },
    { provider: "kiro", id: "glm-5" },
    { provider: "kiro", id: "claude-sonnet-4.5" },
    { provider: "anthropic", id: "claude-sonnet-4-6" },
    { provider: "kiro", id: "deepseek-3.2" },
    { provider: "kiro", id: "claude-haiku-4.5" },
    { provider: "kiro", id: "minimax-m2.5" },
  ];

  test("dedupes fable to anthropic over copilot", () => {
    const matched = matchCatalogToArena(catalog, rows);
    const fable = matched.find(m => m.model.includes("fable"));
    expect(fable?.provider).toBe("anthropic");
  });

  test("family chains follow arena order within family", () => {
    const matched = matchCatalogToArena(catalog, rows);
    const chains = buildArenaFamilyChains(matched);
    expect(chains.fable[0]).toEqual({ provider: "anthropic", model: "claude-fable-5" });
    expect(chains.opus[0]).toEqual({ provider: "anthropic", model: "claude-opus-4-8" });
    expect(chains.sonnet[0]).toEqual({ provider: "anthropic", model: "claude-sonnet-4-6" });
    expect(chains.haiku.map(c => c.model)).toContain("deepseek-3.2");
    expect(chains.haiku.length).toBeLessThanOrEqual(3);
  });

  test("buildArenaSnapshotFromText sets metadata", () => {
    const snap = buildArenaSnapshotFromText(FIXTURE, catalog, "fixture", new Date("2026-08-01T00:00:00Z"));
    expect(snap.fetchedAt).toBe("2026-08-01T00:00:00.000Z");
    expect(snap.matchedCount).toBeGreaterThan(0);
    expect(snap.chains.opus.length).toBeGreaterThan(0);
  });
});

describe("isArenaSnapshotStale", () => {
  test("missing snapshot is stale", () => {
    expect(isArenaSnapshotStale(undefined, 168)).toBe(true);
  });
  test("respects max age hours", () => {
    const snap = {
      fetchedAt: "2026-08-01T00:00:00.000Z",
      source: "x",
      chains: { opus: [], sonnet: [], haiku: [], fable: [] },
      matchedCount: 0,
    };
    const t0 = Date.parse("2026-08-01T00:00:00.000Z");
    expect(isArenaSnapshotStale(snap, 168, t0 + 24 * 3600_000)).toBe(false);
    expect(isArenaSnapshotStale(snap, 168, t0 + 169 * 3600_000)).toBe(true);
  });
});
