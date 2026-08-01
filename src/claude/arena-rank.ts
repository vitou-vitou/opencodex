import type { OcxClaudeDesktopFamily, OcxClaudeRouteCandidate } from "../types";
import { DESKTOP_FAMILIES } from "./desktop-profile";

export const ARENA_TEXT_LEADERBOARD_URL = "https://arena.ai/leaderboard/text";
export const DEFAULT_ARENA_MAX_AGE_HOURS = 168;
export const ARENA_FETCH_TIMEOUT_MS = 15_000;
export const ARENA_FAMILY_CHAIN_CAP = 3;
/** Minimum name-match confidence to accept a catalog route. */
export const ARENA_MATCH_MIN_SCORE = 50;

export interface ArenaLeaderboardRow {
  rank: number;
  score: number;
  name: string;
  slug: string;
}

export interface CatalogModelRef {
  provider: string;
  id: string;
}

export interface ArenaMatchedRoute {
  provider: string;
  model: string;
  route: string;
  arenaRank: number;
  arenaScore: number;
  matchScore: number;
}

export type ArenaFamilyChains = Record<OcxClaudeDesktopFamily, OcxClaudeRouteCandidate[]>;

export interface OcxArenaSnapshot {
  fetchedAt: string;
  source: string;
  chains: ArenaFamilyChains;
  matchedCount: number;
}

const LAB_SUFFIX =
  /\s+(Anthropic|OpenAI|Google|SpaceXAI|Moonshot|Alibaba|Z\.ai|DeepSeek|MiniMax|Meta|Baidu|Xiaomi|Tencent|Bytedance)\b.*$/i;

const PROVIDER_PREF = ["anthropic", "github-copilot", "xai", "kiro", "kimi", "google-antigravity", "openai"] as const;

/**
 * Parse arena.ai text leaderboard markdown/HTML table rows.
 * Accepts lines shaped like: `| 33 | 1747 | grok-4.5 SpaceXAI · Proprietary | 1469±6 | ...`
 */
export function parseArenaTextLeaderboard(text: string): ArenaLeaderboardRow[] {
  const rows: ArenaLeaderboardRow[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\|\s*(\d+)\s*\|\s*[^|]*\|\s*([^|]+?)\s*\|\s*([\d.]+)±/);
    if (!m) continue;
    const rank = Number(m[1]);
    const score = Number(m[3]);
    if (!Number.isFinite(rank) || !Number.isFinite(score)) continue;
    const raw = m[2]!.trim();
    const name = raw.replace(LAB_SUFFIX, "").trim();
    if (!name) continue;
    const slug = name
      .toLowerCase()
      .replace(/^anthropic\s+/i, "")
      .replace(/^openai\s+/i, "")
      .replace(/\s+/g, "-");
    rows.push({ rank, score, name, slug });
  }
  return rows;
}

export function normalizeModelId(id: string): string {
  return id
    .toLowerCase()
    .replace(/\[1m\]$/i, "")
    .replace(/-\d{8}$/, "")
    .replace(/_/g, "-");
}

export function arenaNameMatchScore(modelId: string, arena: ArenaLeaderboardRow): number {
  const id = normalizeModelId(modelId);
  const slug = arena.slug;
  if (id === slug) return 100;
  const arenaBase = slug.replace(/-thinking.*$/, "").replace(/-(high|max|xhigh)$/, "");
  if (id === arenaBase) return 90;
  const idDot = id.replace(/(\d)\.(\d)/g, "$1-$2");
  const slugDot = slug.replace(/(\d)\.(\d)/g, "$1-$2");
  if (idDot === slugDot) return 95;
  if (slugDot.startsWith(idDot) || idDot.startsWith(slugDot.replace(/-thinking.*$/, ""))) return 65;
  if (slug.startsWith(`${id}-`) || id.startsWith(`${slug}-`)) return 70;
  if (slug.includes(id) && id.length >= 8) return 50;
  // deepseek-3.2 ↔ deepseek-v3.2
  const idDs = id.replace(/^deepseek-(\d)/, "deepseek-v$1");
  if (idDs === arenaBase || idDs === slugDot.replace(/-thinking.*$/, "")) return 85;
  if (slug.replace(/deepseek-v/, "deepseek-").startsWith(id)) return 80;
  const idCompact = id.replace(/-beta/g, "").replace(/-/g, "");
  const slugCompact = slug.replace(/-beta/g, "").replace(/-/g, "");
  if (idCompact.length >= 10 && slugCompact.includes(idCompact)) return 60;
  return 0;
}

function providerPrefIndex(provider: string): number {
  const i = (PROVIDER_PREF as readonly string[]).indexOf(provider);
  return i >= 0 ? i : PROVIDER_PREF.length;
}

/** Best arena row for a catalog model id, or null below confidence threshold. */
export function bestArenaMatch(
  modelId: string,
  rows: readonly ArenaLeaderboardRow[],
  minScore = ARENA_MATCH_MIN_SCORE,
): (ArenaLeaderboardRow & { matchScore: number }) | null {
  let best: (ArenaLeaderboardRow & { matchScore: number }) | null = null;
  for (const row of rows) {
    const matchScore = arenaNameMatchScore(modelId, row);
    if (matchScore < minScore) continue;
    if (
      !best
      || matchScore > best.matchScore
      || (matchScore === best.matchScore && row.rank < best.rank)
    ) {
      best = { ...row, matchScore };
    }
  }
  return best;
}

/**
 * Match catalog models to arena rows. Same logical model on multiple providers keeps
 * the best Elo; Elo ties prefer anthropic → github-copilot → … (stable).
 */
