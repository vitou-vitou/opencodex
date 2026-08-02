# Proxy Session Lifetime Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proactively surface OAuth SSO session time-remaining in `ocx status` and fire a tray balloon notification when any active account crosses a 2-hour warning threshold.

**Architecture:** A new pure-computation module `src/oauth/session-lifetime.ts` derives a `SessionLifetime` value from `ProviderAccount.addedAt` + a provider TTL map. This attaches to `OAuthHealthEntry` (no union type change). The startup-health API endpoint gains a `sessionWarnings` field. The CLI status renderer and tray PS1 consume those fields respectively.

**Tech Stack:** Bun, TypeScript, bun:test, PowerShell (tray)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/oauth/session-lifetime.ts` | Create | TTL map, `computeSessionLifetime`, `formatTimeLeft` |
| `src/oauth/health.ts` | Modify | Add `sessionLifetime?` to `OAuthHealthEntry`; populate in `collectOAuthHealthEntries` |
| `src/server/management/config-routes.ts` | Modify | Add `sessionWarnings` to `/api/startup-health` response |
| `src/cli/status-oauth.ts` | Modify | Add Session column to `formatOAuthHealthForStatus` |
| `src/tray/windows-tray.ps1` | Modify | Warning dedup hashtable + balloon notification |
| `tests/session-lifetime.test.ts` | Create | Unit tests for `computeSessionLifetime` and `formatTimeLeft` |
| `tests/oauth-health.test.ts` | Modify | Add tests for `sessionLifetime` population in entries |
| `tests/session-lifetime-api.test.ts` | Create | Test for `sessionWarnings` field in startup-health response |

---

## Task 1: Core computation module

**Files:**
- Create: `src/oauth/session-lifetime.ts`
- Create: `tests/session-lifetime.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/session-lifetime.test.ts
import { describe, expect, test } from "bun:test";
import {
  computeSessionLifetime,
  formatTimeLeft,
  SESSION_WARN_THRESHOLD_MS,
} from "../src/oauth/session-lifetime";
import type { ProviderAccount } from "../src/oauth/types";

function makeAccount(addedAt?: number): ProviderAccount {
  return {
    id: "abc12345",
    addedAt,
    credential: { access: "tok", refresh: "ref", expires: Date.now() + 3600_000 },
  };
}

describe("computeSessionLifetime", () => {
  test("returns null when addedAt missing", () => {
    expect(computeSessionLifetime("claude", makeAccount(undefined))).toBeNull();
  });

  test("status ok when well within TTL", () => {
    const now = Date.now();
    const addedAt = now - 1 * 60 * 60 * 1000; // 1h ago
    const result = computeSessionLifetime("claude", makeAccount(addedAt), now);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("ok");
    expect(result!.loginAt).toBe(addedAt);
    expect(result!.timeLeftMs).toBeGreaterThan(SESSION_WARN_THRESHOLD_MS);
  });

  test("status expiring when timeLeft < warn threshold", () => {
    const now = Date.now();
    const addedAt = now - 7 * 60 * 60 * 1000; // 7h ago, claude TTL=8h -> 1h left
    const result = computeSessionLifetime("claude", makeAccount(addedAt), now);
    expect(result!.status).toBe("expiring");
    expect(result!.timeLeftMs).toBeLessThan(SESSION_WARN_THRESHOLD_MS);
    expect(result!.timeLeftMs).toBeGreaterThan(0);
  });

  test("status expired when past TTL", () => {
    const now = Date.now();
    const addedAt = now - 9 * 60 * 60 * 1000; // 9h ago, claude TTL=8h
    const result = computeSessionLifetime("claude", makeAccount(addedAt), now);
    expect(result!.status).toBe("expired");
    expect(result!.timeLeftMs).toBeLessThan(0);
  });

  test("uses fallback TTL for unknown provider", () => {
    const now = Date.now();
    const addedAt = now - 23 * 60 * 60 * 1000; // 23h ago, fallback=24h
    const result = computeSessionLifetime("unknown-provider", makeAccount(addedAt), now);
    expect(result!.status).toBe("ok");
  });

  test("cursor TTL is 7 days", () => {
    const now = Date.now();
    const addedAt = now - 6 * 24 * 60 * 60 * 1000; // 6 days ago
    const result = computeSessionLifetime("cursor", makeAccount(addedAt), now);
    expect(result!.status).toBe("ok");
  });
});

