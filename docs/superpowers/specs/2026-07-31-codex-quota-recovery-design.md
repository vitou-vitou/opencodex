# Codex Quota Recovery Account Picker

## Goal

Prevent Codex work from stopping unexpectedly when an OpenAI account approaches
or reaches a quota limit. Give the user early warning, clear reset information,
and a one-click way to select another already-authenticated account.

This feature improves recovery for legitimate, user-authorized accounts. It
does not create accounts, automate email verification, bypass provider limits,
or promise unlimited tokens.

## User experience

Each Codex account receives one health state:

- `healthy`: usable, no threshold reached
- `warning`: configured warning threshold reached
- `critical`: urgent threshold reached
- `exhausted`: quota reached or hard quota response observed
- `reauth_required`: credential cannot be used until login completes
- `unknown`: quota is missing or stale and must be refreshed

The most restrictive known active window determines the account state. Existing
Codex quota windows remain authoritative: 5-hour, weekly, 30-day, or any
provider-reported custom window.

Default thresholds:

- 70%: warning
- 80%: recommend switching
- 95%: urgent warning
- 100% or hard 429/quota response: recovery required

The existing auto-switch setting remains supported. Users can disable it or
manually choose an account.

When recovery is needed, the dashboard opens an account picker showing only
already-authenticated accounts. Each row contains masked email, plan, quota
percentage, active window, reset time, and health explanation. The user can
select an account and continue with a new session.

Existing Codex threads remain pinned to their original account. The UI must
explain this and offer `Start continuation` rather than silently remapping an
active thread.

If no usable account exists, show the earliest relevant reset time and actions:
`Refresh quotas`, `Login another account`, or `Retry later`.

## Architecture

Use one shared account-health projection derived from existing quota, OAuth,
cooldown, and routing state. Do not create a parallel quota store.

Data flow:

1. Existing quota refresh updates account quota state.
2. Health projection normalizes quota windows and credential state.
3. Threshold evaluator produces account health and deduplicated events.
4. Management API exposes redacted account health.
5. Dashboard, notifications, recovery picker, and CLI consume the same DTO.
6. Account selection updates future/new-session preference and leaves active
   thread affinity unchanged.

Likely integration points:

- `src/codex/auth-api.ts` and existing quota/account projection
- Codex account pool/routing logic
- Management API account DTO routes
- `gui/src/components/CodexAccountPool*`
- `gui/src/components/CodexAutoSwitchSetting`
- Dashboard notification/recovery surfaces
- Existing CLI account/status commands

## Account selection behavior

On selection:

1. Confirm quota data is fresh enough; refresh if stale.
2. Validate that credential is present and not marked for reauthentication.
3. Save the selected account preference using existing account-pool policy.
4. Route future/new sessions to the selected account.
5. Show confirmation with account health and reset data.

If validation fails, keep current routing unchanged and show a retry or login
action. Never return access tokens to the browser, API response, logs, or
notifications.

## Notifications

Notifications are deduplicated by account, quota window, and threshold. A new
notification is allowed after the relevant window resets or the state moves to
a more severe level.

Dashboard messages must state:

- which window is affected;
- current usage percentage;
- reset time, when available;
- whether automatic switching is enabled;
- the next available action.

System notifications are optional and opt-in after the dashboard flow is
validated. CLI status should expose the same redacted health summary; a watch
mode may be added if it fits existing CLI conventions.

## API and privacy

Expose health through the existing local management API account response.
Return masked account identifiers and structured status fields only. Preserve
existing local authentication/access controls.

Privacy requirements:

- never expose OAuth access or refresh tokens;
- never log request bodies, API keys, or full account identifiers;
- use existing privacy masking helpers;
- do not send quota/account data to third-party notification services;
- notification text must not imply protection from provider enforcement.

## Failure handling

- Missing/stale quota: show `unknown`, refresh before selection.
- Expired credential: show `reauth_required` and normal Codex login action.
- Quota exhaustion: stop retrying a hard quota failure; offer recovery picker.
- All accounts exhausted: show reset countdown and login/fallback actions.
- Switch failure: preserve current session and display retryable error.
- Existing-thread affinity: never silently change account mid-thread.

## Testing

Add focused regression tests for:

- 70%, 80%, 95%, and 100% state transitions;
- multiple windows where the most restrictive window wins;
- notification deduplication and reset behavior;
- stale quota refresh before selection;
- account ordering and exclusion of reauth-required accounts;
- all-accounts-exhausted response;
- existing-thread affinity preservation;
- API/UI/log redaction and token non-leakage;
- CLI and dashboard parity.

Run the repository-required checks before implementation completion:

```text
bun run typecheck
bun run test
bun run lint:gui
bun run privacy:scan
```

## Rollout

Implement in slices:

1. Shared health projection and redacted API DTO.
2. Dashboard health badges and threshold notifications.
3. Recovery picker and explicit new-session continuation.
4. CLI status output and optional watch mode.
5. Optional opt-in system notifications.
6. User docs for quota windows, account ownership, and thread affinity.

Out of scope: unlimited-token behavior, disposable-email registration,
verification-code automation, quota bypass, cross-user account sharing, and
forced interruption of active threads.

## Success criteria

- User receives a warning before expected quota exhaustion.
- User can identify a usable authenticated account in one click.
- New work can route to selected account without changing active thread history.
- Exhaustion state explains reset time and next action.
- No credential or privacy regression.
- Existing routing, OAuth, quota, and account-pool tests remain green.
