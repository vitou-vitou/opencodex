## Why

Claude Desktop sends date-encoded 3P aliases (`claude-opus-4-8-2026MMDD`). Failover chain
lookup only date-stripped those ids to `claude-opus-4-8`, so family-specific chains never
matched and Desktop traffic never hopped across providers when Kiro (or another primary)
hit 429/auth errors. Operators also had no merge-safe way to install a recommended
kiro → xai chain set without hand-editing `config.json`.

## What Changes

- Resolve chain keys as: exact inbound id → Desktop family (`opus`/`sonnet`/`haiku`/`fable`) → date-stripped id.
- Ship a recommended family chain template (kiro → xai) merged only for missing keys.
- Install via `ocx claude route ensure-chains` and Desktop apply (CLI + `/api/claude-desktop/apply`).
- Document family keys and the install path; leave GUI chain editing and proactive cross-provider quota out of scope.

## Capabilities

### New Capabilities

- `claude-reactive-chains-desktop`: Desktop-usable reactive failover via family chain keys and merge-safe recommended chains.

### Modified Capabilities

- (none)

## Impact

- `src/claude/route-chains.ts`, `src/claude/inbound.ts`, `src/server/claude-messages.ts`
- `src/cli/claude-route.ts`, `src/cli/claude-desktop.ts`, `src/cli/help.ts`
- `src/server/management/agent-settings-routes.ts`
- Tests under `tests/claude-*-*.test.ts`
- Docs: `docs-site` Claude Code guide + configuration reference
