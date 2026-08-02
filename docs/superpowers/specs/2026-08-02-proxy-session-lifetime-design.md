# Proxy Session Lifetime Awareness

**Date:** 2026-08-02  
**Branch:** vitou/feat/claude-provider-failover  
**Status:** Approved

## Problem

OAuth SSO sessions for providers like Claude Desktop, Kiro, and Cursor have a finite lifetime (8h–7d depending on provider). Today the proxy has no awareness of how long ago a session was created, so users discover expiry only when requests start failing — at which point they must choose between re-doing SSO login or switching to BYOK (e.g. OpenRouter).

## Goal

Proactively surface "time remaining on SSO session" in `ocx status` and fire a tray balloon notification when any active account crosses a warning threshold, prompting the user to re-login or consider BYOK before the session breaks.

---

## Design

### 1. Data & Computation Layer

**New file:** `src/oauth/session-lifetime.ts`

**Provider TTL map** (`PROVIDER_SESSION_TTLS`):

| Provider      | Expected TTL |
|---------------|-------------|
| `claude`      | 8 hours     |
| `anthropic`   | 8 hours     |
| `kiro`        | 24 hours    |
| `cursor`      | 7 days      |
| `kimi`        | 24 hours    |
| *(fallback)*  | 24 hours    |

**Warning threshold:** `SESSION_WARN_THRESHOLD_MS = 2 * 60 * 60 * 1000` (2 hours)

**Core function:**

```ts
export type SessionLifetimeStatus = "ok" | "expiring" | "expired";

export interface SessionLifetime {
  loginAt: number;      // = addedAt epoch ms
  expiresAt: number;    // loginAt + ttl
  timeLeftMs: number;   // expiresAt - now (may be negative)
  status: SessionLifetimeStatus;
}

export function computeSessionLifetime(
  provider: string,
  account: ProviderAccount,
  now?: number,
): SessionLifetime | null
```

Returns `null` when `account.addedAt` is missing (no login time recorded — shown as `—` in CLI).

**Integration:** `OAuthHealthEntry` gains an optional field:

```ts
sessionLifetime?: SessionLifetime;
```

No changes to the `OAuthAccountHealth` union type — avoids breaking existing health consumers.

---

### 2. `ocx status` CLI Surface

`collectOAuthHealthEntries` attaches `sessionLifetime` to each entry for providers with a known TTL.

The `ocx status` table gains a **Session** column:

| Status | Display |
|--------|---------|
| `ok` | `8h left` / `23m left` |
| `expiring` | `⚠ 1h 42m left` |
| `expired` | `EXPIRED (2d ago)` |
| no `addedAt` | `—` |

**Action text** (appended to existing health summary):

- Expiring: `re-login soon: run ocx login <provider>`
- Expired: `session expired — run ocx login <provider> or consider BYOK (OpenRouter)`

No new CLI command. Hooks into existing status rendering path.

---

### 3. API Endpoint Extension

`GET /api/startup-health` response gains:

```ts
sessionWarnings?: Array<{
  provider: string;
  accountId: string;   // masked (first/last 4 of hash)
  timeLeftMs: number;
  label: string;       // "claude account-…1234: 1h 42m left"
}>
```

Server reads auth store with `peekAuthStore()` (observe-only, no side effects). Computes lifetime for each active account. Filters to those where `status === "expiring" || status === "expired"`.

---

### 4. Tray Notification (Windows)

Tray PS1 polls `/api/startup-health` every ~30s (existing cadence).

**New logic in `windows-tray.ps1`:**

```powershell
$script:warnedSessions = @{}  # key = "provider:accountId"

# Inside poll loop, after reading startup-health:
foreach ($w in $health.sessionWarnings) {
  $key = "$($w.provider):$($w.accountId)"
  if (-not $script:warnedSessions.ContainsKey($key)) {
    $script:warnedSessions[$key] = $true
    $notify.ShowBalloonTip(6000, "opencodex: session expiring", $w.label + " — run: ocx login $($w.provider)", [System.Windows.Forms.ToolTipIcon]::Warning)
  }
}
```

- Fires **once per account per proxy session** (hashtable resets on proxy restart).
- Icon switches to `$warningIcon` while any `sessionWarnings` entry exists (mirrors existing at-risk icon logic).

---

## Scope

**In scope:**
- `src/oauth/session-lifetime.ts` (new)
- `src/oauth/health.ts` — attach `sessionLifetime` to `OAuthHealthEntry`
- `src/server/` — extend `/api/startup-health` response
- `src/cli/` — extend `ocx status` table rendering
- `src/tray/windows-tray.ps1` — add warning poll + balloon

**Out of scope:**
- User-configurable TTLs (YAGNI — constants are sufficient)
- Non-Windows tray (Linux/macOS tray not implemented)
- Auto-relogin (requires interactive browser flow)
- BYOK auto-switch (separate feature)

---

## Files Touched

| File | Change |
|------|--------|
| `src/oauth/session-lifetime.ts` | New — TTL map, `computeSessionLifetime` |
| `src/oauth/health.ts` | Add `sessionLifetime?` to `OAuthHealthEntry`, populate in `collectOAuthHealthEntries` |
| `src/oauth/types.ts` | No change |
| `src/server/startup-health.ts` | Add `sessionWarnings` field |
| `src/cli/status-oauth.ts` | Add Session column to OAuth status table |
| `src/tray/windows-tray.ps1` | Warning dedup hashtable + balloon |

---

## Testing

- Unit tests for `computeSessionLifetime`: ok/expiring/expired/null (missing addedAt)
- Unit test for `collectOAuthHealthEntries` populating `sessionLifetime`
- Unit test for startup-health endpoint including `sessionWarnings`
- No tray tests (PS1 script, manual verification)
