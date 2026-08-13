/**
 * Persist Claude Code IDE proxy env into ~/.claude/settings.json and (when present)
 * Cursor User settings (`claudeCode.environmentVariables`).
 *
 * Cursor IDE Claude Code chat does not inherit `ocx claude` process env — it reads
 * these stores. Token policy mirrors `buildClaudeEnv` / manual-env guidance.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { atomicWriteFile } from "../config";
import type { OcxConfig } from "../types";
import { PROXY_MARKER, defaultAuthDetectDeps, detectClaudeAuth, ownAdmissionTokens } from "./auth-detect";
import { resolveClaudeAuthMode } from "./auth-mode";
import { effectiveModelEnv, resolveAutoContext } from "./context-windows";
import { claudeConfigDir } from "./gateway-cache";

/** Keys opencodex owns in Claude/Cursor IDE env stores (safe to revert). */
export const IDE_MANAGED_ENV_KEYS = [
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY",
  "CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST",
  "CLAUDE_CODE_AUTO_COMPACT_WINDOW",
  "CLAUDE_CODE_ALWAYS_ENABLE_EFFORT",
  "CLAUDE_CODE_MAX_CONTEXT_TOKENS",
  "DISABLE_COMPACT",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_FABLE_MODEL",
  "ANTHROPIC_SMALL_FAST_MODEL",
] as const;

export type IdeManagedEnvKey = (typeof IDE_MANAGED_ENV_KEYS)[number];

export interface IdeClaudeEnvBuildInput {
  config: OcxConfig;
  port: number;
  contextWindows?: Record<string, number>;
  /** Process env used only for auth detection (not copied into settings). */
  detectEnv?: NodeJS.ProcessEnv;
}

/** Build the env map that IDE Claude Code should receive. */
export function buildIdeClaudeEnv(input: IdeClaudeEnvBuildInput): Record<string, string> {
  const { config, port, contextWindows = {} } = input;
  const detectEnv = input.detectEnv ?? process.env;
  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
  };

  if ((config.apiKeys?.length ?? 0) > 0) {
    const key = config.apiKeys![0]?.key?.trim();
    if (key) env.ANTHROPIC_AUTH_TOKEN = key;
  }

  const resolved = resolveClaudeAuthMode(config, detectClaudeAuth({
    ...defaultAuthDetectDeps(detectEnv),
    env: () => detectEnv,
    ownTokens: ownAdmissionTokens(config),
  }));
  if (!env.ANTHROPIC_AUTH_TOKEN && resolved.markerMode === "proxy") {
    env.ANTHROPIC_AUTH_TOKEN = PROXY_MARKER;
  }
  if (env.ANTHROPIC_AUTH_TOKEN) {
    env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST = "1";
  }

  if (config.claudeCode?.alwaysEnableEffort === true) {
    env.CLAUDE_CODE_ALWAYS_ENABLE_EFFORT = "1";
  }
  const maxCtx = config.claudeCode?.maxContextTokens;
  if (typeof maxCtx === "number" && Number.isFinite(maxCtx) && maxCtx > 0) {
    env.CLAUDE_CODE_MAX_CONTEXT_TOKENS = String(Math.floor(maxCtx));
    env.DISABLE_COMPACT = "1";
  }
  const auto = resolveAutoContext(config.claudeCode);
  if (auto.enabled) {
    env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = String(auto.compactWindow);
  }
  for (const [name, value] of Object.entries(effectiveModelEnv(config.claudeCode, contextWindows, auto))) {
    if (value) env[name] = value;
  }
  return env;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return isPlainRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mergeManagedEnv(
  existing: Record<string, unknown> | undefined,
  managed: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = {};
  if (existing) {
    for (const [key, value] of Object.entries(existing)) {
      if (typeof value === "string" && !(IDE_MANAGED_ENV_KEYS as readonly string[]).includes(key)) {
        next[key] = value;
      }
    }
  }
  for (const key of IDE_MANAGED_ENV_KEYS) {
    // Drop previously managed keys, then re-add only those in this apply payload.
    delete next[key];
  }
  Object.assign(next, managed);
  return next;
}

