/**
 * `ocx codex [--account <id|email|main>] [codex args...]` — launch Codex wired to the local proxy.
 *
 * Stock Codex cannot set arbitrary headers on Design B (`openai_base_url` + built-in `openai`
 * provider; user overrides of that provider are discarded). When `--account` is set we:
 *   1. Set `OCX_CODEX_ACCOUNT` for Codex `env_http_headers`
 *   2. Pass `-c` overrides that select a custom `opencodex` provider carrying the pin mapping
 */
import { spawn } from "node:child_process";
import { loadConfig } from "../config";
import {
  CODEX_ACCOUNT_PIN_ENV,
  CODEX_ACCOUNT_PIN_HEADER,
} from "../codex/auth-context";
import { codexExecInvocation } from "../codex/exec-invocation";
import { MAIN_CODEX_ACCOUNT_ID } from "../codex/main-account";
import { providerBaseHost, shouldInjectApiAuthHeader } from "../codex/inject";
import { findLiveProxy } from "../server/proxy-liveness";
import type { OcxConfig } from "../types";

const CODEX_INSTALL_HINT =
  "Codex CLI not found. Install with: npm i -g @openai/codex  (or see https://github.com/openai/codex)";

export type CodexLaunchParse = {
  accountRaw: string | null;
  codexArgs: string[];
};

/** Strip `--account` / `--account=` from the argv forwarded to Codex. */
export function parseCodexLauncherArgs(args: string[]): CodexLaunchParse {
  const codexArgs: string[] = [];
  let accountRaw: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--account") {
      const value = args[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("Usage: ocx codex --account <id|email|main> [codex args...]");
      }
      accountRaw = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("--account=")) {
      const value = arg.slice("--account=".length).trim();
      if (!value) throw new Error("Usage: ocx codex --account <id|email|main> [codex args...]");
      accountRaw = value;
      continue;
    }
    codexArgs.push(arg);
  }
  return { accountRaw, codexArgs };
}

/**
 * Resolve `--account` to the pin header value (`main` or pool id).
 * Accepts pool id, email (case-insensitive), `main`, or the internal `__main__` id.
 */
export function resolveCodexAccountPin(
  config: OcxConfig,
  raw: string,
): { ok: true; pin: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Account pin is empty" };
  if (trimmed === "main" || trimmed === MAIN_CODEX_ACCOUNT_ID) return { ok: true, pin: "main" };

  const accounts = config.codexAccounts ?? [];
  const byId = accounts.find(account => !account.isMain && account.id === trimmed);
  if (byId) return { ok: true, pin: byId.id };

  const needle = trimmed.toLowerCase();
  const byEmail = accounts.filter(
    account => !account.isMain && (account.email ?? "").toLowerCase() === needle,
  );
  if (byEmail.length === 1) return { ok: true, pin: byEmail[0].id };
  if (byEmail.length > 1) {
    return { ok: false, error: `Ambiguous email matches multiple pool accounts: ${trimmed}` };
  }

  return {
    ok: false,
    error: `Unknown Codex account '${trimmed}'. Use 'main', a pool id from 'ocx account list openai', or that account's email.`,
  };
}

/** `-c` overrides so Design B sessions can send the pin header (built-in openai cannot). */
export function buildCodexAccountPinConfigOverrides(
  port: number,
  config: Pick<OcxConfig, "hostname">,
): string[] {
  const host = providerBaseHost(config.hostname);
  const baseUrl = `http://${host}:${port}/v1`;
  const headerEntries = shouldInjectApiAuthHeader(config)
    ? `{ "x-opencodex-api-key" = "OPENCODEX_API_AUTH_TOKEN", "${CODEX_ACCOUNT_PIN_HEADER}" = "${CODEX_ACCOUNT_PIN_ENV}" }`
    : `{ "${CODEX_ACCOUNT_PIN_HEADER}" = "${CODEX_ACCOUNT_PIN_ENV}" }`;
  return [
    'model_provider="opencodex"',
    'model_providers.opencodex.name="OpenCodex Proxy"',
    `model_providers.opencodex.base_url=${JSON.stringify(baseUrl)}`,
    'model_providers.opencodex.wire_api="responses"',
    "model_providers.opencodex.requires_openai_auth=true",
    `model_providers.opencodex.env_http_headers=${headerEntries}`,
  ];
}

export function buildCodexLaunchEnv(
  base: NodeJS.ProcessEnv,
  pin: string | null,
): NodeJS.ProcessEnv {
  const env = { ...base };
  if (pin) env[CODEX_ACCOUNT_PIN_ENV] = pin;
  else delete env[CODEX_ACCOUNT_PIN_ENV];
  return env;
}

async function ensureProxyForCodex(): Promise<number | null> {
  const live = await findLiveProxy();
  if (live) return live.port;
  const cfgPort = loadConfig().port;
  const pinPort = typeof cfgPort === "number" && cfgPort > 0 ? cfgPort : 10100;
  const child = spawn(process.execPath, [process.argv[1] ?? "ocx", "start", "--port", String(pinPort)], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, OCX_SERVICE: "1" },
  });
  child.unref();
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const started = await findLiveProxy();
    if (started) return started.port;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return null;
}

export async function cmdCodex(args: string[]): Promise<number> {
  let parsed: CodexLaunchParse;
  try {
    parsed = parseCodexLauncherArgs(args);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const config = loadConfig();
  let pin: string | null = null;
  if (parsed.accountRaw !== null) {
    const resolved = resolveCodexAccountPin(config, parsed.accountRaw);
    if (!resolved.ok) {
      console.error(resolved.error);
      return 1;
    }
    pin = resolved.pin;
  }

  const port = await ensureProxyForCodex();
  if (!port) {
    console.error("❌ Proxy did not become healthy. Start it with 'ocx start' or 'ocx ensure'.");
    return 1;
  }

  const env = buildCodexLaunchEnv(process.env, pin);
  const codexArgs = [...parsed.codexArgs];
  if (pin) {
    for (const override of buildCodexAccountPinConfigOverrides(port, config)) {
      codexArgs.unshift(override);
      codexArgs.unshift("-c");
    }
  }

  return await new Promise<number>((resolve) => {
    const inv = codexExecInvocation("codex", codexArgs);
    const child = spawn(inv.file, inv.args, { stdio: "inherit", env, ...inv.options });
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") console.error(CODEX_INSTALL_HINT);
      else console.error(`❌ Failed to launch codex: ${err.message}`);
      resolve(1);
    });
    child.on("exit", (code, signal) => {
      resolve(signal ? 1 : code ?? 0);
    });
  });
}
