import { afterEach, beforeEach, expect, setDefaultTimeout, test } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig } from "../src/config";
import {
  defaultNgrokDeps,
  resetNgrokManagerForTests,
  setNgrokManagerDepsForTests,
  stopNgrokProcess,
  type NgrokManagerDeps,
} from "../src/ngrok/manager";
import { startServer } from "../src/server";
import type { OcxConfig } from "../src/types";
import { installIsolatedCodexHome, type IsolatedCodexHome } from "./helpers/isolated-codex-home";

setDefaultTimeout(30_000);

let testDir = "";
let previousHome: string | undefined;
let previousToken: string | undefined;
let isolatedCodexHome: IsolatedCodexHome | null = null;

function fakeChild(): ChildProcess {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  const child = {
    exitCode: null as number | null,
    killed: false,
    kill() {
      this.killed = true;
      this.exitCode = 0;
      for (const fn of handlers.get("exit") ?? []) fn(0, null);
    },
    on(event: string, fn: (...args: unknown[]) => void) {
      const list = handlers.get(event) ?? [];
      list.push(fn);
      handlers.set(event, list);
      return this;
    },
    once(event: string, fn: (...args: unknown[]) => void) {
      return this.on(event, fn);
    },
  };
  return child as unknown as ChildProcess;
}

beforeEach(() => {
  previousHome = process.env.OPENCODEX_HOME;
  previousToken = process.env.NGROK_AUTHTOKEN;
  delete process.env.NGROK_AUTHTOKEN;
  isolatedCodexHome = installIsolatedCodexHome("ocx-ngrok-mgmt-");
  testDir = mkdtempSync(join(tmpdir(), "ocx-ngrok-mgmt-"));
  process.env.OPENCODEX_HOME = testDir;
  resetNgrokManagerForTests();
  saveConfig({
    port: 0,
    defaultProvider: "mock",
    providers: {
      mock: { adapter: "openai-chat", baseUrl: "http://127.0.0.1:1/v1", apiKey: "k", allowPrivateNetwork: true, liveModels: false, models: ["test-model"] },
    },
  } as OcxConfig);
});

afterEach(async () => {
  await stopNgrokProcess();
  resetNgrokManagerForTests();
  if (previousHome === undefined) delete process.env.OPENCODEX_HOME;
  else process.env.OPENCODEX_HOME = previousHome;
  if (previousToken === undefined) delete process.env.NGROK_AUTHTOKEN;
  else process.env.NGROK_AUTHTOKEN = previousToken;
  isolatedCodexHome?.restore();
  isolatedCodexHome = null;
  if (testDir) rmSync(testDir, { recursive: true, force: true });
});

test("GET /api/ngrok returns status without authToken", async () => {
  const server = startServer(0);
  try {
    const r = await fetch(new URL("/api/ngrok", server.url));
    expect(r.status).toBe(200);
    const d = await r.json() as Record<string, unknown>;
    expect(d.enabled).toBe(false);
    expect(d.running).toBe(false);
    expect(d.hasToken).toBe(false);
    expect(typeof d.localUrl).toBe("string");
    expect(Array.isArray(d.publicUrls)).toBe(true);
    expect("authToken" in d).toBe(false);
  } finally {
    server.stop(true);
  }
});

test("PUT /api/ngrok enabled true without token returns 400", async () => {
  const server = startServer(0);
  try {
    const r = await fetch(new URL("/api/ngrok", server.url), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(r.status).toBe(400);
    const d = await r.json() as { error?: string; enabled?: boolean };
    expect(d.error).toMatch(/token/i);
    expect(loadConfig().ngrok?.enabled).not.toBe(true);
  } finally {
    server.stop(true);
  }
});

test("PUT /api/ngrok saves token as hasToken only", async () => {
  const server = startServer(0);
  try {
    const r = await fetch(new URL("/api/ngrok", server.url), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authToken: "secret-ngrok-token" }),
    });
    expect(r.status).toBe(200);
    const d = await r.json() as Record<string, unknown>;
    expect(d.hasToken).toBe(true);
    expect("authToken" in d).toBe(false);
    expect(loadConfig().ngrok?.authToken).toBe("secret-ngrok-token");
  } finally {
    server.stop(true);
  }
});

test("PUT /api/ngrok enables with fake spawn seam", async () => {
  const child = fakeChild();
  const deps: NgrokManagerDeps = {
    ...defaultNgrokDeps({}),
    which: () => "/usr/bin/ngrok",
    spawnNgrok: () => child,
    fetchTunnels: async () => ["https://demo.ngrok-free.app"],
    sleep: async () => {},
    readyAttempts: 2,
    readyDelayMs: 1,
  };
  setNgrokManagerDepsForTests(deps);

  const server = startServer(0);
  try {
    const putToken = await fetch(new URL("/api/ngrok", server.url), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authToken: "tok" }),
    });
    expect(putToken.status).toBe(200);

    const putOn = await fetch(new URL("/api/ngrok", server.url), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(putOn.status).toBe(200);
    const onBody = await putOn.json() as { enabled?: boolean; running?: boolean; publicUrl?: string; publicUrls?: string[]; localUrl?: string };
    expect(onBody.enabled).toBe(true);
    expect(onBody.running).toBe(true);
    expect(onBody.publicUrl).toBe("https://demo.ngrok-free.app");
    expect(onBody.publicUrls).toEqual(["https://demo.ngrok-free.app"]);
    expect(typeof onBody.localUrl).toBe("string");
    expect(loadConfig().ngrok?.enabled).toBe(true);

    const putOff = await fetch(new URL("/api/ngrok", server.url), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(putOff.status).toBe(200);
    const offBody = await putOff.json() as { enabled?: boolean; running?: boolean };
    expect(offBody.enabled).toBe(false);
    expect(offBody.running).toBe(false);
  } finally {
    server.stop(true);
  }
});
