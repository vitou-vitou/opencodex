# Codex Quota Recovery Account Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warn users before Codex quota exhaustion and let them select another already-authenticated account for new work without breaking thread affinity.

**Architecture:** Keep existing quota storage, routing, OAuth health, and account-switch API. Add a focused Codex quota-health projection that chooses the most restrictive window, attach redacted recovery data to existing account DTOs, then let the existing account-pool controller drive dashboard warnings and a recovery picker. CLI reads the same DTO through existing account commands.

**Tech Stack:** Bun-native TypeScript, React, Vite, existing management API, Bun test, GUI Vitest tests.

## Global Constraints

- Use only already-authenticated, user-authorized Codex accounts.
- Never expose OAuth access or refresh tokens.
- Never log request bodies, API keys, or full account identifiers.
- Existing Codex threads remain pinned to their original account.
- No disposable-email registration, verification-code automation, quota bypass, or unlimited-token claim.
- Preserve existing auto-switch behavior and `autoSwitchThreshold` configuration.
- Run `bun run typecheck`, `bun run test`, `bun run lint:gui`, and `bun run privacy:scan` before completion.

---

## File Map

- Create `src/codex/quota-recovery.ts`: pure quota-window selection, threshold state, account ordering, and notification dedupe primitives.
- Create `tests/codex-quota-recovery.test.ts`: backend projection and dedupe regression tests.
- Modify `src/codex/auth-api.ts`: attach redacted `quotaHealth` and recovery fields to existing account DTOs.
- Modify `gui/src/hooks/useCodexAccountPool.ts`: consume DTO health and expose recovery candidates/action state.
- Modify `gui/src/components/codex-account-pool-types.ts`: share exact recovery types with presentation components.
- Create `gui/src/components/CodexQuotaRecoveryNotice.tsx`: warning banner and recovery picker.
- Modify `gui/src/components/CodexAccountPool.tsx`: mount notice/picker, refresh before selection, preserve existing switch flow.
- Modify `gui/src/components/codex-account-pool-cards.tsx`: show quota-health badge and next action.
- Modify `gui/src/i18n/en.ts` and all locale files: add translated or safe English-fallback copy.
- Create `gui/tests/codex-quota-recovery.test.tsx`: picker, warning, disabled-account, and failure interaction tests.
- Modify `src/cli/account-extended.ts`: show quota-health state and recovery action in refresh output.
- Modify `tests/cli-codex-account-pin.test.ts` or the nearest existing CLI account test: assert redacted recovery output.
- Modify `docs-site/` provider/account guide selected by the docs structure: document thresholds, reset windows, and thread affinity.

### Task 1: Add pure Codex quota-health projection

**Files:**
- Create: `src/codex/quota-recovery.ts`
- Test: `tests/codex-quota-recovery.test.ts`

**Interfaces:**

```ts
export type CodexQuotaHealthStatus =
  | "healthy"
  | "warning"
  | "critical"
  | "exhausted"
  | "unknown";

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

export function selectMostRestrictiveQuotaWindow(
  windows: CodexQuotaWindow[],
): CodexQuotaWindow | null;

export function projectCodexQuotaHealth(input: {
  windows: CodexQuotaWindow[];
  updatedAt?: number;
  threshold: number;
  now?: number;
  staleAfterMs?: number;
}): CodexQuotaHealth;

export function canRecoverWithAccount(input: {
  hasCredential: boolean;
  needsReauth: boolean;
  quotaHealth: CodexQuotaHealth;
}): boolean;
```

- [ ] **Step 1: Write failing projection tests.** Cover no quota (`unknown`), 69% (`healthy`), 70% (`warning`), 80% (`critical`), 95% (`critical`), 100% (`exhausted`), stale data (`unknown` + `refresh`), and custom-window selection.

```ts
test("selects lowest remaining quota as controlling window", () => {
  expect(selectMostRestrictiveQuotaWindow([
    { label: "5h", percent: 42 },
    { label: "weekly", percent: 91 },
  ])).toEqual({ label: "5h", percent: 42 });
});

test("projects exhausted quota with wait action", () => {
  expect(projectCodexQuotaHealth({
    windows: [{ label: "30d", percent: 100, resetAt: 1_800_000_000_000 }],
    updatedAt: Date.now(),
    threshold: 80,
  })).toMatchObject({ status: "exhausted", action: "wait_for_reset", windowLabel: "30d" });
});
```

- [ ] **Step 2: Run focused tests and confirm failure.**

Run: `bun test tests/codex-quota-recovery.test.ts`

Expected: FAIL because `src/codex/quota-recovery.ts` does not exist.

- [ ] **Step 3: Implement pure projection.** Flatten 5h/weekly/monthly/custom windows at the call site, clamp percentages to `0..100`, select the highest percentage (tie-break by earliest reset), and classify `70..79` as `warning`, `80..94` as `critical`, `95..99` as `critical` with urgent action, and `100` as `exhausted`. Use the configured switch threshold for action recommendation, not for collapsing the health bands. Treat missing or stale quota as `unknown`; never infer remaining quota from absent data.

