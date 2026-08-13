import { afterEach, beforeEach, expect, jest, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import type { Root } from "react-dom/client";
import { LanguageProvider } from "../src/i18n/provider";
import Logs from "../src/pages/Logs";

const globals = ["document", "window", "navigator", "localStorage", "IS_REACT_ACT_ENVIRONMENT", "ResizeObserver"] as const;
let previousGlobals: Record<(typeof globals)[number], unknown>;
let testWindow: Window;
const originalFetch = globalThis.fetch;

const okLog = {
  requestId: "req-ok",
  timestamp: 1_700_000_000_000,
  model: "gpt-ok",
  provider: "openai",
  status: 200,
  durationMs: 42,
  usageStatus: "reported",
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
};

const rateLimitedLog = {
  requestId: "req-429",
  timestamp: 1_700_000_000_100,
  model: "gpt-rate",
  provider: "openai",
  status: 429,
  durationMs: 80,
  usageStatus: "unreported",
};

const serverErrorLog = {
  requestId: "req-502",
  timestamp: 1_700_000_000_200,
  model: "gpt-fail",
  provider: "openai",
  status: 502,
  durationMs: 120,
  usageStatus: "unreported",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installLayoutStubs(win: Window): void {
  const proto = win.HTMLElement.prototype as unknown as HTMLElement;
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 800; } });
  Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 1200; } });
  Object.defineProperty(proto, "offsetHeight", { configurable: true, get() { return 800; } });
  Object.defineProperty(proto, "offsetWidth", { configurable: true, get() { return 1200; } });
  Object.defineProperty(proto, "scrollHeight", { configurable: true, get() { return 800; } });
  Object.defineProperty(proto, "getBoundingClientRect", {
    configurable: true,
    value() {
      return {
        x: 0, y: 0, top: 0, left: 0, bottom: 800, right: 1200, width: 1200, height: 800,
        toJSON() { return this; },
      };
    },
  });

  class ResizeObserverStub {
    #cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) { this.#cb = cb; }
    observe(target: Element) {
      this.#cb(
        [{
          target,
          contentRect: {
            x: 0, y: 0, top: 0, left: 0, bottom: 800, right: 1200, width: 1200, height: 800,
            toJSON() { return this; },
          },
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: ResizeObserverStub });
  Object.defineProperty(win, "ResizeObserver", { configurable: true, value: ResizeObserverStub });
}

beforeEach(() => {
  previousGlobals = Object.fromEntries(globals.map(key => [key, Reflect.get(globalThis, key)])) as typeof previousGlobals;
  testWindow = new Window({ url: "http://localhost/#logs" });
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: testWindow.document },
    window: { configurable: true, value: testWindow },
    navigator: { configurable: true, value: testWindow.navigator },
    localStorage: { configurable: true, value: testWindow.localStorage },
  });
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installLayoutStubs(testWindow);
  jest.useFakeTimers({ now: 1_700_000_000_000 });
});

afterEach(() => {
  jest.useRealTimers();
  globalThis.fetch = originalFetch;
  testWindow.close();
  for (const key of globals) {
    Object.defineProperty(globalThis, key, { configurable: true, value: previousGlobals[key] });
  }
});

async function mountLogs(): Promise<{ root: Root; container: HTMLElement }> {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <LanguageProvider>
        <Logs apiBase="http://localhost" />
      </LanguageProvider>,
    );
  });
  await act(async () => {
    jest.advanceTimersByTime(0);
    await Promise.resolve();
  });
  return { root, container };
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function statusRadio(container: HTMLElement, label: string): HTMLButtonElement {
  const group = container.querySelector('[role="radiogroup"][aria-label="Status"]');
  expect(group).not.toBeNull();
  const btn = [...group!.querySelectorAll("button")].find(el => el.textContent?.trim() === label);
  expect(btn).toBeTruthy();
  return btn as HTMLButtonElement;
}

test("Logs: Status 4xx hides 2xx/5xx and keeps 429", async () => {
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (!url.includes("/api/logs")) return new Response(null, { status: 404 });
    return jsonResponse([okLog, rateLimitedLog, serverErrorLog]);
  }) as typeof fetch;

  const { root, container } = await mountLogs();
  await flushMicrotasks();

  expect(container.textContent).toContain("gpt-ok");
  expect(container.textContent).toContain("gpt-rate");
  expect(container.textContent).toContain("gpt-fail");

  await act(async () => {
    statusRadio(container, "4xx").click();
  });
  await flushMicrotasks();

  expect(container.textContent).toContain("gpt-rate");
  expect(container.textContent).not.toContain("gpt-ok");
  expect(container.textContent).not.toContain("gpt-fail");
  expect(container.textContent).not.toContain("No requests match these filters.");

  await act(async () => {
    statusRadio(container, "5xx").click();
  });
  await flushMicrotasks();

  expect(container.textContent).toContain("gpt-fail");
  expect(container.textContent).not.toContain("gpt-ok");
  expect(container.textContent).not.toContain("gpt-rate");

  await act(async () => {
    statusRadio(container, "2xx").click();
  });
  await flushMicrotasks();

  expect(container.textContent).toContain("gpt-ok");
  expect(container.textContent).not.toContain("gpt-rate");
  expect(container.textContent).not.toContain("gpt-fail");

  await act(async () => { root.unmount(); });
});

test("Logs: Status filter with no matches shows dedicated empty copy", async () => {
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (!url.includes("/api/logs")) return new Response(null, { status: 404 });
    return jsonResponse([okLog]);
  }) as typeof fetch;

  const { root, container } = await mountLogs();
  await flushMicrotasks();
  expect(container.textContent).toContain("gpt-ok");

  await act(async () => {
    statusRadio(container, "5xx").click();
  });
  await flushMicrotasks();

  expect(container.textContent).toContain("No requests match these filters.");
  expect(container.textContent).not.toContain("No requests yet.");
  expect(container.textContent).not.toContain("gpt-ok");

  await act(async () => { root.unmount(); });
});
