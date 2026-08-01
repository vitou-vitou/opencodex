import { loadConfig } from "../config";
import { setRoutePin, getRoutePin } from "../claude/route-pin";
import { clearAllCooldowns, activeCooldowns } from "../claude/route-cooldowns";
import { normalizeRouting } from "../claude/route-chains";

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

  console.error("Usage: ocx claude route <use|status|clear-cooldowns>");
  return 1;
}
