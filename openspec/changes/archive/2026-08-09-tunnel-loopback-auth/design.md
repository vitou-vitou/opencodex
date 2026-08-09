## Context

`isApiAuthRequired(config)` returns true only when `config.hostname` is non-loopback. `hasValidApiAuth` returns true immediately when auth is not required. Tunnel clients hit the public hostname while the process still binds `127.0.0.1`, so auth never engages.

## Goals / Non-Goals

**Goals:** Fail closed on public Host; preserve local loopback DX; document tunnels; thin GUI copy helpers.

**Non-Goals:** `ocx tunnel` sidecar; nesting remote ocx as a provider; redesigning the dashboard; trusting forwarded headers by default.

## Decisions

1. **Per-request Host check:** Auth required when bind is non-loopback **or** request Host hostname is non-loopback.
2. **Trusted proxy opt-in:** Honor `X-Forwarded-Host` only when `OPENCODEX_TRUST_PROXY=1`.
3. **No startup token mandate for loopback+tunnel:** Local dashboard keeps working; public Host without token → 401.
4. **GUI on API page:** Snippets only; no new nav item; full i18n.
5. **Tests first:** Cover loopback allow, public Host deny, token allow, forwarded-host spoof deny/allow.

## Risks / Trade-offs

- [Risk] Reverse proxies that preserve public Host to a loopback-bound ocx without setting a token break until operators add `OPENCODEX_API_AUTH_TOKEN` → Mitigation: clear 401 message + docs; this is the intended fail-closed behavior.
- [Risk] Spoofed `X-Forwarded-Host` → Mitigation: ignored unless `OPENCODEX_TRUST_PROXY=1`.
- [Risk] Breaking local tools that send a weird Host header → Mitigation: only non-loopback hostnames trigger; tests for `127.0.0.1` / `localhost` / `::1`.
