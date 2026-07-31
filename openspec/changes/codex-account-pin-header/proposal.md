## Why

Research fleets need one long-lived Codex worker per owned ChatGPT login. Today's quota pool auto-switches accounts and cannot pin a worker. Without an inbound pin, parallel research workers share one active account.

## What Changes

- Honor inbound header `x-ocx-codex-account` (`main` or pool account id) to force that credential.
- When pinned: skip auto-switch / lowest-usage pick; fail closed on cooldown / missing / needs-reauth (no failover to another account).
- Unpinned traffic unchanged.
- CLI: `ocx codex --account <id|main>` injects the pin via Codex `env_http_headers` + env var.
- Docs + Codex Auth hint distinguishing research pin vs quota pool.

## Capabilities

### New Capabilities

- `codex-account-pin-header`: Request-scoped Codex Auth pool account pin via inbound header, with fail-closed semantics and a thin Codex launcher.

### Modified Capabilities

- (none)

## Impact

- `src/codex/auth-context.ts`, routing bind behavior for pinned requests
- Responses (and other Codex auth consumers using `resolveCodexAuthContext`)
- `src/cli/` Codex launcher + inject/`env_http_headers`
- docs-site, GUI i18n hint
- tests
