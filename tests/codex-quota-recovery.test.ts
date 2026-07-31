import { describe, expect, test } from "bun:test";
import {
  canRecoverWithAccount,
  projectCodexQuotaHealth,
  selectMostRestrictiveQuotaWindow,
} from "../src/codex/quota-recovery";

const NOW = 1_800_000_000_000;
const RESET_LATE = NOW + 2 * 60 * 60_000;
const RESET_EARLY = NOW + 60 * 60_000;

function project(percent: number, overrides: Partial<Parameters<typeof projectCodexQuotaHealth>[0]> = {}) {
  return projectCodexQuotaHealth({
    windows: [{ label: "weekly", percent }],
    updatedAt: NOW,
    threshold: 80,
    now: NOW,
    ...overrides,
  });
}

describe("selectMostRestrictiveQuotaWindow", () => {
  test("selects the highest percentage window", () => {
    expect(selectMostRestrictiveQuotaWindow([
      { label: "5h", percent: 42 },
      { label: "weekly", percent: 91 },
    ])).toEqual({ label: "weekly", percent: 91 });
  });

  test("clamps percentages before selecting and returns a clamped window", () => {
    expect(selectMostRestrictiveQuotaWindow([
      { label: "low", percent: -10 },
      { label: "high", percent: 120 },
    ])).toEqual({ label: "high", percent: 100 });
  });

  test("breaks equal-percentage ties by earliest reset", () => {
    expect(selectMostRestrictiveQuotaWindow([
      { label: "late", percent: 80, resetAt: RESET_LATE },
      { label: "early", percent: 80, resetAt: RESET_EARLY },
    ])).toEqual({ label: "early", percent: 80, resetAt: RESET_EARLY });
  });

  test("prefers a reset timestamp over an otherwise tied window without one", () => {
    expect(selectMostRestrictiveQuotaWindow([
      { label: "unknown-reset", percent: 80 },
      { label: "known-reset", percent: 80, resetAt: RESET_EARLY },
    ])).toEqual({ label: "known-reset", percent: 80, resetAt: RESET_EARLY });
  });

  test("returns null when no windows are available", () => {
    expect(selectMostRestrictiveQuotaWindow([])).toBeNull();
  });
});

describe("projectCodexQuotaHealth", () => {
  test("projects missing quota as unknown and asks for a refresh", () => {
    expect(projectCodexQuotaHealth({ windows: [], threshold: 80, now: NOW })).toEqual({
      status: "unknown",
      stale: false,
      action: "refresh",
    });
  });

  test.each([
    [69, "healthy", "none"],
    [70, "warning", "none"],
    [80, "critical", "switch_account"],
    [94, "critical", "switch_account"],
    [95, "critical", "switch_account"],
    [99, "critical", "switch_account"],
    [100, "exhausted", "wait_for_reset"],
  ] as const)("classifies %d percent as %s with %s action", (percent, status, action) => {
    expect(project(percent)).toMatchObject({ status, percent, action });
  });

  test("uses a custom threshold for switching without changing health bands", () => {
    expect(projectCodexQuotaHealth({
      windows: [{ label: "weekly", percent: 50 }],
      threshold: 50,
      updatedAt: NOW,
      now: NOW,
    })).toMatchObject({ status: "healthy", percent: 50, action: "switch_account" });
  });

  test("marks old quota as stale and asks for a refresh", () => {
    expect(projectCodexQuotaHealth({
      windows: [{ label: "weekly", percent: 80, resetAt: RESET_EARLY }],
      updatedAt: NOW - 1_001,
      threshold: 80,
      now: NOW,
      staleAfterMs: 1_000,
    })).toEqual({
      status: "unknown",
      updatedAt: NOW - 1_001,
      stale: true,
      action: "refresh",
    });
  });

  test("includes the controlling window, reset, and update timestamp", () => {
    expect(projectCodexQuotaHealth({
      windows: [
        { label: "5h", percent: 25, resetAt: RESET_LATE },
        { label: "custom", percent: 95, resetAt: RESET_EARLY },
      ],
      updatedAt: NOW,
      threshold: 80,
      now: NOW,
    })).toEqual({
      status: "critical",
      percent: 95,
      windowLabel: "custom",
      resetAt: RESET_EARLY,
      updatedAt: NOW,
      stale: false,
      action: "switch_account",
    });
  });
});

describe("canRecoverWithAccount", () => {
  const validQuota = project(70);

  test("requires a credential and no reauthentication", () => {
    expect(canRecoverWithAccount({ hasCredential: false, needsReauth: false, quotaHealth: validQuota })).toBe(false);
    expect(canRecoverWithAccount({ hasCredential: true, needsReauth: true, quotaHealth: validQuota })).toBe(false);
  });

  test("rejects unknown and exhausted quota", () => {
    const unknown = projectCodexQuotaHealth({ windows: [], threshold: 80, now: NOW });
    const exhausted = project(100);
    expect(canRecoverWithAccount({ hasCredential: true, needsReauth: false, quotaHealth: unknown })).toBe(false);
    expect(canRecoverWithAccount({ hasCredential: true, needsReauth: false, quotaHealth: exhausted })).toBe(false);
  });

  test("accepts healthy, warning, and critical quota for a valid account", () => {
    for (const percent of [0, 70, 80, 95]) {
      expect(canRecoverWithAccount({
        hasCredential: true,
        needsReauth: false,
        quotaHealth: project(percent),
      })).toBe(true);
    }
  });
});