function stripManagedEnv(existing: Record<string, unknown> | undefined): Record<string, string> {
  const next: Record<string, string> = {};
  if (!existing) return next;
  for (const [key, value] of Object.entries(existing)) {
    if (typeof value !== "string") continue;
    if ((IDE_MANAGED_ENV_KEYS as readonly string[]).includes(key)) continue;
    next[key] = value;
  }
  return next;
}

export function claudeSettingsPath(configDir = claudeConfigDir()): string {
  return join(configDir, "settings.json");
}

/** Cursor User settings.json (Windows APPDATA / macOS Application Support / Linux .config). */
export function cursorUserSettingsPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
): string {
  if (platform === "win32") {
    const appData = env.APPDATA?.trim() || join(home, "AppData", "Roaming");
    return join(appData, "Cursor", "User", "settings.json");
  }
  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "Cursor", "User", "settings.json");
  }
  const xdg = env.XDG_CONFIG_HOME?.trim() || join(home, ".config");
  return join(xdg, "Cursor", "User", "settings.json");
}

export interface IdeApplyOptions {
  config: OcxConfig;
  port: number;
  contextWindows?: Record<string, number>;
  claudeHomePath?: string;
  cursorSettingsPath?: string;
  /** Write Claude home env (default true). */
  claudeHome?: boolean;
  /** Write Cursor settings when the file's parent exists or file exists (default true). */
  cursor?: boolean;
  writer?: (path: string, content: string) => void;
}

export interface IdeApplyResult {
  env: Record<string, string>;
  claudeHomePath?: string;
  cursorSettingsPath?: string;
  claudeHomeWritten: boolean;
  cursorWritten: boolean;
  warnings: string[];
}

function writeJson(path: string, data: Record<string, unknown>, writer: (path: string, content: string) => void) {
  mkdirSync(dirname(path), { recursive: true });
  writer(path, `${JSON.stringify(data, null, 2)}\n`);
}

function clearStaleProxyModel(settings: Record<string, unknown>, warnings: string[]): void {
  const model = settings.model;
  if (typeof model !== "string" || model.length === 0) return;
  // Known dead alias after anthropic-apikey provider removal (and similar).
  if (/anthropic-apikey/i.test(model) || /claude-ocx-anthropic-apikey/i.test(model)) {
    delete settings.model;
    warnings.push(`Cleared stale settings.model (${model}) — pick a model in Claude Code /model`);
  }
}

function toCursorEnvArray(env: Record<string, string>): Array<{ name: string; value: string }> {
  return Object.entries(env).map(([name, value]) => ({ name, value }));
}

function fromCursorEnvArray(value: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!Array.isArray(value)) return out;
  for (const entry of value) {
    if (!isPlainRecord(entry)) continue;
    const name = entry.name;
    const val = entry.value;
    if (typeof name === "string" && name.length > 0 && typeof val === "string") out[name] = val;
  }
  return out;
}

function mergeCursorEnvArray(
  existing: unknown,
  managed: Record<string, string>,
): Array<{ name: string; value: string }> {
  const merged = mergeManagedEnv(fromCursorEnvArray(existing), managed);
  return toCursorEnvArray(merged);
}

function stripCursorEnvArray(existing: unknown): Array<{ name: string; value: string }> | undefined {
  const stripped = stripManagedEnv(fromCursorEnvArray(existing));
  const entries = toCursorEnvArray(stripped);
  return entries.length > 0 ? entries : undefined;
}

