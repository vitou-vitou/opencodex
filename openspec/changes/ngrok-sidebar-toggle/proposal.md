## Why

Operators want a one-click public HTTPS URL for the local opencodex proxy (demos, webhooks, remote Codex/Claude clients). The dashboard already has a Claude on/off sidebar switch; there is no tunnel control today and no `ngrok` code in the tree.

## What Changes

- Sidebar **Ngrok** row with Claude-style `Switch` (start/stop tunnel).
- `#ngrok` status page: public URL, copy, token/binary errors, optional auth-token field.
- Management API `GET`/`PUT /api/ngrok`.
- Process manager: spawn `ngrok http <listenPort>`, read public URL from local inspector API, stop on toggle-off / proxy shutdown.
- Config `ngrok.enabled` + optional `ngrok.authToken` (or `NGROK_AUTHTOKEN` env). Never log or return the raw token.

## Capabilities

### New Capabilities

- `ngrok-tunnel`: Start/stop ngrok against the live proxy port; surface status to GUI/API.

### Modified Capabilities

- (none)

## Impact

- `src/ngrok/manager.ts`, management routes, `OcxConfig.ngrok`
- `gui/src/App.tsx`, routing, `Ngrok.tsx`, i18n, sidebar CSS twin
- Tests + docs-site configuration note

## Non-Goals

- Reserved/custom domains, Cloudflare tunnel, bundling the ngrok binary, multi-tunnel
