# Task 2 Report: Expose redacted recovery state through account DTOs

## Status

Completed. `CodexAuthAccountDto` now includes `quotaHealth` and
`recoveryEligible` for both main and pool accounts. The API projects health
from stored quota windows using the configured `autoSwitchThreshold ?? 80` and
uses Task 1's `canRecoverWithAccount` eligibility rule. Existing OAuth health
fields and safe DTO fields are unchanged.

## Commit

- `5bf10b0d feat: expose Codex quota recovery state`

## Tests and verification

- RED: `bun test tests/codex-auth-api.test.ts` failed as expected because
  `quotaHealth` and `recoveryEligible` were absent.
- GREEN: `bun test tests/codex-auth-api.test.ts tests/codex-quota-recovery.test.ts`
  — 97 passed, 0 failed.
- `bun x tsc --noEmit` — exited 0.
- `git diff --check` — no whitespace errors.

The API regression test asserts the controlling quota window, reset timestamp,
action, eligibility, masked email, and absence of access token, refresh token,
raw ChatGPT account ID, and unmasked email in the serialized DTO.

## Concerns

`StoredAccountQuota` currently defines weekly and monthly windows. The local
adapter also accepts optional 5h and custom windows defensively, but the Codex
quota store does not currently populate those fields; no store changes were
made because they are outside Task 2's approved file scope.

## Review follow-up: main cached quota timestamp

### Status

Completed. The main account DTO now uses the timestamp from the main-account
info cache rather than assigning a fresh timestamp while constructing the DTO.
As a result, stale cached quota projects as `unknown` with the `refresh`
action instead of appearing current.

### Commit

- `31f7fcbb fix: preserve main Codex quota timestamp`

### Tests and verification

- RED: `bun test tests/codex-auth-api.test.ts` failed as expected: stale main
  cached quota was incorrectly reported as current `critical` quota.
- GREEN: `bun test tests/codex-auth-api.test.ts tests/codex-quota-recovery.test.ts`
  — 99 passed, 0 failed.
- `bun x tsc --noEmit` — exited 0.
- `git diff --check` — no whitespace errors.

Added main-account regression coverage for the controlling quota window,
switch eligibility, and stale cached quota refresh behavior.

### Concerns

None within Task 2 scope.
