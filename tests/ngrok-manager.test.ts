import { afterEach, beforeEach, expect, test } from "bun:test";
import type { ChildProcess } from "node:child_process";
import {
  defaultNgrokDeps,
  getNgrokRuntimeSnapshot,
  resetNgrokManagerForTests,
  resolveNgrokToken,
  startNgrokProcess,
  stopNgrokProcess,
  type NgrokManagerDeps,
} from "../src/ngrok/manager";
import type { OcxConfig } from "../src/types";

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
  resetNgrokManagerForTests();
});

afterEach(async () => {
  await stopNgrokProcess();
  resetNgrokManagerForTests();
});

test("resolveNgrokToken prefers env over config", () => {
  const config = { ngrok: { authToken: "cfg-token" } } as OcxConfig;
  expect(resolveNgrokToken(config, { NGROK_AUTHTOKEN: "env-token" })).toBe("env-token");
  expect(resolveNgrokToken(config, {})).toBe("cfg-token");
});

test("startNgrokProcess fails without binary", async () => {
  const deps: NgrokManagerDeps = {
    ...defaultNgrokDeps({}),
    which: () => null,
    sleep: async () => {},
  };
  const result = await startNgrokProcess(10100, "tok", deps);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain("binary");
});

test("startNgrokProcess records public URL from inspector", async () => {
  const child = fakeChild();
  const deps: NgrokManagerDeps = {
    which: () => "/usr/bin/ngrok",
    spawnNgrok: () => child,
    fetchTunnels: async () => ["https://abc.ngrok-free.app"],
    sleep: async () => {},
    env: {},
    inspectorBase: "http://127.0.0.1:4040",
    readyAttempts: 3,
    readyDelayMs: 1,
  };
  const result = await startNgrokProcess(10100, "tok", deps);
  expect(result).toEqual({ ok: true, publicUrl: "https://abc.ngrok-free.app" });
  const snap = getNgrokRuntimeSnapshot({ ngrok: { enabled: true, authToken: "tok" } } as OcxConfig, 10100, deps);
  expect(snap.running).toBe(true);
  expect(snap.publicUrl).toBe("https://abc.ngrok-free.app");
  expect(snap.hasBinary).toBe(true);
  expect(snap.hasToken).toBe(true);
});
