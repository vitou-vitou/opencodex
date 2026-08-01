// tests/claude-route-management.test.ts
import { afterEach, describe, expect, test, mock } from "bun:test";

const saved: unknown[] = [];
mock.module("../src/config", () => ({
  saveConfigPreservingClaudeCode: (c: unknown) => { saved.push(c); },
}));

import { handleClaudeRouteRequest } from "../src/server/management/agent-settings-routes";
import { clearAllCooldowns } from "../src/claude/route-cooldowns";
import type { OcxConfig } from "../src/types";

function cfg(): OcxConfig {
  return {
    port: 10100,
    defaultProvider: "openai",
    providers: { anthropic: {}, xai: {} },
    claudeCode: {
      routing: {
        chains: {
          "claude-opus-4-8": [
            { provider: "anthropic", model: "claude-opus-4-8" },
            { provider: "xai", model: "grok-4.5" },
          ],
        },
      },
    },
  } as unknown as OcxConfig;
}

describe("claude route management", () => {
  afterEach(() => {
    saved.length = 0;
    clearAllCooldowns();
  });

  test("PUT pin then GET status reflects it", async () => {
    const config = cfg();
    const put = await handleClaudeRouteRequest(config, new Request("http://x/api/claude/route/pin", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "xai", hard: false }),
    }), new URL("http://x/api/claude/route/pin"));
    expect(put?.status).toBe(200);
    const putJson = await put!.json();
    expect(putJson).toEqual({ pin: { provider: "xai", hard: false } });
    expect(saved).toHaveLength(1);

    const get = await handleClaudeRouteRequest(config, new Request("http://x/api/claude/route/status"),
      new URL("http://x/api/claude/route/status"));
    expect(get?.status).toBe(200);
    const json = await get!.json();
    expect(json.pin).toEqual({ provider: "xai", hard: false });
    expect(json.chains["claude-opus-4-8"]).toHaveLength(2);
    expect(json.threshold).toBe(90);
    expect(json.maxHops).toBe(3);
    expect(Array.isArray(json.candidates)).toBe(true);
    expect(json.candidates).toHaveLength(2);
    expect(json.candidates[0]).toMatchObject({
      id: "claude-opus-4-8",
      provider: "anthropic",
      model: "claude-opus-4-8",
    });
    expect(typeof json.candidates[0].healthy).toBe("boolean");
  });

  test("PUT pin with provider null clears the pin", async () => {
    const config = cfg();
    config.claudeCode!.routing!.pin = { provider: "xai", hard: true };
    const put = await handleClaudeRouteRequest(config, new Request("http://x/api/claude/route/pin", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: null }),
    }), new URL("http://x/api/claude/route/pin"));
    expect(put?.status).toBe(200);
    const json = await put!.json();
    expect(json).toEqual({ pin: null });
  });

  test("returns null for unrelated paths", async () => {
    const config = cfg();
    expect(await handleClaudeRouteRequest(config, new Request("http://x/api/other"), new URL("http://x/api/other"))).toBeNull();
  });

  test("returns null for wrong method on known paths", async () => {
    const config = cfg();
    expect(await handleClaudeRouteRequest(
      config,
      new Request("http://x/api/claude/route/status", { method: "POST" }),
      new URL("http://x/api/claude/route/status"),
    )).toBeNull();
  });
});
