/**
 * `ocx claude ide apply|show|revert` — wire Cursor / Claude Code IDE to the local proxy.
 */
import { loadConfig } from "../config";
import {
  applyIdeClaudeEnv,
  buildIdeClaudeEnv,
  readIdeClaudeEnvStatus,
  revertIdeClaudeEnv,
} from "../claude/ide-settings-env";
import { findLiveProxy } from "../server/proxy-liveness";

function printHelp(): void {
  console.log(`Usage:
  ocx claude ide apply [--claude-home-only|--cursor-only]
  ocx claude ide failover-default [--replace]
  ocx claude ide show [--json]
  ocx claude ide revert [--claude-home-only|--cursor-only]

Writes ANTHROPIC_BASE_URL (and related Claude Code gateway env) into:
  ~/.claude/settings.json  →  env
  Cursor User settings.json →  claudeCode.environmentVariables

failover-default: ensure ranked family chains, point Default/Opus tiers at the opus
chain head, mirror hop keys onto client ids, then refresh IDE env. Hops on failure only.`);
}

function takeTargets(argv: string[]): { claudeHome: boolean; cursor: boolean; rest: string[] } {
  const rest: string[] = [];
  let claudeHome = true;
  let cursor = true;
  let homeOnly = false;
  let cursorOnly = false;
  for (const arg of argv) {
    if (arg === "--claude-home-only") homeOnly = true;
    else if (arg === "--cursor-only") cursorOnly = true;
    else rest.push(arg);
  }
  if (homeOnly && cursorOnly) {
    throw new Error("Use only one of --claude-home-only / --cursor-only");
  }
  if (homeOnly) cursor = false;
  if (cursorOnly) claudeHome = false;
  return { claudeHome, cursor, rest };
}

function maskToken(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value === "opencodex-proxy") return value;
  if (value.length <= 12) return "***";
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function printEnv(env: Record<string, string>): void {
  for (const key of Object.keys(env).sort()) {
    const raw = env[key];
    const display = key.includes("TOKEN") || key.includes("KEY") ? maskToken(raw) : raw;
    console.log(`  ${key}=${display}`);
  }
}

export async function handleClaudeIdeCommand(argv: string[]): Promise<number> {
  const command = (argv[0] ?? "help").toLowerCase();
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  try {
    if (command === "show") {
      const wantsJson = argv.includes("--json");
      const status = readIdeClaudeEnvStatus();
      if (wantsJson) {
        console.log(JSON.stringify({
          ...status,
          claudeHomeEnv: {
            ...status.claudeHomeEnv,
            ...(status.claudeHomeEnv.ANTHROPIC_AUTH_TOKEN
              ? { ANTHROPIC_AUTH_TOKEN: maskToken(status.claudeHomeEnv.ANTHROPIC_AUTH_TOKEN) }
              : {}),
          },
          cursorEnv: {
            ...status.cursorEnv,
            ...(status.cursorEnv.ANTHROPIC_AUTH_TOKEN
              ? { ANTHROPIC_AUTH_TOKEN: maskToken(status.cursorEnv.ANTHROPIC_AUTH_TOKEN) }
              : {}),
          },
        }, null, 2));
        return 0;
      }
      console.log(`Claude home: ${status.claudeHomePath}`);
      printEnv(status.claudeHomeEnv);
      console.log(`Cursor: ${status.cursorSettingsPath}`);
      printEnv(status.cursorEnv);
      return 0;
    }

    if (command === "failover-default") {
      const replace = argv.includes("--replace");
      const rest = argv.slice(1).filter(a => a !== "--replace");
      if (rest.length > 0) {
        console.error(`Unknown args: ${rest.join(" ")}`);
        printHelp();
        return 1;
      }
      const config = loadConfig();
      if (config.claudeCode?.enabled === false) {
        console.error("Claude inbound is disabled (config.claudeCode.enabled=false). Enable it in the GUI first.");
        return 1;
      }
      const { applyFailoverDefault } = await import("../claude/failover-default");
      const result = await applyFailoverDefault(config, { replace });
      console.log("Failover Default applied.");
      if (result.added.length) console.log(`  chains added: ${result.added.join(", ")}`);
      if (result.replaced.length) console.log(`  chains replaced: ${result.replaced.join(", ")}`);
      for (const [family, alias] of Object.entries(result.heads)) {
        console.log(`  ${family} → ${alias}`);
      }
      if (result.opusAlias) {
        console.log(`  Default/Opus remaps → ${result.opusAlias}`);
      }
      if (result.ide?.claudeHomeWritten) console.log(`  Claude home env: ${result.ide.claudeHomePath}`);
      if (result.ide?.cursorWritten) console.log(`  Cursor IDE env: ${result.ide.cursorSettingsPath}`);
      for (const warning of result.ide?.warnings ?? []) console.error(`⚠ ${warning}`);
      console.log("Reload the Claude Code panel. Failover hops on failure only (not every 200).");
      return 0;
    }

    if (command === "apply") {
      const { claudeHome, cursor, rest } = takeTargets(argv.slice(1));
      if (rest.length > 0) {
        console.error(`Unknown args: ${rest.join(" ")}`);
        printHelp();
        return 1;
      }
      const config = loadConfig();
      if (config.claudeCode?.enabled === false) {
        console.error("Claude inbound is disabled (config.claudeCode.enabled=false). Enable it in the GUI first.");
        return 1;
      }
      const live = await findLiveProxy();
      const port = live?.port ?? config.port ?? 10100;
      if (!live) {
        console.error("⚠ Proxy is not running — wrote settings anyway. Start with: ocx start");
      }
      const planned = buildIdeClaudeEnv({ config, port });
      const result = applyIdeClaudeEnv({ config, port, claudeHome, cursor });
      if (result.claudeHomeWritten) console.log(`Claude home env applied: ${result.claudeHomePath}`);
      if (result.cursorWritten) console.log(`Cursor IDE env applied: ${result.cursorSettingsPath}`);
      if (!result.claudeHomeWritten && !result.cursorWritten) {
        console.error("Nothing written (check --claude-home-only / --cursor-only and that Cursor is installed).");
        return 1;
      }
      console.log("Env:");
      printEnv(planned);
      for (const warning of result.warnings) console.error(`⚠ ${warning}`);
      console.log("Reload the Claude Code panel in Cursor (or restart Cursor) to pick up the env.");
      return 0;
    }

    if (command === "revert") {
      const { claudeHome, cursor, rest } = takeTargets(argv.slice(1));
      if (rest.length > 0) {
        console.error(`Unknown args: ${rest.join(" ")}`);
        printHelp();
        return 1;
      }
      const result = revertIdeClaudeEnv({ claudeHome, cursor });
      if (result.claudeHomeWritten) console.log(`Claude home env reverted: ${result.claudeHomePath}`);
      if (result.cursorWritten) console.log(`Cursor IDE env reverted: ${result.cursorSettingsPath}`);
      if (!result.claudeHomeWritten && !result.cursorWritten) {
        console.log("Nothing to revert.");
      }
      return 0;
    }

    console.error(`Unknown ide command: ${command}`);
    printHelp();
    return 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
