// tests/claude-messages-failover.test.ts
import { afterEach, describe, expect, test, mock } from "bun:test";

// Inject handleResponses: the anthropic candidate 429s, the xai candidate succeeds.
const calls: string[] = [];
mock.module("../src/server/responses", () => ({
  handleResponses: async (req: Request) => {
    const body = await req.clone().json().catch(() => ({}));
    const model = (body as { model?: string }).model ?? "";
    calls.push(model);
    if (model.startsWith("anthropic/")) {
      return new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 });
    }
    return new Response(JSON.stringify({ status: "completed", output: [] }), { status: 200 });
  },
}));

import { clearAllCooldowns, candidateCooldown } from "../src/claude/route-cooldowns";
import { handleClaudeMessages } from "../src/server/claude-messages";
import type { OcxConfig } from "../src/types";

afterEach(() => {
  calls.length = 0;
  clearAllCooldowns();
});

function cfg(): OcxConfig {
  return {
    port: 10100,
    defaultProvider: "openai",
    providers: { anthropic: {}, xai: {} },
    claudeCode: {
      routing: {
        maxHops: 3,
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

function req(): Request {
  return new Request("http://x/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer sk-local" },
    body: JSON.stringify({ model: "claude-opus-4-8", max_tokens: 16, stream: false, messages: [{ role: "user", content: "hi" }] }),
  });
}

describe("claude messages failover", () => {
  test("hops from a 429 primary to the next candidate", async () => {
    const res = await handleClaudeMessages(req(), cfg(), {} as any);
    expect(res.status).toBe(200);
    expect(calls).toEqual(["anthropic/claude-opus-4-8", "xai/grok-4.5"]);
    expect(candidateCooldown("anthropic/claude-opus-4-8")).not.toBeNull();
  });
});