export function applyIdeClaudeEnv(options: IdeApplyOptions): IdeApplyResult {
  const writer = options.writer ?? atomicWriteFile;
  const writeClaudeHome = options.claudeHome !== false;
  const writeCursor = options.cursor !== false;
  const env = buildIdeClaudeEnv({
    config: options.config,
    port: options.port,
    contextWindows: options.contextWindows,
  });
  const warnings: string[] = [];
  const result: IdeApplyResult = {
    env,
    claudeHomeWritten: false,
    cursorWritten: false,
    warnings,
  };

  if (writeClaudeHome) {
    const path = options.claudeHomePath ?? claudeSettingsPath();
    result.claudeHomePath = path;
    const settings = readJsonObject(path);
    clearStaleProxyModel(settings, warnings);
    const existingEnv = isPlainRecord(settings.env) ? settings.env : undefined;
    settings.env = mergeManagedEnv(existingEnv, env);
    writeJson(path, settings, writer);
    result.claudeHomeWritten = true;
  }

  if (writeCursor) {
    const path = options.cursorSettingsPath ?? cursorUserSettingsPath();
    result.cursorSettingsPath = path;
    const parent = dirname(path);
    // Only write when Cursor User dir already exists (user has Cursor installed).
    if (existsSync(path) || existsSync(parent)) {
      const settings = readJsonObject(path);
      settings["claudeCode.environmentVariables"] = mergeCursorEnvArray(
        settings["claudeCode.environmentVariables"],
        env,
      );
      writeJson(path, settings, writer);
      result.cursorWritten = true;
    } else {
      warnings.push(`Cursor User settings not found (${path}) — skipped Cursor write`);
    }
  }

  return result;
}

export function revertIdeClaudeEnv(options: {
  claudeHomePath?: string;
  cursorSettingsPath?: string;
  claudeHome?: boolean;
  cursor?: boolean;
  writer?: (path: string, content: string) => void;
}): { claudeHomePath?: string; cursorSettingsPath?: string; claudeHomeWritten: boolean; cursorWritten: boolean } {
  const writer = options.writer ?? atomicWriteFile;
  const writeClaudeHome = options.claudeHome !== false;
  const writeCursor = options.cursor !== false;
  const out = { claudeHomeWritten: false, cursorWritten: false } as {
    claudeHomePath?: string;
    cursorSettingsPath?: string;
    claudeHomeWritten: boolean;
    cursorWritten: boolean;
  };

  if (writeClaudeHome) {
    const path = options.claudeHomePath ?? claudeSettingsPath();
    out.claudeHomePath = path;
    if (existsSync(path)) {
      const settings = readJsonObject(path);
      const stripped = stripManagedEnv(isPlainRecord(settings.env) ? settings.env : undefined);
      if (Object.keys(stripped).length > 0) settings.env = stripped;
      else delete settings.env;
      writeJson(path, settings, writer);
      out.claudeHomeWritten = true;
    }
  }

  if (writeCursor) {
    const path = options.cursorSettingsPath ?? cursorUserSettingsPath();
    out.cursorSettingsPath = path;
    if (existsSync(path)) {
      const settings = readJsonObject(path);
      const next = stripCursorEnvArray(settings["claudeCode.environmentVariables"]);
      if (next) settings["claudeCode.environmentVariables"] = next;
      else delete settings["claudeCode.environmentVariables"];
      writeJson(path, settings, writer);
      out.cursorWritten = true;
    }
  }

  return out;
}

export function readIdeClaudeEnvStatus(options: {
  claudeHomePath?: string;
  cursorSettingsPath?: string;
} = {}): {
  claudeHomePath: string;
  cursorSettingsPath: string;
  claudeHomeEnv: Record<string, string>;
  cursorEnv: Record<string, string>;
} {
  const claudeHomePath = options.claudeHomePath ?? claudeSettingsPath();
  const cursorSettingsPath = options.cursorSettingsPath ?? cursorUserSettingsPath();
  const home = readJsonObject(claudeHomePath);
  const cursor = readJsonObject(cursorSettingsPath);
  const homeEnvRaw = isPlainRecord(home.env) ? home.env : {};
  const claudeHomeEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(homeEnvRaw)) {
    if (typeof v === "string") claudeHomeEnv[k] = v;
  }
  const cursorEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(fromCursorEnvArray(cursor["claudeCode.environmentVariables"]))) {
    if (typeof v === "string") cursorEnv[k] = v;
  }
  return { claudeHomePath, cursorSettingsPath, claudeHomeEnv, cursorEnv };
}
