import { spawn, type ChildProcess } from "node:child_process";
import type { OcxConfig } from "../types";

export type NgrokStatus = {
  enabled: boolean;
  running: boolean;
  publicUrl: string | null;
  /** All known public tunnel URLs (https preferred first). */
  publicUrls: string[];
  /** Local proxy URL for this listen port. */
  localUrl: string;
  port: number;
  hasToken: boolean;
  hasBinary: boolean;
  error: string | null;
};

export type NgrokManagerDeps = {
  which: (command: string) => string | null;
  spawnNgrok: (bin: string, args: string[], env: NodeJS.ProcessEnv) => ChildProcess;
  fetchTunnels: (inspectorBase: string) => Promise<string[]>;
  sleep: (ms: number) => Promise<void>;
  env: NodeJS.ProcessEnv;
  inspectorBase: string;
  readyAttempts: number;
  readyDelayMs: number;
};

type RuntimeState = {
  child: ChildProcess | null;
  publicUrl: string | null;
  lastPublicUrls: string[];
  lastError: string | null;
  listenPort: number | null;
};

const state: RuntimeState = {
  child: null,
  publicUrl: null,
  lastPublicUrls: [],
  lastError: null,
  listenPort: null,
};

let testDepsOverride: NgrokManagerDeps | null = null;

/** Test seam: force manager deps (fake spawn/inspector) for management API tests. */
export function setNgrokManagerDepsForTests(deps: NgrokManagerDeps | null): void {
  testDepsOverride = deps;
}

function resolveDeps(deps?: NgrokManagerDeps): NgrokManagerDeps {
  return deps ?? testDepsOverride ?? defaultNgrokDeps();
}

function defaultWhich(command: string): string | null {
  try {
    return typeof Bun !== "undefined" && typeof Bun.which === "function"
      ? Bun.which(command) ?? null
      : null;
  } catch {
    return null;
  }
}

async function defaultFetchTunnels(inspectorBase: string): Promise<string[]> {
  // Hard-lock to local ngrok inspector only — never follow caller-controlled hosts.
  const allowed = new Set([
    "http://127.0.0.1:4040",
    "http://localhost:4040",
  ]);
  const base = inspectorBase.replace(/\/$/, "");
  if (!allowed.has(base)) return [];
  const res = await fetch(`${base}/api/tunnels`);
  if (!res.ok) return [];
  const body = await res.json().catch(() => null) as { tunnels?: unknown } | null;
  const tunnels = Array.isArray(body?.tunnels) ? body!.tunnels : [];
  const urls: string[] = [];
  for (const tunnel of tunnels) {
    if (!tunnel || typeof tunnel !== "object") continue;
    const publicUrl = (tunnel as { public_url?: unknown }).public_url;
    if (typeof publicUrl === "string" && publicUrl.length > 0) urls.push(publicUrl);
  }
  return urls;
}

export function defaultNgrokDeps(env: NodeJS.ProcessEnv = process.env): NgrokManagerDeps {
  return {
    which: defaultWhich,
    // Fixed argv shape: binary from PATH lookup only, port as decimal string.
    spawnNgrok: (bin, args, childEnv) => {
      if (args.length !== 2 || args[0] !== "http" || !/^\d{1,5}$/.test(args[1]!)) {
        throw new Error("refusing to spawn ngrok with unexpected arguments");
      }
      return spawn(bin, args, {
        env: childEnv,
        stdio: ["ignore", "ignore", "ignore"],
        windowsHide: true,
        shell: false,
      });
    },
    fetchTunnels: defaultFetchTunnels,
    sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
    env,
    inspectorBase: "http://127.0.0.1:4040",
    readyAttempts: 25,
    readyDelayMs: 200,
  };
}

export function resolveNgrokToken(config: OcxConfig, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const fromEnv = env.NGROK_AUTHTOKEN?.trim();
  if (fromEnv) return fromEnv;
  const fromConfig = config.ngrok?.authToken?.trim();
  return fromConfig || undefined;
}

function pickPreferredUrl(urls: string[]): string | null {
  return urls.find(u => u.startsWith("https://")) ?? urls[0] ?? null;
}

function rememberPublicUrls(urls: string[]): void {
  if (urls.length === 0) return;
  state.lastPublicUrls = [...new Set(urls)];
  state.publicUrl = pickPreferredUrl(state.lastPublicUrls);
}

export function isNgrokChildRunning(): boolean {
  return !!(state.child && !state.child.killed && state.child.exitCode === null);
}

