// gui/tests/api-keys-model-test-pool.test.ts
import { describe, expect, test } from "bun:test";
import {
  MODEL_TEST_CONCURRENCY,
  probeModelChatCompletions,
  runPool,
} from "../src/pages/api-keys-utils";

describe("MODEL_TEST_CONCURRENCY", () => {
  test("is 5", () => {
    expect(MODEL_TEST_CONCURRENCY).toBe(5);
  });
});

describe("runPool", () => {
  test("runs all items", async () => {
    const seen: number[] = [];
    await runPool([1, 2, 3], 2, async (n) => { seen.push(n); });
    expect(seen.sort()).toEqual([1, 2, 3]);
  });

  test("never exceeds concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    await runPool([1, 2, 3, 4, 5, 6], 3, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Bun.sleep(20);
      active -= 1;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  test("empty list resolves immediately", async () => {
    let calls = 0;
    await runPool([], 5, async () => { calls += 1; });
    expect(calls).toBe(0);
  });
});

describe("probeModelChatCompletions", () => {
  test("ok stores httpStatus", async () => {
    const fetchFn = (async () => new Response("{}", { status: 200 })) as typeof fetch;
    const entry = await probeModelChatCompletions("http://example/v1/chat/completions", "m1", "Failed", fetchFn);
    expect(entry).toEqual({ state: "ok", httpStatus: 200 });
  });

  test("http error stores status and detail", async () => {
    const fetchFn = (async () => new Response("nope", { status: 401 })) as typeof fetch;
    const entry = await probeModelChatCompletions("http://example/v1/chat/completions", "m1", "Failed", fetchFn);
    expect(entry.state).toBe("error");
    expect(entry.httpStatus).toBe(401);
    expect(entry.detail).toBe("nope");
  });

  test("network failure has no httpStatus", async () => {
    const fetchFn = (async () => { throw new Error("offline"); }) as typeof fetch;
    const entry = await probeModelChatCompletions("http://example/v1/chat/completions", "m1", "Failed", fetchFn);
    expect(entry).toEqual({ state: "error", detail: "offline" });
  });
});