export function matchCatalogToArena(
  catalog: readonly CatalogModelRef[],
  rows: readonly ArenaLeaderboardRow[],
): ArenaMatchedRoute[] {
  const byLogic = new Map<string, ArenaMatchedRoute>();
  for (const m of catalog) {
    const hit = bestArenaMatch(m.id, rows);
    if (!hit) continue;
    const logic = normalizeModelId(m.id).replace(/(\d)\.(\d)/g, "$1-$2");
    const candidate: ArenaMatchedRoute = {
      provider: m.provider,
      model: m.id,
      route: `${m.provider}/${m.id}`,
      arenaRank: hit.rank,
      arenaScore: hit.score,
      matchScore: hit.matchScore,
    };
    const prev = byLogic.get(logic);
    if (!prev) {
      byLogic.set(logic, candidate);
      continue;
    }
    if (candidate.arenaRank < prev.arenaRank) {
      byLogic.set(logic, candidate);
      continue;
    }
    if (
      candidate.arenaRank === prev.arenaRank
      && providerPrefIndex(candidate.provider) < providerPrefIndex(prev.provider)
    ) {
      byLogic.set(logic, candidate);
    }
  }
  return [...byLogic.values()].sort(
    (a, b) => a.arenaRank - b.arenaRank || a.route.localeCompare(b.route),
  );
}

const FABLE_RE = /fable/i;
const OPUS_RE = /opus/i;
const SONNET_RE = /sonnet/i;
const HAIKU_RE = /haiku|flash|mini|deepseek|minimax|m2\.|m2-/i;
const LIGHT_EXCLUDE_FROM_OPUS = /haiku|flash|mini|minimax|m2\.|m2-|deepseek/i;

function takeTop(
  matched: readonly ArenaMatchedRoute[],
  pred: (m: ArenaMatchedRoute) => boolean,
  cap = ARENA_FAMILY_CHAIN_CAP,
): OcxClaudeRouteCandidate[] {
  const out: OcxClaudeRouteCandidate[] = [];
  const seen = new Set<string>();
  for (const m of matched) {
    if (!pred(m)) continue;
    const key = `${m.provider}/${m.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ provider: m.provider, model: m.model });
    if (out.length >= cap) break;
  }
  return out;
}

/** Build Desktop family chains from arena-matched catalog routes. */
export function buildArenaFamilyChains(
  matched: readonly ArenaMatchedRoute[],
): ArenaFamilyChains {
  const fable = takeTop(matched, m => FABLE_RE.test(m.model));
  const opusNamed = takeTop(matched, m => OPUS_RE.test(m.model));
  const sonnetNamed = takeTop(matched, m => SONNET_RE.test(m.model));
  const haiku = takeTop(matched, m => HAIKU_RE.test(m.model));

  const opus = opusNamed.length > 0
    ? opusNamed
    : takeTop(matched, m => !LIGHT_EXCLUDE_FROM_OPUS.test(m.model) && !FABLE_RE.test(m.model));

  const sonnet = sonnetNamed.length > 0
    ? sonnetNamed
    : takeTop(matched, m => !FABLE_RE.test(m.model) && !OPUS_RE.test(m.model));

  const fableFinal = fable.length > 0 ? fable : takeTop(matched, () => true);

  const empty = (): OcxClaudeRouteCandidate[] => [];
  const chains = {
    fable: fableFinal.length > 0 ? fableFinal : empty(),
    opus: opus.length > 0 ? opus : empty(),
    sonnet: sonnet.length > 0 ? sonnet : empty(),
    haiku: haiku.length > 0 ? haiku : empty(),
  } as ArenaFamilyChains;

  // Guarantee each family has at least one candidate when any matches exist.
  const top = takeTop(matched, () => true, 1);
  for (const family of DESKTOP_FAMILIES) {
    if (chains[family].length === 0 && top.length > 0) {
      chains[family] = top.map(c => ({ ...c }));
    }
  }
  return chains;
}

export function isArenaSnapshotStale(
  snapshot: OcxArenaSnapshot | undefined,
  maxAgeHours: number,
  nowMs = Date.now(),
): boolean {
  if (!snapshot?.fetchedAt) return true;
  const fetched = Date.parse(snapshot.fetchedAt);
  if (!Number.isFinite(fetched)) return true;
  const maxMs = Math.max(0, maxAgeHours) * 3600_000;
  return nowMs - fetched > maxMs;
}

export function arenaMaxAgeHours(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_ARENA_MAX_AGE_HOURS;
  return Math.max(1, Math.min(24 * 90, Math.trunc(value)));
}

/** Fetch arena text leaderboard HTML/markdown body. */
export async function fetchArenaTextLeaderboard(
  fetchImpl: typeof fetch = fetch,
  url = ARENA_TEXT_LEADERBOARD_URL,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ARENA_FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: ctrl.signal,
      headers: { accept: "text/html,text/markdown,*/*" },
    });
    if (!res.ok) throw new Error(`arena fetch HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export function buildArenaSnapshotFromText(
  text: string,
  catalog: readonly CatalogModelRef[],
  source = ARENA_TEXT_LEADERBOARD_URL,
  now = new Date(),
): OcxArenaSnapshot {
  const rows = parseArenaTextLeaderboard(text);
  if (rows.length === 0) throw new Error("arena leaderboard parse produced zero rows");
  const matched = matchCatalogToArena(catalog, rows);
  if (matched.length === 0) throw new Error("arena leaderboard matched zero catalog models");
  return {
    fetchedAt: now.toISOString(),
    source,
    chains: buildArenaFamilyChains(matched),
    matchedCount: matched.length,
  };
}
