import { loadConfig, saveConfigPreservingClaudeCode } from "../config";
import { setRoutePin, getRoutePin } from "../claude/route-pin";
import { clearAllCooldowns, activeCooldowns } from "../claude/route-cooldowns";
import {
  normalizeRouting,
  ensureRecommendedFamilyChains,
  candidateKey,
  RECOMMENDED_FAMILY_CHAINS,
} from "../claude/route-chains";
import { DESKTOP_FAMILIES } from "../claude/desktop-profile";

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

  if (sub === "ensure-chains") {
    const replace = args.includes("--replace");
    const unknown = args.slice(1).filter(a => a !== "--replace");
    if (unknown.length > 0) {
      console.error("Usage: ocx claude route ensure-chains [--replace]");
      return 1;
    }
    const { added, replaced } = ensureRecommendedFamilyChains(config, replace);
    if (added.length === 0 && replaced.length === 0) {
      console.log("Recommended family chains already present (no changes).");
      console.log("Use --replace to overwrite family keys with the arena-ranked template.");
      return 0;
    }
    saveConfigPreservingClaudeCode(config);
    if (replaced.length > 0) console.log(`Replaced family chains: ${replaced.join(", ")}`);
    if (added.length > 0) console.log(`Added recommended family chains: ${added.join(", ")}`);
    for (const family of DESKTOP_FAMILIES) {
      if (![...added, ...replaced].includes(family)) continue;
      const chain = RECOMMENDED_FAMILY_CHAINS[family];
      console.log(`  ${family}: ${chain.map(candidateKey).join(" -> ")}`);
    }
    return 0;
  }

  console.error("Usage: ocx claude route <use|status|clear-cooldowns|ensure-chains>");
  return 1;
}
