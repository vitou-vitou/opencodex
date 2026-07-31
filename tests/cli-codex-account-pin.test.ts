import { describe, expect, test } from "bun:test";
import {
  buildCodexAccountPinConfigOverrides,
  buildCodexLaunchEnv,
  parseCodexLauncherArgs,
  resolveCodexAccountPin,
} from "../src/cli/codex";
import { CODEX_ACCOUNT_PIN_ENV, CODEX_ACCOUNT_PIN_HEADER } from "../src/codex/auth-context";
import type { OcxConfig } from "../src/types";

function config(): OcxConfig {
  return {
    port: 10100,
    defaultProvider: "openai",
    providers: {},
    codexAccounts: [
      { id: "main", email: "main@example.test", isMain: true },
      { id: "pool-a", email: "alice@example.test", isMain: false, chatgptAccountId: "acc_a" },
      { id: "pool-b", email: "bob@example.test", isMain: false, chatgptAccountId: "acc_b" },
    ],
  };
}

describe("ocx codex launcher pin helpers", () => {
  test("parseCodexLauncherArgs strips --account forms", () => {
    expect(parseCodexLauncherArgs(["--account", "pool-a", "exec", "hi"])).toEqual({
      accountRaw: "pool-a",
      codexArgs: ["exec", "hi"],
    });
    expect(parseCodexLauncherArgs(["--account=main", "exec"])).toEqual({
      accountRaw: "main",
      codexArgs: ["exec"],
    });
    expect(parseCodexLauncherArgs(["exec"])).toEqual({
      accountRaw: null,
      codexArgs: ["exec"],
    });
  });

  test("resolveCodexAccountPin accepts id, email, and main", () => {
    expect(resolveCodexAccountPin(config(), "pool-a")).toEqual({ ok: true, pin: "pool-a" });
    expect(resolveCodexAccountPin(config(), "Alice@Example.test")).toEqual({ ok: true, pin: "pool-a" });
    expect(resolveCodexAccountPin(config(), "main")).toEqual({ ok: true, pin: "main" });
    expect(resolveCodexAccountPin(config(), "missing").ok).toBe(false);
  });

  test("buildCodexAccountPinConfigOverrides selects opencodex provider with pin env header", () => {
    const overrides = buildCodexAccountPinConfigOverrides(10100, { hostname: "127.0.0.1" });
    expect(overrides).toContain('model_provider="opencodex"');
    expect(overrides.some(o => o.includes(`"${CODEX_ACCOUNT_PIN_HEADER}" = "${CODEX_ACCOUNT_PIN_ENV}"`))).toBe(true);
    expect(overrides.some(o => o.includes("http://127.0.0.1:10100/v1"))).toBe(true);
  });

  test("buildCodexLaunchEnv sets or clears OCX_CODEX_ACCOUNT", () => {
    expect(buildCodexLaunchEnv({ FOO: "1" }, "pool-a")[CODEX_ACCOUNT_PIN_ENV]).toBe("pool-a");
    expect(buildCodexLaunchEnv({ [CODEX_ACCOUNT_PIN_ENV]: "stale" }, null)[CODEX_ACCOUNT_PIN_ENV]).toBeUndefined();
  });
});