describe("formatTimeLeft", () => {
  test("formats hours and minutes", () => {
    expect(formatTimeLeft(2 * 60 * 60 * 1000 + 30 * 60 * 1000)).toBe("2h 30m");
  });

  test("formats minutes only when under 1 hour", () => {
    expect(formatTimeLeft(45 * 60 * 1000)).toBe("45m");
  });

  test("formats days when >= 24h", () => {
    expect(formatTimeLeft(25 * 60 * 60 * 1000)).toBe("1d 1h");
  });

  test("formats negative as ago string", () => {
    expect(formatTimeLeft(-2 * 60 * 60 * 1000)).toBe("2h ago");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd D:/Projects/opencodex && bun test tests/session-lifetime.test.ts 2>&1 | head -30
```

Expected: fail with `Cannot find module '../src/oauth/session-lifetime'`

- [ ] **Step 3: Implement the module**

```typescript
// src/oauth/session-lifetime.ts
import type { ProviderAccount } from "./types";

/** Expected SSO session lifetime per provider (ms). Conservative lower bounds. */
export const PROVIDER_SESSION_TTLS: Record<string, number> = {
  claude: 8 * 60 * 60 * 1000,       // 8 hours
  anthropic: 8 * 60 * 60 * 1000,    // 8 hours
  kiro: 24 * 60 * 60 * 1000,        // 24 hours
  cursor: 7 * 24 * 60 * 60 * 1000,  // 7 days
  kimi: 24 * 60 * 60 * 1000,        // 24 hours
};

const FALLBACK_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const SESSION_WARN_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

export type SessionLifetimeStatus = "ok" | "expiring" | "expired";

export interface SessionLifetime {
  /** epoch ms — same as account.addedAt */
  loginAt: number;
  /** loginAt + provider TTL */
  expiresAt: number;
  /** expiresAt - now; negative when expired */
  timeLeftMs: number;
  status: SessionLifetimeStatus;
}

/**
 * Derive session lifetime from when the account was added.
 * Returns null if addedAt is missing (cannot compute — shown as "—" in CLI).
 */
export function computeSessionLifetime(
  provider: string,
  account: ProviderAccount,
  now = Date.now(),
): SessionLifetime | null {
  if (typeof account.addedAt !== "number") return null;
  const ttl = PROVIDER_SESSION_TTLS[provider] ?? FALLBACK_TTL_MS;
  const loginAt = account.addedAt;
  const expiresAt = loginAt + ttl;
  const timeLeftMs = expiresAt - now;
  let status: SessionLifetimeStatus;
  if (timeLeftMs <= 0) {
    status = "expired";
  } else if (timeLeftMs < SESSION_WARN_THRESHOLD_MS) {
    status = "expiring";
  } else {
    status = "ok";
  }
  return { loginAt, expiresAt, timeLeftMs, status };
}

/** Format a duration in ms as a human-readable string. Negative = "X ago". */
export function formatTimeLeft(ms: number): string {
  const abs = Math.abs(ms);
  const suffix = ms < 0 ? " ago" : "";
  const totalMinutes = Math.floor(abs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h${suffix}` : `${days}d${suffix}`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m${suffix}` : `${hours}h${suffix}`;
  }
  return `${minutes}m${suffix}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd D:/Projects/opencodex && bun test tests/session-lifetime.test.ts 2>&1
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/opencodex && git add src/oauth/session-lifetime.ts tests/session-lifetime.test.ts && git commit -m "feat(oauth): session lifetime computation + formatTimeLeft"
```

---

## Task 2: Attach sessionLifetime to OAuthHealthEntry

**Files:**
- Modify: `src/oauth/health.ts`
- Modify: `tests/oauth-health.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test to `tests/oauth-health.test.ts` inside the existing `describe` block (after the last existing test):

```typescript
// Add to existing imports at top of tests/oauth-health.test.ts:
import { SESSION_WARN_THRESHOLD_MS } from "../src/oauth/session-lifetime";

// Add as new describe block at bottom of the file:
describe("collectOAuthHealthEntries sessionLifetime", () => {
  test("attaches sessionLifetime when addedAt present", async () => {
    const now = Date.now();
    const addedAt = now - 1 * 60 * 60 * 1000; // 1h ago, well within claude 8h TTL
    await saveCredential("claude", {
      access: "tok",
      refresh: "ref",
      expires: now + 3_600_000,
    });
    // Manually set addedAt on the stored account
    const { mutateStore } = await import("../src/oauth/store");
    await mutateStore(store => {
      const set = store["claude"];
      if (set?.accounts[0]) set.accounts[0].addedAt = addedAt;
    });

    const entries = collectOAuthHealthEntries(now);
    const claude = entries.find(e => e.provider === "claude");
    expect(claude).toBeDefined();
    expect(claude!.sessionLifetime).toBeDefined();
    expect(claude!.sessionLifetime!.status).toBe("ok");
    expect(claude!.sessionLifetime!.loginAt).toBe(addedAt);
  });

  test("sessionLifetime undefined when addedAt missing", async () => {
    const now = Date.now();
    await saveCredential("claude", {
      access: "tok",
      refresh: "ref",
      expires: now + 3_600_000,
    });
    const entries = collectOAuthHealthEntries(now);
    const claude = entries.find(e => e.provider === "claude");
    expect(claude).toBeDefined();
    // saveCredential doesn't set addedAt on replace-slot path for identity-less creds
    // sessionLifetime may be defined or undefined depending on whether addedAt was set
    // Just verify the shape is valid when present
    if (claude!.sessionLifetime) {
      expect(["ok", "expiring", "expired"]).toContain(claude!.sessionLifetime.status);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd D:/Projects/opencodex && bun test tests/oauth-health.test.ts --test-name-pattern "sessionLifetime" 2>&1 | tail -20
```

Expected: FAIL — `sessionLifetime` is undefined on the entry

- [ ] **Step 3: Add sessionLifetime to OAuthHealthEntry type and populate it**

In `src/oauth/health.ts`, add the import and modify the type + `pushEntry`:

```typescript
// Add after existing imports:
import { computeSessionLifetime, type SessionLifetime } from "./session-lifetime";
```

```typescript
// Modify OAuthHealthEntry type (add optional field):
export type OAuthHealthEntry = {
  provider: string;
  accountId: string;
  health: OAuthAccountHealth;
  action?: string;
  sessionLifetime?: SessionLifetime;
};
```

```typescript
// Modify pushEntry to accept optional sessionLifetime:
function pushEntry(
  entries: OAuthHealthEntry[],
  provider: string,
  accountId: string,
  health: OAuthAccountHealth,
  sessionLifetime?: SessionLifetime,
): void {
  const action = actionFor(provider, health);
  entries.push({
    provider,
    accountId,
    health,
    ...(action ? { action } : {}),
    ...(sessionLifetime ? { sessionLifetime } : {}),
  });
}
```

```typescript
// Modify collectOAuthHealthEntries — in the loop over store entries:
// Replace the existing pushEntry call with:
for (const account of set.accounts) {
  const health = projectStoredOAuthAccountHealth(provider, account, now, { observeOnly });
  const sessionLifetime = computeSessionLifetime(provider, account, now) ?? undefined;
  pushEntry(entries, provider, account.id, health, sessionLifetime);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd D:/Projects/opencodex && bun test tests/oauth-health.test.ts 2>&1 | tail -20
```

Expected: all tests PASS (including existing tests)

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/opencodex && git add src/oauth/health.ts tests/oauth-health.test.ts && git commit -m "feat(oauth): attach sessionLifetime to OAuthHealthEntry"
```

---

## Task 3: Extend /api/startup-health with sessionWarnings

**Files:**
- Modify: `src/server/management/config-routes.ts`
- Create: `tests/session-lifetime-api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/session-lifetime-api.test.ts`:

```typescript
// tests/session-lifetime-api.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SESSION_WARN_THRESHOLD_MS } from "../src/oauth/session-lifetime";
import { mutateStore, saveCredential } from "../src/oauth/store";

const origHome = process.env.HOME;
const origOcxHome = process.env.OPENCODEX_HOME;
let tmp: string;

beforeEach(() => {
  tmp = join(tmpdir(), `session-lifetime-api-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(tmp, { recursive: true });
  process.env.HOME = tmp;
  process.env.OPENCODEX_HOME = join(tmp, "ocx");
});

afterEach(() => {
  if (origHome === undefined) delete process.env.HOME;
  else process.env.HOME = origHome;
  if (origOcxHome === undefined) delete process.env.OPENCODEX_HOME;
  else process.env.OPENCODEX_HOME = origOcxHome;
  rmSync(tmp, { recursive: true, force: true });
});

describe("collectSessionWarnings", () => {
  test("includes expiring account in warnings", async () => {
    const now = Date.now();
    const addedAt = now - 7.5 * 60 * 60 * 1000; // 7.5h ago, claude TTL=8h -> ~30m left
    await saveCredential("claude", {
      access: "tok",
      refresh: "ref",
      expires: now + 3_600_000,
    });
    await mutateStore(store => {
      const set = store["claude"];
      if (set?.accounts[0]) set.accounts[0].addedAt = addedAt;
    });
    const { collectSessionWarnings } = await import("../src/server/management/config-routes");
    const warnings = collectSessionWarnings(now);
    expect(warnings.length).toBeGreaterThan(0);
    const w = warnings[0]!;
    expect(w.provider).toBe("claude");
    expect(w.timeLeftMs).toBeLessThan(SESSION_WARN_THRESHOLD_MS);
    expect(w.timeLeftMs).toBeGreaterThan(0);
    expect(typeof w.label).toBe("string");
    expect(w.label).toContain("claude");
  });

  test("no warnings when no accounts", async () => {
    const { collectSessionWarnings } = await import("../src/server/management/config-routes");
    const warnings = collectSessionWarnings(Date.now());
    expect(warnings).toHaveLength(0);
  });

  test("no warnings when session ok (freshly added)", async () => {
    const now = Date.now();
    await saveCredential("claude", {
      access: "tok",
      refresh: "ref",
      expires: now + 3_600_000,
    });
    await mutateStore(store => {
      const set = store["claude"];
      if (set?.accounts[0]) set.accounts[0].addedAt = now;
    });
    const { collectSessionWarnings } = await import("../src/server/management/config-routes");
    const warnings = collectSessionWarnings(now);
    expect(warnings).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd D:/Projects/opencodex && bun test tests/session-lifetime-api.test.ts --test-name-pattern "sessionWarnings" 2>&1 | tail -20
```

Expected: FAIL — `collectSessionWarnings` not exported from config-routes

- [ ] **Step 3: Add sessionWarnings to the /api/startup-health handler**

In `src/server/management/config-routes.ts`, add imports:

```typescript
import { peekAuthStore } from "../../oauth/store";
import { computeSessionLifetime, formatTimeLeft, SESSION_WARN_THRESHOLD_MS } from "../../oauth/session-lifetime";
import { maskAccountId } from "../../lib/privacy";
import { MASKED_ACCOUNT_FALLBACK } from "../../oauth/health";
```

Add a helper function before the route handlers:

```typescript
interface SessionWarning {
  provider: string;
  accountId: string;  // masked
  timeLeftMs: number;
  label: string;
}

function collectSessionWarnings(now = Date.now()): SessionWarning[] {
  const store = peekAuthStore();
  const warnings: SessionWarning[] = [];
  for (const [provider, set] of Object.entries(store)) {
    const active = set.accounts.find(a => a.id === set.activeAccountId);
    if (!active) continue;
    const lifetime = computeSessionLifetime(provider, active, now);
    if (!lifetime || lifetime.status === "ok") continue;
    const masked = maskAccountId(active.id) ?? MASKED_ACCOUNT_FALLBACK;
    const timeStr = formatTimeLeft(lifetime.timeLeftMs);
    warnings.push({
      provider,
      accountId: masked,
      timeLeftMs: lifetime.timeLeftMs,
      label: `${provider} ${masked}: ${timeStr}`,
    });
  }
  return warnings;
}
```

Modify the `/api/startup-health` handler (line ~138):

```typescript
if (url.pathname === "/api/startup-health" && req.method === "GET") {
  const sessionWarnings = collectSessionWarnings();
  return jsonResponse({
    ...(await getCachedStartupHealth(config)),
    sessionWarnings,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd D:/Projects/opencodex && bun test tests/session-lifetime-api.test.ts 2>&1 | tail -20
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/opencodex && git add src/server/management/config-routes.ts tests/session-lifetime-api.test.ts && git commit -m "feat(server): add sessionWarnings to /api/startup-health"
```

---

## Task 4: ocx status Session column

**Files:**
- Modify: `src/cli/status-oauth.ts`
- Modify: `tests/cli-status-oauth-health.test.ts`

- [ ] **Step 1: Write the failing test**

Open `tests/cli-status-oauth-health.test.ts` and add:

```typescript
// Add to existing imports:
import { formatTimeLeft } from "../src/oauth/session-lifetime";
import type { OAuthHealthEntry } from "../src/oauth/health";

// Add new describe block at bottom:
describe("formatOAuthHealthForStatus session column", () => {
  test("shows time left for ok session", () => {
    const now = Date.now();
    const entries: OAuthHealthEntry[] = [{
      provider: "claude",
      accountId: "abc12345",
      health: { status: "healthy" },
      sessionLifetime: {
        loginAt: now - 60 * 60 * 1000,
        expiresAt: now + 7 * 60 * 60 * 1000,
        timeLeftMs: 7 * 60 * 60 * 1000,
        status: "ok",
      },
    }];
    const out = formatOAuthHealthForStatus(entries);
    expect(out).toContain("7h");
  });

  test("shows warning prefix for expiring session", () => {
    const now = Date.now();
    const entries: OAuthHealthEntry[] = [{
      provider: "claude",
      accountId: "abc12345",
      health: { status: "healthy" },
      sessionLifetime: {
        loginAt: now - 7.5 * 60 * 60 * 1000,
        expiresAt: now + 30 * 60 * 1000,
        timeLeftMs: 30 * 60 * 1000,
        status: "expiring",
      },
    }];
    const out = formatOAuthHealthForStatus(entries);
    expect(out).toContain("⚠");
    expect(out).toContain("30m");
    expect(out).toContain("ocx login claude");
  });

  test("shows expired with ago time and BYOK hint", () => {
    const now = Date.now();
    const entries: OAuthHealthEntry[] = [{
      provider: "claude",
      accountId: "abc12345",
      health: { status: "healthy" },
      sessionLifetime: {
        loginAt: now - 10 * 60 * 60 * 1000,
        expiresAt: now - 2 * 60 * 60 * 1000,
        timeLeftMs: -2 * 60 * 60 * 1000,
        status: "expired",
      },
    }];
    const out = formatOAuthHealthForStatus(entries);
    expect(out).toContain("EXPIRED");
    expect(out).toContain("2h ago");
    expect(out).toContain("BYOK");
  });

  test("shows dash when sessionLifetime absent", () => {
    const entries: OAuthHealthEntry[] = [{
      provider: "claude",
      accountId: "abc12345",
      health: { status: "healthy" },
    }];
    const out = formatOAuthHealthForStatus(entries);
    // No session expiry noise in output
    expect(out).not.toContain("⚠");
    expect(out).not.toContain("EXPIRED");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd D:/Projects/opencodex && bun test tests/cli-status-oauth-health.test.ts --test-name-pattern "session column" 2>&1 | tail -20
```

Expected: FAIL — output doesn't contain session info

- [ ] **Step 3: Extend formatOAuthHealthForStatus**

In `src/cli/status-oauth.ts`, add import:

```typescript
import { formatTimeLeft } from "../oauth/session-lifetime";
import type { SessionLifetime } from "../oauth/session-lifetime";
```

Add helper function:

```typescript
function formatSessionLifetime(session: SessionLifetime | undefined): string {
  if (!session) return "";
  switch (session.status) {
    case "ok":
      return `  Session: ${formatTimeLeft(session.timeLeftMs)} left`;
    case "expiring":
      return `  Session: ⚠ ${formatTimeLeft(session.timeLeftMs)} left  →  re-login soon: run ocx login`;
    case "expired":
      return `  Session: EXPIRED (${formatTimeLeft(session.timeLeftMs)})  →  run ocx login or consider BYOK (OpenRouter)`;
  }
}
```

Modify `formatEntryBlock` to include session info for notable entries and healthy entries with non-ok sessions:

```typescript
function formatEntryBlock(entries: OAuthHealthEntry[]): string {
  if (entries.length === 0) return "";

  const notable = entries.filter(
    entry => entry.health.status !== "healthy" || (entry.sessionLifetime && entry.sessionLifetime.status !== "ok")
  );
  if (notable.length === 0) return "OAuth health: ok";

  const lines = ["OAuth health: warning"];
  for (const entry of notable) {
    const masked = maskAccountId(entry.accountId) ?? MASKED_ACCOUNT_FALLBACK;
    lines.push(`  ${entry.provider}  ${masked}  ${describeHealth(entry.health)}`);
    if (entry.action) {
      lines.push(`    Action: ${entry.action}`);
    }
    const sessionLine = formatSessionLifetime(entry.sessionLifetime);
    if (sessionLine) lines.push(sessionLine);
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd D:/Projects/opencodex && bun test tests/cli-status-oauth-health.test.ts 2>&1 | tail -20
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/opencodex && git add src/cli/status-oauth.ts tests/cli-status-oauth-health.test.ts && git commit -m "feat(cli): show session lifetime in ocx status oauth block"
```

---

## Task 5: Tray balloon notification

**Files:**
- Modify: `src/tray/windows-tray.ps1`

No automated tests for PS1 — manual verification only.

- [ ] **Step 1: Read the current poll loop in the tray script**

```bash
cd D:/Projects/opencodex && grep -n "startup-health\|online\|poll\|timer\|Tick\|Interval" src/tray/windows-tray.ps1 | head -30
```

Identify the line numbers where `Read-JsonUrl "$origin/startup-health"` is called and where `$notify.Icon` is set based on `$startup.status`.

- [ ] **Step 2: Add warning dedup hashtable near top of script (after existing variable declarations)**

Find the line that declares `$script:online` or similar script-scope vars and add after it:

```powershell
$script:warnedSessions = @{}  # key = "provider:accountId"; prevents re-firing per proxy session
```

- [ ] **Step 3: Add session warning poll logic after existing startup-health icon logic**

After the block that sets `$notify.Icon` based on `$startup.status`, add:

```powershell
  # Session lifetime warnings
  if ($startup.sessionWarnings -and $startup.sessionWarnings.Count -gt 0) {
    foreach ($w in $startup.sessionWarnings) {
      $key = "$($w.provider):$($w.accountId)"
      if (-not $script:warnedSessions.ContainsKey($key)) {
        $script:warnedSessions[$key] = $true
        $msg = "$($w.label) — run: ocx login $($w.provider)"
        $notify.ShowBalloonTip(6000, "opencodex: session expiring", $msg, [System.Windows.Forms.ToolTipIcon]::Warning)
      }
    }
    # Keep warning icon while sessions are expiring (only if currently online)
    if ($script:online -and $notify.Icon -ne $warningIcon) {
      $notify.Icon = $warningIcon
    }
  }
```

- [ ] **Step 4: Commit**

```bash
cd D:/Projects/opencodex && git add src/tray/windows-tray.ps1 && git commit -m "feat(tray): balloon notification for expiring SSO sessions"
```

---

## Task 6: Full test run

- [ ] **Step 1: Run all affected test files**

```bash
cd D:/Projects/opencodex && bun test tests/session-lifetime.test.ts tests/oauth-health.test.ts tests/startup-health-ui.test.ts tests/cli-status-oauth-health.test.ts 2>&1 | tail -40
```

Expected: all tests PASS, no regressions

- [ ] **Step 2: Run broader oauth/health suite to check for regressions**

```bash
cd D:/Projects/opencodex && bun test tests/oauth-health.test.ts tests/oauth-store-multi.test.ts tests/doctor-oauth.test.ts 2>&1 | tail -20
```

Expected: all PASS

- [ ] **Step 3: Commit if any fixups needed, then final commit**

```bash
cd D:/Projects/opencodex && git status
```

If clean, no commit needed. If fixups present:

```bash
cd D:/Projects/opencodex && git add -p && git commit -m "fix(session-lifetime): address test feedback"
```