- [ ] **Step 4: Implement recovery eligibility.** Return false for missing credentials, reauth-required accounts, unknown quota, or exhausted quota. Return true for healthy/warning/critical accounts with valid credentials; a caller may still choose to switch early.

- [ ] **Step 5: Run focused tests.**

Run: `bun test tests/codex-quota-recovery.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/codex/quota-recovery.ts tests/codex-quota-recovery.test.ts
git commit -m "feat: project Codex quota recovery health"
```

### Task 2: Expose redacted recovery state through account DTOs

**Files:**
- Modify: `src/codex/auth-api.ts`
- Test: `tests/codex-auth-api.test.ts`

**Interfaces:**

Add to `CodexAuthAccountDto`:

```ts
quotaHealth: CodexQuotaHealth;
recoveryEligible: boolean;
```

- [ ] **Step 1: Add failing API assertions.** Extend existing account-list fixtures to assert `quotaHealth.status`, controlling window/reset, `recoveryEligible`, and masked email. Add a test proving the serialized DTO contains no token-like fields or raw account email/id.

- [ ] **Step 2: Run the focused API test.**

Run: `bun test tests/codex-auth-api.test.ts`

Expected: FAIL because `quotaHealth` is absent.

- [ ] **Step 3: Add a local `quotaWindowsForAccount` adapter in `src/codex/auth-api.ts`.** Convert `StoredAccountQuota` fields into `CodexQuotaWindow[]`, include `customWindows`, preserve reset timestamps, and pass the stored `updatedAt` to `projectCodexQuotaHealth`.

- [ ] **Step 4: Project pool and main account DTOs.** Use configured `autoSwitchThreshold ?? 80`; combine `hasCredential`, `needsReauth`, and quota health with `canRecoverWithAccount`. Keep existing OAuth `health` fields unchanged for compatibility.

- [ ] **Step 5: Return only safe fields.** Do not add credentials, access tokens, refresh tokens, raw account IDs, or unmasked emails. Keep existing `maskEmail` and account DTO behavior.

- [ ] **Step 6: Run focused tests.**

Run: `bun test tests/codex-auth-api.test.ts tests/codex-quota-recovery.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/codex/auth-api.ts tests/codex-auth-api.test.ts
git commit -m "feat: expose Codex quota recovery state"
```

### Task 3: Add dashboard warning and recovery picker

**Files:**
- Modify: `gui/src/components/codex-account-pool-types.ts`
- Modify: `gui/src/hooks/useCodexAccountPool.ts`
- Create: `gui/src/components/CodexQuotaRecoveryNotice.tsx`
- Modify: `gui/src/components/CodexAccountPool.tsx`
- Modify: `gui/src/components/codex-account-pool-cards.tsx`
- Modify: `gui/src/i18n/en.ts`, `gui/src/i18n/de.ts`, `gui/src/i18n/ja.ts`, `gui/src/i18n/ko.ts`, `gui/src/i18n/ru.ts`, `gui/src/i18n/zh.ts`
- Test: `gui/tests/codex-quota-recovery.test.tsx`

**Interfaces:**

```ts
export type CodexQuotaRecoveryCandidate = CodexAccountEntry & {
  quotaHealth: CodexQuotaHealth;
  recoveryEligible: boolean;
};

export type CodexQuotaRecoveryNoticeProps = {
  active: CodexAccountEntry | undefined;
  candidates: CodexQuotaRecoveryCandidate[];
  refreshing: boolean;
  onRefresh: () => void;
  onSelect: (account: CodexQuotaRecoveryCandidate) => void;
  onLogin: () => void;
};
```

- [ ] **Step 1: Add failing component tests.** Assert 70% warning copy, 95% urgent copy, exhausted picker visibility, masked emails, reset time, disabled reauth account, `Refresh quotas`, `Switch account`, and `Login another account` actions.

- [ ] **Step 2: Run GUI focused tests and confirm failure.**

Run: `cd gui; bun test tests/codex-quota-recovery.test.tsx`

Expected: FAIL because component and recovery fields are absent.

- [ ] **Step 3: Extend shared account types and hook parsing.** Treat missing server `quotaHealth` as `unknown` for backward compatibility. Expose `recoveryCandidates` sorted by: eligible first, lower controlling percentage first, earliest reset second, active account last.

- [ ] **Step 4: Build `CodexQuotaRecoveryNotice`.** Render only when active account is warning/critical/exhausted/unknown-stale. Show controlling window, percentage, reset time, auto-switch status, and next action. Use `role="alert"` for critical/exhausted and `role="status"` for warning.

- [ ] **Step 5: Wire selection to existing controller.** Refresh quotas first if candidate data is stale, then call existing `switchAccount`. On success close notice/picker and show existing confirmation toast. On failure preserve current account and show retryable error. Do not mutate an active thread.

- [ ] **Step 6: Add explicit continuation copy.** When the active account is exhausted, state that existing threads remain pinned and the action starts/uses a new session. Do not silently claim the current thread moved.

