import { loadConfig, saveConfigPreservingClaudeCode } from "../config";
import { setRoutePin, getRoutePin } from "../claude/route-pin";
import { clearAllCooldowns, activeCooldowns } from "../claude/route-cooldowns";
import {
  normalizeRouting,
  ensureRecommendedFamilyChains,
  candidateKey,
  recommendedFamilyTemplate,
  persistArenaSnapshot,
  refreshArenaSnapshot,
  maybeStaleArenaRefresh,
} from "../claude/route-chains";
import { arenaMaxAgeHours, isArenaSnapshotStale, type CatalogModelRef } from "../claude/arena-rank";
import { DESKTOP_FAMILIES } from "../claude/desktop-profile";
import { fetchAllModels } from "../server/management-api";
import { filterCatalogVisibleModels } from "../codex/catalog";

export type RouteUseParse =
  | { action: "pin"; provider: string; hard: boolean }
  | { action: "auto" }
  | { error: string };

export function parseRouteUseArgs(args: string[]): RouteUseParse {
  const positional = args.filter(a => !a.startsWith("-"));
  const hard = args.includes("--hard");
  const first = positional[0];
  if (!first) return { error: "Usage: ocx claude use <provider|auto> [--hard]" };
  if (first === "auto") return { action: "auto" };
  return { action: "pin", provider: first, hard };
}

async function loadVisibleCatalog(config: ReturnType<typeof loadConfig>): Promise<CatalogModelRef[]> {
  const all = await fetchAllModels(config);
  return filterCatalogVisibleModels(all, config).map(m => ({ provider: m.provider, id: m.id }));
}

export async function handleClaudeRouteCommand(args: string[]): Promise<number> {
  const sub = args[0];
  const config = loadConfig();

  if (sub === "use") {
    const parsed = parseRouteUseArgs(args.slice(1));
    if ("error" in parsed) { console.error(parsed.error); return 1; }
    if (parsed.action === "auto") {
      setRoutePin(config, null);
      console.log("Route pin cleared — auto-failover active.");
      return 0;
    }
    if (!config.providers?.[parsed.provider]) {
      console.error(`Unknown provider '${parsed.provider}'. See 'ocx provider list'.`);
      return 1;
    }
    setRoutePin(config, { provider: parsed.provider, hard: parsed.hard });
    console.log(`Pinned Claude Code -> ${parsed.provider}${parsed.hard ? " (hard)" : " (soft)"}.`);
    return 0;
  }

  if (sub === "status") {
    const routing = config.claudeCode?.routing;
    const { threshold, maxHops } = normalizeRouting(routing);
    const pin = getRoutePin(config);
    console.log(`threshold=${threshold} maxHops=${maxHops} pin=${pin ? `${pin.provider}${pin.hard ? " (hard)" : ""}` : "none"}`);
    const snap = routing?.arenaSnapshot;
    const maxAge = arenaMaxAgeHours(routing?.arenaMaxAgeHours);
    if (snap?.fetchedAt) {
      const stale = isArenaSnapshotStale(snap as any, maxAge);
      console.log(`arenaSnapshot: fetchedAt=${snap.fetchedAt} matched=${snap.matchedCount ?? "?"} stale=${stale} maxAgeHours=${maxAge}`);
    } else {
      console.log(`arenaSnapshot: none (maxAgeHours=${maxAge})`);
    }
    console.log("chains:");
    for (const [id, chain] of Object.entries(routing?.chains ?? {})) {
      console.log(`  ${id}: ${chain.map(c => `${c.provider}/${c.model}`).join(" -> ")}`);
    }
    const cds = activeCooldowns();
    const keys = Object.keys(cds);
    console.log(keys.length ? `cooldowns:` : "cooldowns: none");
    for (const k of keys) {
      console.log(`  ${k}: ${cds[k]!.source} until ${new Date(cds[k]!.until).toISOString()}`);
    }
    return 0;
  }

  if (sub === "clear-cooldowns") {
    clearAllCooldowns();
    console.log("Cleared all Claude route cooldowns.");
    return 0;
  }

  if (sub === "refresh-arena") {
    const apply = args.includes("--apply");
    const replace = args.includes("--replace");
    const unknown = args.slice(1).filter(a => a !== "--apply" && a !== "--replace");
    if (unknown.length > 0) {
      console.error("Usage: ocx claude route refresh-arena [--apply] [--replace]");
      return 1;
    }
    if (replace && !apply) {
      console.error("--replace requires --apply");
      return 1;
    }
    let catalog: CatalogModelRef[];
    try {
      catalog = await loadVisibleCatalog(config);
    } catch (e) {
      console.error(`Failed to load catalog: ${e instanceof Error ? e.message : String(e)}`);
      return 1;
    }
    const result = await refreshArenaSnapshot(catalog);
    if (!result.ok) {
      console.error(`Arena refresh failed: ${result.error}`);
      return 1;
    }
    persistArenaSnapshot(config, result.snapshot);
    let mergeNote = "";
    if (apply) {
      const { added, replaced } = ensureRecommendedFamilyChains(config, replace);
      mergeNote = replace
        ? ` applied(--replace): ${[...added, ...replaced].join(", ") || "none"}`
        : ` applied: added=${added.join(",") || "none"}`;
    }
    saveConfigPreservingClaudeCode(config);
    console.log(`Arena snapshot saved: matched=${result.snapshot.matchedCount} at ${result.snapshot.fetchedAt}${mergeNote}`);
    const template = recommendedFamilyTemplate(config.claudeCode?.routing);
    for (const family of DESKTOP_FAMILIES) {
      console.log(`  ${family}: ${template[family].map(candidateKey).join(" -> ")}`);
    }
    return 0;
  }

  if (sub === "ensure-chains") {
    const replace = args.includes("--replace");
    const unknown = args.slice(1).filter(a => a !== "--replace");
    if (unknown.length > 0) {
      console.error("Usage: ocx claude route ensure-chains [--replace]");
      return 1;
    }
    try {
      const catalog = await loadVisibleCatalog(config);
      const stale = await maybeStaleArenaRefresh(config, catalog);
      if (stale.attempted && stale.updated) console.log("Arena snapshot refreshed (stale).");
      if (stale.attempted && !stale.updated && stale.error) {
        console.log(`Arena refresh skipped/failed (using cache/static): ${stale.error}`);
      }
    } catch {
      // Catalog load failure: continue with static/cached template.
    }
    const { added, replaced } = ensureRecommendedFamilyChains(config, replace);
    if (added.length === 0 && replaced.length === 0) {
      console.log("Recommended family chains already present (no changes).");
      console.log("Use --replace to overwrite family keys, or refresh-arena --apply --replace.");
      return 0;
    }
    saveConfigPreservingClaudeCode(config);
    if (replaced.length > 0) console.log(`Replaced family chains: ${replaced.join(", ")}`);
    if (added.length > 0) console.log(`Added recommended family chains: ${added.join(", ")}`);
    const template = recommendedFamilyTemplate(config.claudeCode?.routing);
    for (const family of DESKTOP_FAMILIES) {
      if (![...added, ...replaced].includes(family)) continue;
      console.log(`  ${family}: ${template[family].map(candidateKey).join(" -> ")}`);
    }
    return 0;
  }

  console.error("Usage: ocx claude route <use|status|clear-cooldowns|ensure-chains|refresh-arena>");
  return 1;
}
