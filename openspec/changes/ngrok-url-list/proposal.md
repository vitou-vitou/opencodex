## Why

Ngrok page shows one Public URL. Operators need a copyable list: local proxy URL plus every public tunnel URL (https/http) from the inspector — including last-known URLs after stop.

## What Changes

- `GET`/`PUT /api/ngrok` adds `localUrl` and `publicUrls[]` (keep `publicUrl` as preferred https).
- Snapshot refreshes from loopback inspector when available; remembers last public URLs after stop for copy.
- Ngrok page: URL list section; each row has Copy (scoped feedback).

## Capabilities

### Modified Capabilities

- `ngrok-tunnel`: expose copyable URL list (local + public).

## Impact

- `src/ngrok/manager.ts`, `ngrok-routes.ts`
- `gui/src/pages/Ngrok.tsx`, i18n locales
- Regression tests for snapshot fields

## Non-Goals

- Custom domains, healthz deep links as required rows, Cloudflare, multi-account tunnels
