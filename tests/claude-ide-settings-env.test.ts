import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  applyIdeClaudeEnv,
  buildIdeClaudeEnv,
  readIdeClaudeEnvStatus,
  revertIdeClaudeEnv,
} from "../src/claude/ide-settings-env";
import type { OcxConfig } from "../src/types";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ocx-ide-"));
  dirs.push(dir);
  return dir;
}

function baseConfig(overrides: Partial<OcxConfig> = {}): OcxConfig {
  return {
    port: 10100,
    defaultProvider: "openai",
    providers: {},
    ...overrides,
  } as OcxConfig;
}

test("buildIdeClaudeEnv: admission key forces host-managed token", () => {
  const env = buildIdeClaudeEnv({
    config: baseConfig({ apiKeys: [{ id: "1", name: "cursor-claude-fallback", key: "ocx_test_admission_key" }] }),
    port: 10100,
    detectEnv: {},
  });
  expect(env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:10100");
  expect(env.ANTHROPIC_AUTH_TOKEN).toBe("ocx_test_admission_key");
  expect(env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY).toBe("1");
  expect(env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST).toBe("1");
});

test("buildIdeClaudeEnv: subscription without apiKeys omits token", () => {
  const env = buildIdeClaudeEnv({
    config: baseConfig({ claudeCode: { authMode: "subscription" } }),
    port: 10100,
    detectEnv: { ANTHROPIC_API_KEY: "sk-ant-user" },
  });
  expect(env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:10100");
  expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  expect(env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST).toBeUndefined();
});

test("apply/revert merge Claude home env and Cursor environmentVariables", () => {
  const root = tempDir();
  const claudeHomePath = join(root, ".claude", "settings.json");
  const cursorSettingsPath = join(root, "Cursor", "User", "settings.json");
  mkdirSync(dirname(claudeHomePath), { recursive: true });
  mkdirSync(dirname(cursorSettingsPath), { recursive: true });
  writeFileSync(claudeHomePath, JSON.stringify({
    env: { KEEP_ME: "yes", ANTHROPIC_BASE_URL: "http://stale" },
    model: "claude-ocx-anthropic-apikey--claude-fable-5",
    permissions: { defaultMode: "bypassPermissions" },
  }, null, 2));
  writeFileSync(cursorSettingsPath, JSON.stringify({
    "claudeCode.preferredLocation": "panel",
    "claudeCode.environmentVariables": [{ name: "KEEP_CURSOR", value: "1" }],
  }, null, 2));

  const applied = applyIdeClaudeEnv({
    config: baseConfig({ apiKeys: [{ id: "1", name: "k", key: "ocx_abc" }] }),
    port: 10100,
    claudeHomePath,
    cursorSettingsPath,
  });
  expect(applied.claudeHomeWritten).toBe(true);
  expect(applied.cursorWritten).toBe(true);
  expect(applied.warnings.some(w => w.includes("stale settings.model"))).toBe(true);

  const home = JSON.parse(readFileSync(claudeHomePath, "utf8")) as {
    env: Record<string, string>;
    model?: string;
    permissions?: { defaultMode: string };
  };
  expect(home.env.KEEP_ME).toBe("yes");
  expect(home.env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:10100");
  expect(home.env.ANTHROPIC_AUTH_TOKEN).toBe("ocx_abc");
  expect(home.model).toBeUndefined();
  expect(home.permissions?.defaultMode).toBe("bypassPermissions");

  const cursor = JSON.parse(readFileSync(cursorSettingsPath, "utf8")) as {
    "claudeCode.environmentVariables": Array<{ name: string; value: string }>;
    "claudeCode.preferredLocation": string;
  };
  expect(cursor["claudeCode.preferredLocation"]).toBe("panel");
  const map = Object.fromEntries(cursor["claudeCode.environmentVariables"].map(e => [e.name, e.value]));
  expect(map.KEEP_CURSOR).toBe("1");
  expect(map.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:10100");

  const status = readIdeClaudeEnvStatus({ claudeHomePath, cursorSettingsPath });
  expect(status.claudeHomeEnv.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:10100");
  expect(status.cursorEnv.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:10100");

  revertIdeClaudeEnv({ claudeHomePath, cursorSettingsPath });
  const homeAfter = JSON.parse(readFileSync(claudeHomePath, "utf8")) as { env: Record<string, string> };
  expect(homeAfter.env).toEqual({ KEEP_ME: "yes" });
  const cursorAfter = JSON.parse(readFileSync(cursorSettingsPath, "utf8")) as {
    "claudeCode.environmentVariables": Array<{ name: string; value: string }>;
  };
  expect(cursorAfter["claudeCode.environmentVariables"]).toEqual([{ name: "KEEP_CURSOR", value: "1" }]);
});