- [ ] **Step 7: Add locale keys.** Add exact keys for warning, critical, exhausted, stale, reset, picker title, switch action, new-session explanation, login action, and switch failure. Use existing locale conventions and English fallback only where the repository already allows it.

- [ ] **Step 8: Add card badges and test.** Reuse existing health/quota visual styles; do not create a second account list. Keep current `CodexAccountSwitchModal` for ordinary manual switching.

- [ ] **Step 9: Run GUI tests.**

Run: `cd gui; bun test tests/codex-quota-recovery.test.tsx tests/codex-account-pool-behaviour.test.tsx tests/codex-account-auto-switch.test.tsx`

Expected: PASS.

- [ ] **Step 10: Commit.**

```bash
git add gui/src/components/codex-account-pool-types.ts gui/src/hooks/useCodexAccountPool.ts gui/src/components/CodexQuotaRecoveryNotice.tsx gui/src/components/CodexAccountPool.tsx gui/src/components/codex-account-pool-cards.tsx gui/src/i18n gui/tests/codex-quota-recovery.test.tsx
git commit -m "feat(gui): add Codex quota recovery picker"
```

### Task 4: Add CLI recovery visibility

**Files:**
- Modify: `src/cli/account-api.ts`
- Modify: `src/cli/account-extended.ts`
- Test: `tests/cli-codex-account-pin.test.ts` or the existing test file that covers `ocx account refresh openai`

**Interfaces:**

The existing `/api/codex-auth/accounts` response remains the source. Human output adds fields in this form:

```text
account-id masked@email free 30d 82% resets 2026-08-30T21:02:00.000Z status=critical action=switch_account
```

JSON output preserves structured `quotaHealth` and `recoveryEligible` fields.

- [ ] **Step 1: Add failing human/JSON output tests.** Assert status, controlling window, reset time, and action are present; assert raw tokens and unmasked identifiers are absent.

- [ ] **Step 2: Run focused CLI test and confirm failure.**

Run: `bun test tests/cli-codex-account-pin.test.ts`

Expected: FAIL because refresh formatting ignores `quotaHealth`.

- [ ] **Step 3: Add `quotaHealthParts` formatter in `src/cli/account-extended.ts`.** Use existing `resetIso`, preserve `quota: unknown` when health is unknown, and append `status`/`action` only from safe DTO fields.

- [ ] **Step 4: Keep CLI action informational.** CLI must not create accounts or automate login. It may print `run ocx account refresh openai`, `login another account in dashboard`, or reset time based on server-provided action.

- [ ] **Step 5: Run CLI tests.**

Run: `bun test tests/cli-codex-account-pin.test.ts tests/cli-status-oauth-health.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/cli/account-api.ts src/cli/account-extended.ts tests/cli-codex-account-pin.test.ts
git commit -m "feat(cli): show Codex quota recovery state"
```

### Task 5: Document behavior and complete verification

**Files:**
- Modify: the existing docs-site guide covering Codex providers/accounts, identified before editing with `rg -n "Codex|account pool|quota|auto-switch" docs-site/src/content/docs`
- Modify: `README.md` only if the public feature summary needs a short link/update
- Test: repository verification commands

- [ ] **Step 1: Add documentation tests/checks if the docs site has an existing content-link or build test.** Otherwise manually verify the guide contains thresholds, quota-window semantics, reset behavior, account ownership, and thread affinity.

- [ ] **Step 2: Document exact behavior.** Explain 70/80/95/100 thresholds, automatic switching for new sessions, manual picker, reauth handling, stale quota, all-accounts-exhausted state, and that OpenCodex does not make provider limits unlimited.

- [ ] **Step 3: Run focused backend and GUI suites.**

Run: `bun test tests/codex-quota-recovery.test.ts tests/codex-auth-api.test.ts tests/cli-codex-account-pin.test.ts`

Expected: PASS.

Run: `cd gui; bun test tests/codex-quota-recovery.test.tsx tests/codex-account-pool-behaviour.test.tsx tests/codex-account-auto-switch.test.tsx`

Expected: PASS.

- [ ] **Step 4: Run required repository checks.**

```bash
bun run typecheck
bun run test
bun run lint:gui
bun run privacy:scan
```

Expected: all commands exit 0; no privacy scan findings.

- [ ] **Step 5: Inspect final diff.** Confirm only intended source, test, locale, and docs files changed; verify no token-like values or full account identifiers appear in snapshots, fixtures, logs, or copy.

- [ ] **Step 6: Commit documentation and verification-ready changes.**

```bash
git add docs-site README.md
git commit -m "docs: explain Codex quota recovery"
```

## Self-Review Checklist

- Spec coverage: projection, thresholds, dedupe primitive, API DTO, dashboard warning/picker, stale refresh, thread affinity, CLI output, privacy, tests, docs, and rollout all have tasks.
- Placeholder scan: no unresolved markers or undefined generic error-handling instruction remains.
- Type consistency: `CodexQuotaHealth` is created in Task 1, attached by Task 2, consumed by the GUI in Task 3, and formatted by the CLI in Task 4.
- Scope: implementation stays within the approved quota-recovery feature; account creation, disposable email, and quota bypass remain excluded.
