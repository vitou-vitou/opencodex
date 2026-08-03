## Why

Operators tunnel opencodex with ngrok/cloudflared to `127.0.0.1:10100`. Auth is currently required only when the **bind hostname** is non-loopback, so a public tunnel keeps management and data-plane open with no token. A live ngrok dashboard (v2.7.42) confirmed unauthenticated `/api/providers` and `/v1/models`.

## What Changes

- Require admission auth when the request `Host` (or trusted `X-Forwarded-Host`) is non-loopback, even if bind stays loopback.
- Keep loopback `Host` open for local DX when bind is loopback.
- Document tunnel setup, `x-opencodex-api-key`, and ngrok `ngrok-skip-browser-warning`.
- Thin dashboard API-page Remote/tunnel copy affordance (i18n).

## Capabilities

### New Capabilities

- `tunnel-loopback-auth`: Public-Host requests MUST require the same admission secrets as non-loopback binds; loopback Host behavior unchanged; docs + thin GUI guidance for tunnels.

### Modified Capabilities

- (none)

## Impact

- `src/server/auth-cors.ts` (+ call-site behavior via `hasValidApiAuth` / `requireApiAuth`)
- Focused tests under `tests/`
- `docs-site` Remote access section (+ locales if they mirror)
- GUI API page + i18n keys
- Security-sensitive: auth boundary (MAINTAINERS security review)
