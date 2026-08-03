import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SESSION_WARN_THRESHOLD_MS } from "../src/oauth/session-lifetime";
import { mutateStore, saveCredential } from "../src/oauth/store";

const origHome = process.env.HOME;
const origOcxHome = process.env.OPENCODEX_HOME;
let tmp: string;

beforeEach(() => {
  tmp = join(tmpdir(), `session-lifetime-api-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(tmp, { recursive: true });
  process.env.HOME = tmp;
  process.env.OPENCODEX_HOME = join(tmp, "ocx");
});

afterEach(() => {
  if (origHome === undefined) delete process.env.HOME;
  else process.env.HOME = origHome;
  if (origOcxHome === undefined) delete process.env.OPENCODEX_HOME;
  else process.env.OPENCODEX_HOME = origOcxHome;
  rmSync(tmp, { recursive: true, force: true });
});

describe("collectSessionWarnings", () => {
  test("includes expiring account in warnings", async () => {
    const now = Date.now();
    const addedAt = now - 7.5 * 60 * 60 * 1000; // 7.5h ago, claude TTL=8h -> ~30m left
    await saveCredential("claude", {
      access: "tok",
      refresh: "ref",
      expires: now + 3_600_000,
    });
    await mutateStore(store => {
      const set = store["claude"];
      if (set?.accounts[0]) set.accounts[0].addedAt = addedAt;
    });
    const { collectSessionWarnings } = await import("../src/server/management/config-routes");
    const warnings = collectSessionWarnings(now);
    expect(warnings.length).toBeGreaterThan(0);
    const w = warnings[0]!;
    expect(w.provider).toBe("claude");
    expect(w.timeLeftMs).toBeLessThan(SESSION_WARN_THRESHOLD_MS);
    expect(w.timeLeftMs).toBeGreaterThan(0);
    expect(typeof w.label).toBe("string");
    expect(w.label).toContain("claude");
  });

  test("no warnings when no accounts", async () => {
    const { collectSessionWarnings } = await import("../src/server/management/config-routes");
    const warnings = collectSessionWarnings(Date.now());
    expect(warnings).toHaveLength(0);
  });

  test("no warnings when session ok (freshly added)", async () => {
    const now = Date.now();
    await saveCredential("claude", {
      access: "tok",
      refresh: "ref",
      expires: now + 3_600_000,
    });
    await mutateStore(store => {
      const set = store["claude"];
      if (set?.accounts[0]) set.accounts[0].addedAt = now;
    });
    const { collectSessionWarnings } = await import("../src/server/management/config-routes");
    const warnings = collectSessionWarnings(now);
    expect(warnings).toHaveLength(0);
  });
});
