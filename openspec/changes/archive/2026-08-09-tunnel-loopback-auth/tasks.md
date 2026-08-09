## 1. OpenSpec

- [x] 1.1 proposal / design / spec / tasks
- [x] 1.2 superpowers design at `docs/superpowers/specs/2026-08-02-tunnel-loopback-auth-design.md`

## 2. Auth core

- [x] 2.1 Add request-Host / trusted-forwarded-host helpers in `src/server/auth-cors.ts`
- [x] 2.2 Thread request into `isApiAuthRequired` / `hasValidApiAuth` so public Host requires admission secrets
- [x] 2.3 Keep `assertServerAuthConfig` bind-only startup rule unchanged

## 3. Tests

- [x] 3.1 Public Host + no token → 401 (management + data-plane)
- [x] 3.2 Public Host + token → allowed
- [x] 3.3 Loopback Host → allowed without token
- [x] 3.4 Forwarded-host spoof ignored unless `OPENCODEX_TRUST_PROXY=1`

## 4. Docs + GUI

- [x] 4.1 Update Remote access docs (EN + zh-cn + ru)
- [x] 4.2 Thin API-page Remote/tunnel copy block + i18n keys

## 5. Verify

- [x] 5.1 `bun run typecheck` + focused tests
- [x] 5.2 Aikido scan on first-party edits
- [x] 5.3 `bun run privacy:scan` if auth/docs touch credential paths
