import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import type { Root } from "react-dom/client";
import CodexAccountPool from "../src/components/CodexAccountPool";
import type { CodexAccountEntry, CodexAccountPoolController } from "../src/hooks/useCodexAccountPool";
import { LanguageProvider } from "../src/i18n/provider";

const globals = ["document", "window", "navigator", "localStorage", "IS_REACT_ACT_ENVIRONMENT"] as const;
let previous: Record<(typeof globals)[number], unknown>;
let win: Window;
let host: HTMLElement;
let root: Root | null = null;

const resetAt = Date.UTC(2026, 6, 31, 12, 0, 0);

function account(overrides: Partial<CodexAccountEntry> = {}): CodexAccountEntry {
  return {
    id: "main",
    email: "m***@example.test",
    isMain: true,
    hasCredential: true,
    quota: null,
    quotaHealth: {
      status: "warning",
      percent: 70,
      windowLabel: "5h",
      resetAt,
      stale: false,
      action: "none",
    },
    recoveryEligible: true,
    ...overrides,
  };
}

function makeController(overrides: Partial<CodexAccountPoolController> = {}): CodexAccountPoolController {
  return {
    accounts: [account()],
    activeId: "__main__",
    loadState: "ready",
    switchingId: null,
    activeNeedsReauth: false,
    recoveryCandidates: [],
    load: async () => true,
    switchAccount: async (id) => ({ ok: true, activeId: id }),
    saveAlias: async () => ({ ok: true }),
    removeAccount: async () => ({ ok: true }),
    syncAfterAccountAdded: async () => ({ ok: true }),
    pauseRefresh: () => ({ __brand: "codex-pool-pause" }) as never,
    resumeRefresh: () => {},
    subscribeLoadObserver: () => () => {},
    readLastThreshold: () => 80,
    ...overrides,
  };
}

beforeEach(() => {
  previous = Object.fromEntries(globals.map(key => [key, Reflect.get(globalThis, key)])) as typeof previous;
  win = new Window({ url: "http://localhost/" });
  Object.defineProperty(win.navigator, "language", { configurable: true, value: "en-US" });
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: win.document },
    window: { configurable: true, value: win },
    navigator: { configurable: true, value: win.navigator },
    localStorage: { configurable: true, value: win.localStorage },
  });
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = win.document.createElement("div") as unknown as HTMLElement;
  win.document.body.appendChild(host as never);
});

afterEach(async () => {
  if (root) {
    const current = root;
    await act(async () => { current.unmount(); });
    root = null;
  }
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  for (const key of globals) {
    Object.defineProperty(globalThis, key, { configurable: true, value: previous[key] });
  }
  await win.happyDOM?.close?.();
});

async function mount(controller: CodexAccountPoolController) {
  const { createRoot } = await import("react-dom/client");
  await act(async () => {
    root = createRoot(host);
    root.render(<LanguageProvider><CodexAccountPool apiBase="" controller={controller} /></LanguageProvider>);
  });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find(item => item.textContent?.trim() === label);
  expect(found).toBeTruthy();
  return found as HTMLButtonElement;
}

test("shows a status warning at 70 percent with its controlling window and reset time", async () => {
  await mount(makeController());

  const notice = host.querySelector('[role="status"]');
  expect(notice?.textContent).toContain("Quota warning");
  expect(notice?.textContent).toContain("5h");
  expect(notice?.textContent).toContain("70%");
  expect(notice?.textContent).toContain(new Date(resetAt).toLocaleString("en-US"));
  expect(notice?.textContent).toContain("Auto-switch is available for new sessions");
  expect(button("Refresh quotas")).toBeTruthy();
});

test("shows urgent exhausted recovery picker with masked accounts and disabled reauthentication", async () => {
  const active = account({
    quotaHealth: { status: "exhausted", percent: 100, windowLabel: "weekly", resetAt, stale: false, action: "wait_for_reset" },
  });
  const eligible = account({
    id: "ready",
    email: "r***@example.test",
    isMain: false,
    plan: "Plus",
    quotaHealth: { status: "critical", percent: 95, windowLabel: "5h", resetAt, stale: false, action: "switch_account" },
  });
  const reauth = account({
    id: "reauth",
    email: "r***2@example.test",
    isMain: false,
    needsReauth: true,
    recoveryEligible: false,
    quotaHealth: { status: "unknown", stale: false, action: "refresh" },
  });
  await mount(makeController({ accounts: [active, eligible, reauth], activeId: "__main__", recoveryCandidates: [eligible, reauth] }));

  const notice = host.querySelector('[role="alert"]');
  expect(notice?.textContent).toContain("Quota exhausted");
  expect(notice?.textContent).toContain("Existing threads remain pinned to this account");
  expect(notice?.textContent).toContain("new session");
  await act(async () => { button("Switch account").click(); });

  expect(host.textContent).toContain("Choose an account for a new session");
  expect(host.textContent).toContain("r***@example.test");
  expect(host.textContent).toContain("Plus");
  expect(host.textContent).toContain("95%");
  expect(host.textContent).toContain(new Date(resetAt).toLocaleString("en-US"));
  const reauthOption = host.querySelector('[data-recovery-account="reauth"]') as HTMLButtonElement | null;
  expect(reauthOption?.disabled).toBe(true);
  expect(reauthOption?.textContent).toContain("Reauthentication required");
  expect(button("Login another account")).toBeTruthy();
});

test("refreshes stale quota before a successful recovery switch and shows the existing confirmation toast", async () => {
  const candidate = account({
    id: "stale",
    email: "s***@example.test",
    isMain: false,
    quotaHealth: { status: "warning", percent: 72, windowLabel: "5h", resetAt, stale: true, action: "refresh" },
  });
  const calls: string[] = [];
  await mount(makeController({
    accounts: [account({ quotaHealth: { status: "critical", percent: 95, windowLabel: "5h", resetAt, stale: false, action: "switch_account" } }), candidate],
    recoveryCandidates: [candidate],
    load: async refresh => { calls.push(`load:${String(refresh)}`); return true; },
    switchAccount: async id => { calls.push(`switch:${id}`); return { ok: true, activeId: id }; },
  }));

  await act(async () => { button("Switch account").click(); });
  await act(async () => { (host.querySelector('[data-recovery-account="stale"]') as HTMLButtonElement).click(); });

  expect(calls).toEqual(["load:true", "switch:stale"]);
  expect(host.textContent).toContain("s***@example.test is selected for the next request");
  expect(host.querySelector(".quota-recovery-picker")).toBeNull();
});

test("keeps the picker open and offers a retryable error when recovery switching fails", async () => {
  const candidate = account({ id: "backup", email: "b***@example.test", isMain: false });
  await mount(makeController({
    accounts: [account({ quotaHealth: { status: "critical", percent: 95, windowLabel: "5h", resetAt, stale: false, action: "switch_account" } }), candidate],
    recoveryCandidates: [candidate],
    switchAccount: async () => ({ ok: false, reason: "request" }),
  }));

  await act(async () => { button("Switch account").click(); });
  await act(async () => { (host.querySelector('[data-recovery-account="backup"]') as HTMLButtonElement).click(); });

  expect(host.querySelector(".quota-recovery-picker")).toBeTruthy();
  expect(host.textContent).toContain("Could not switch accounts. Try again.");
});
