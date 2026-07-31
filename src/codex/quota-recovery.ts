export type CodexQuotaHealthStatus = "healthy" | "warning" | "critical" | "exhausted" | "unknown";

export type CodexQuotaWindow = {
  label: string;
  percent: number;
  resetAt?: number;
};

export type CodexQuotaHealth = {
  status: CodexQuotaHealthStatus;
  percent?: number;
  windowLabel?: string;
  resetAt?: number;
  updatedAt?: number;
  stale: boolean;
  action: "none" | "refresh" | "switch_account" | "wait_for_reset";
};

const DEFAULT_STALE_AFTER_MS = 5 * 60_000;

function clampPercent(percent: number): number | undefined {
  if (!Number.isFinite(percent)) return undefined;
  return Math.max(0, Math.min(100, percent));
}

function hasEarlierReset(left: CodexQuotaWindow, right: CodexQuotaWindow): boolean {
  if (left.resetAt === undefined) return false;
  return right.resetAt === undefined || left.resetAt < right.resetAt;
}

export function selectMostRestrictiveQuotaWindow(windows: CodexQuotaWindow[]): CodexQuotaWindow | null {
  let selected: CodexQuotaWindow | null = null;
  let selectedPercent: number | undefined;

  for (const window of windows) {
    const percent = clampPercent(window.percent);
    if (percent === undefined) continue;
    if (
      selected === null
      || selectedPercent === undefined
      || percent > selectedPercent
      || (percent === selectedPercent && hasEarlierReset(window, selected))
    ) {
      selected = { ...window, percent };
      selectedPercent = percent;
    }
  }

  return selected;
}

export function projectCodexQuotaHealth(input: {
  windows: CodexQuotaWindow[];
  updatedAt?: number;
  threshold: number;
  now?: number;
  staleAfterMs?: number;
}): CodexQuotaHealth {
  const selected = selectMostRestrictiveQuotaWindow(input.windows);
  const now = input.now ?? Date.now();
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const stale = input.updatedAt !== undefined
    && Number.isFinite(input.updatedAt)
    && Number.isFinite(now)
    && now - input.updatedAt > staleAfterMs;
  const common = input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt };

  if (selected === null || stale) {
    return {
      status: "unknown",
      ...common,
      stale,
      action: "refresh",
    };
  }

  const { percent } = selected;
  const status: CodexQuotaHealthStatus = percent >= 100
    ? "exhausted"
    : percent >= 80
      ? "critical"
      : percent >= 70
        ? "warning"
        : "healthy";
  const threshold = Number.isFinite(input.threshold)
    ? Math.max(0, Math.min(100, input.threshold))
    : 80;
  const action = status === "exhausted"
    ? "wait_for_reset"
    : threshold > 0 && percent >= threshold
      ? "switch_account"
      : "none";

  return {
    status,
    percent,
    windowLabel: selected.label,
    ...(selected.resetAt === undefined ? {} : { resetAt: selected.resetAt }),
    ...common,
    stale: false,
    action,
  };
}

export function canRecoverWithAccount(input: {
  hasCredential: boolean;
  needsReauth: boolean;
  quotaHealth: CodexQuotaHealth;
}): boolean {
  if (!input.hasCredential || input.needsReauth) return false;
  return input.quotaHealth.status !== "unknown" && input.quotaHealth.status !== "exhausted";
}
