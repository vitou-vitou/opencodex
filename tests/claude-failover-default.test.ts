import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyFailoverDefault,
  FAILOVER_DEFAULT_OPUS_IDS,
} from "../src/claude/failover-default";
import { claudeCodeAlias } from "../src/claude/alias";
import type { OcxConfig } from "../src/types";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function configStub(): OcxConfig {
  const root = mkdtempSync(join(tmpdir(), "ocx-fd-"));
  dirs.push(root);
  return {
    port: 10100,
    defaultProvider: "openai",
    providers: {
      xai: { adapter: "openai-chat", authMode: "oauth", baseUrl: "https://api.x.ai" },
      kiro: { adapter: "openai-chat", authMode: "oauth", baseUrl: "https://kiro.example" },
    },
    claudeCode: { enabled: true },
  } as OcxConfig;
}

test("applyFailoverDefault: merges chains, sets tier heads, remaps Opus Default ids", async () => {
  const config = configStub();
  const result = await applyFailoverDefault(config, { skipIde: true, replace: true }, { save: () => undefined });

  expect(result.added.length + result.replaced.length).toBeGreaterThan(0);
  expect(result.opusAlias).toBe(claudeCodeAlias("xai", "grok-4.5"));
  expect(config.claudeCode?.tierModels?.opus).toBe(result.opusAlias);
  expect(config.claudeCode?.model).toBe(result.opusAlias);
  expect(config.claudeCode?.routing?.chains?.opus?.length).toBeGreaterThan(0);
  expect(config.claudeCode?.routing?.chains?.[result.opusAlias!]?.[0]?.provider).toBe("xai");
  for (const id of FAILOVER_DEFAULT_OPUS_IDS) {
    expect(config.claudeCode?.modelMap?.[id]).toBe(result.opusAlias);
    expect(config.claudeCode?.routing?.chains?.[id]?.length).toBeGreaterThan(0);
  }
});