export async function getNgrokRuntimeSnapshot(
  config: OcxConfig,
  listenPort: number,
  deps: NgrokManagerDeps = resolveDeps(),
): Promise<NgrokStatus> {
  const bin = deps.which("ngrok");
  const token = resolveNgrokToken(config, deps.env);
  let liveUrls: string[] = [];
  try {
    liveUrls = await deps.fetchTunnels(deps.inspectorBase);
  } catch {
    /* inspector down */
  }
  if (liveUrls.length > 0) rememberPublicUrls(liveUrls);
  const raw = liveUrls.length > 0 ? [...new Set(liveUrls)] : [...state.lastPublicUrls];
  const https = raw.filter(u => u.startsWith("https://"));
  const other = raw.filter(u => !u.startsWith("https://"));
  const publicUrls = [...https, ...other];
  const publicUrl = pickPreferredUrl(publicUrls);
  const childRunning = isNgrokChildRunning();
  // Orphan inspector tunnels count as running only while the feature stays enabled.
  const running = childRunning || (config.ngrok?.enabled === true && liveUrls.length > 0);
  return {
    enabled: config.ngrok?.enabled === true,
    running,
    publicUrl,
    publicUrls,
    localUrl: `http://127.0.0.1:${listenPort}`,
    port: listenPort,
    hasToken: !!token,
    hasBinary: !!bin,
    error: state.lastError,
  };
}

export async function stopNgrokProcess(): Promise<void> {
  const child = state.child;
  state.child = null;
  state.publicUrl = null;
  // Keep lastPublicUrls so the dashboard URL list stays copyable after stop.
  if (!child) return;
  try {
    child.kill();
  } catch {
    /* already gone */
  }
  // Give the OS a beat to reap; ignore failures.
  await new Promise<void>(resolve => {
    const done = () => resolve();
    child.once("exit", done);
    setTimeout(done, 500);
  });
}

async function waitForPublicUrl(deps: NgrokManagerDeps): Promise<string | null> {
  for (let i = 0; i < deps.readyAttempts; i++) {
    try {
      const urls = await deps.fetchTunnels(deps.inspectorBase);
      const https = urls.find(u => u.startsWith("https://"));
      if (https) return https;
      if (urls[0]) return urls[0];
    } catch {
      /* inspector not ready */
    }
    await deps.sleep(deps.readyDelayMs);
  }
  return null;
}

export type StartNgrokResult =
  | { ok: true; publicUrl: string }
  | { ok: false; error: string };

export async function startNgrokProcess(
  listenPort: number,
  token: string,
  deps: NgrokManagerDeps = resolveDeps(),
): Promise<StartNgrokResult> {
  if (listenPort <= 0) {
    state.lastError = "Proxy listen port is not ready yet.";
    return { ok: false, error: state.lastError };
  }
  const bin = deps.which("ngrok");
  if (!bin) {
    state.lastError = "ngrok binary not found on PATH. Install ngrok and retry.";
    return { ok: false, error: state.lastError };
  }
  if (!token.trim()) {
    state.lastError = "Ngrok auth token missing. Set NGROK_AUTHTOKEN or save a token on the Ngrok page.";
    return { ok: false, error: state.lastError };
  }

  await stopNgrokProcess();
  state.lastError = null;
  state.listenPort = listenPort;

  const childEnv: NodeJS.ProcessEnv = {
    ...deps.env,
    NGROK_AUTHTOKEN: token,
  };
  // Avoid leaking parent secrets into logs via accidental dump — child only needs the token.
  let child: ChildProcess;
  try {
    child = deps.spawnNgrok(bin, ["http", String(listenPort)], childEnv);
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
    return { ok: false, error: state.lastError };
  }

  state.child = child;
  child.on("exit", (code, signal) => {
    if (state.child === child) {
      state.child = null;
      state.publicUrl = null;
      if (code && code !== 0) {
        state.lastError = `ngrok exited with code ${code}`;
      } else if (signal) {
        state.lastError = `ngrok exited from signal ${signal}`;
      }
    }
  });

  const publicUrl = await waitForPublicUrl(deps);
  if (!publicUrl) {
    await stopNgrokProcess();
    state.lastError = "ngrok started but no public URL appeared (is the local inspector on 127.0.0.1:4040?).";
    return { ok: false, error: state.lastError };
  }
  try {
    const all = await deps.fetchTunnels(deps.inspectorBase);
    rememberPublicUrls(all.length > 0 ? all : [publicUrl]);
  } catch {
    rememberPublicUrls([publicUrl]);
  }
  state.lastError = null;
  return { ok: true, publicUrl: state.publicUrl ?? publicUrl };
}

export async function ensureNgrokFromConfig(
  config: OcxConfig,
  listenPort: number,
  deps: NgrokManagerDeps = resolveDeps(),
): Promise<void> {
  if (config.ngrok?.enabled !== true) return;
  const token = resolveNgrokToken(config, deps.env);
  if (!token) {
    state.lastError = "Ngrok enabled in config but no auth token is available.";
    console.warn(`⚠️  ${state.lastError}`);
    return;
  }
  const result = await startNgrokProcess(listenPort, token, deps);
  if (!result.ok) console.warn(`⚠️  Ngrok auto-start failed: ${result.error}`);
  else console.log(`🌐 Ngrok tunnel: ${result.publicUrl}`);
}

/** Test seam: clear process bookkeeping between cases. */
export function resetNgrokManagerForTests(): void {
  state.child = null;
  state.publicUrl = null;
  state.lastPublicUrls = [];
  state.lastError = null;
  state.listenPort = null;
  testDepsOverride = null;
}
