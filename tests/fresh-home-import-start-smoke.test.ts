import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleConfigCommand } from "../src/cli/config-command";
import { getConfigPath, loadConfig } from "../src/config";
import { startServer } from "../src/server";
import type { OcxConfig } from "../src/types";
import { installIsolatedCodexHome, type IsolatedCodexHome } from "./helpers/isolated-codex-home";

/**
 * Fresh-home smoke: mimics a new PC / clean OPENCODEX_HOME after cloning setup.
 *
 * Interactive `ocx init` is skipped (TTY). Non-interactive stand-in is
 * `ocx config import … --yes`, then `startServer`, then curl health + proxy.
 */

let testDir = "";
let previousHome: string | undefined;
let previousApiToken: string | undefined;
let isolatedCodexHome: IsolatedCodexHome | null = null;
let upstream: ReturnType<typeof Bun.serve> | null = null;
let proxy: ReturnType<typeof startServer> | null = null;

beforeEach(() => {
  previousHome = process.env.OPENCODEX_HOME;
  previousApiToken = process.env.OPENCODEX_API_AUTH_TOKEN;
  isolatedCodexHome = installIsolatedCodexHome("ocx-fresh-home-codex-");
  testDir = mkdtempSync(join(tmpdir(), "ocx-fresh-home-"));
  process.env.OPENCODEX_HOME = testDir;
  delete process.env.OPENCODEX_API_AUTH_TOKEN;
});

afterEach(async () => {
  if (proxy) {
    await proxy.stop(true);
    proxy = null;
  }
  if (upstream) {
    await upstream.stop(true);
    upstream = null;
  }
  if (previousApiToken === undefined) delete process.env.OPENCODEX_API_AUTH_TOKEN;
  else process.env.OPENCODEX_API_AUTH_TOKEN = previousApiToken;
  if (previousHome === undefined) delete process.env.OPENCODEX_HOME;
  else process.env.OPENCODEX_HOME = previousHome;
  isolatedCodexHome?.restore();
  isolatedCodexHome = null;
  if (testDir) rmSync(testDir, { recursive: true, force: true });
  process.exitCode = 0;
});

function chatCompletionBody(content: string) {
  return {
    id: "chatcmpl-fresh-home",
    object: "chat.completion",
    choices: [{
      index: 0,
      message: { role: "assistant", content },
      finish_reason: "stop",
    }],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
  };
}

describe("fresh home import → start → curl", () => {
  test("empty OPENCODEX_HOME imports setup JSON, starts proxy, healthz and /v1/responses work", async () => {
    upstream = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname.endsWith("/models")) {
          return Response.json({
            data: [{ id: "smoke-model", object: "model" }],
          });
        }
        if (url.pathname.endsWith("/chat/completions")) {
          return Response.json(chatCompletionBody("fresh-home-ok"));
        }
        return new Response("not found", { status: 404 });
      },
    });

    const importPath = join(testDir, "setup-import.json");
    const setup: OcxConfig = {
      port: 0,
      hostname: "127.0.0.1",
      defaultProvider: "clone-smoke",
      websockets: false,
      providers: {
        "clone-smoke": {
          adapter: "openai-chat",
          baseUrl: `http://127.0.0.1:${upstream.port}/v1`,
          allowPrivateNetwork: true,
          authMode: "key",
          apiKey: "sk-fresh-home-test-key",
          defaultModel: "smoke-model",
          models: ["smoke-model"],
          liveModels: false,
        },
      },
    };
    writeFileSync(importPath, `${JSON.stringify(setup, null, 2)}\n`, "utf8");

    // New clone / new PC: no config.json yet.
    expect(() => loadConfig()).not.toThrow();
    const before = loadConfig();
    expect(before.providers?.["clone-smoke"]).toBeUndefined();

    const code = await handleConfigCommand(["import", importPath, "--yes"]);
    expect(code).toBe(0);
    expect(getConfigPath()).toBe(join(testDir, "config.json"));

    const imported = loadConfig();
    expect(imported.defaultProvider).toBe("clone-smoke");
    expect(imported.providers["clone-smoke"]?.baseUrl).toContain(`:${upstream.port}/`);
    expect(imported.providers["clone-smoke"]?.apiKey).toBe("sk-fresh-home-test-key");

    proxy = startServer(0);
    const base = proxy.url.toString().replace(/\/$/, "");

    const health = await fetch(`${base}/healthz`);
    expect(health.status).toBe(200);
    const healthJson = await health.json() as { service?: string; status?: string };
    expect(healthJson.service).toBe("opencodex");
    expect(healthJson.status).toBe("ok");

    const responses = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "clone-smoke/smoke-model",
        input: "ping from fresh home",
        stream: false,
      }),
    });
    expect(responses.status).toBe(200);
    const body = await responses.json() as {
      output?: Array<{ content?: Array<{ text?: string }> }>;
      status?: string;
    };
    const text = JSON.stringify(body);
    expect(text).toContain("fresh-home-ok");
  });

  test("import without --yes is rejected on a fresh home", async () => {
    const importPath = join(testDir, "setup-import.json");
    writeFileSync(importPath, `${JSON.stringify({
      port: 0,
      defaultProvider: "openai",
      providers: {
        openai: {
          adapter: "openai-chat",
          baseUrl: "https://api.example.test/v1",
          apiKey: "sk-test",
        },
      },
    } satisfies OcxConfig, null, 2)}\n`);

    const code = await handleConfigCommand(["import", importPath]);
    expect(code).not.toBe(0);
  });
});
