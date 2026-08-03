# Tunnel / Public-Host Auth on Loopback Bind

**Date:** 2026-08-02  
**Branch:** vitou/feat/claude-provider-failover (working tree)  
**Status:** Approved (AFK auto-G1)  
**Mode:** OpenSpec · Complexity: Standard  
**Reference fixture:** `https://debbra-piggish-subtransversally.ngrok-free.dev` (opencodex v2.7.42)

## Problem

Auth today is gated only on **bind hostname** (`isApiAuthRequired` → non-loopback `config.hostname`). Operators commonly tunnel with ngrok/cloudflared to `127.0.0.1:10100`. From the process’s view the bind stays loopback, so `hasValidApiAuth` short-circuits to allow. The public URL then exposes:

- Data plane (`/v1/models`, `/v1/responses`, …)
- Management API (`/api/providers`, …)
- Dashboard UI

Live probe of the reference ngrok host confirmed unauthenticated `/v1/models` and `/api/providers`.

Separate client friction: ngrok free tier injects a browser interstitial unless the request includes `ngrok-skip-browser-warning` (any value) — Context7 / ngrok free-plan docs.

## Goal

Fail closed for **public Host** traffic even when bound to loopback: require the same admission secrets already used for non-loopback binds (`OPENCODEX_API_AUTH_TOKEN` / dashboard `apiKeys`), document tunnel setup, and give the dashboard a thin Remote affordance (copy base URL + auth header + ngrok header note).

Non-goals: nest remote ocx as a custom provider; ship `ocx tunnel` sidecar; full dashboard redesign.

## Approaches considered

| | Approach | Verdict |
|---|----------|---------|
| A | Docs-only warning | Rejected — footgun remains |
| B | Require auth when request Host (or trusted forwarded host) is non-loopback | **Chosen** |
| C | First-class tunnel CLI wrapping ngrok | Deferred — YAGNI |

## Design

### 1. Auth decision

Extend `src/server/auth-cors.ts` (and call sites of `hasValidApiAuth` / `requireApiAuth`):

1. **Bind rule (unchanged):** non-loopback `config.hostname` → auth required at startup (`assertServerAuthConfig`).
2. **Request Host rule (new):** parse `Host` (strip port). If hostname is non-loopback → treat as `isApiAuthRequired` for **this request**, even when bind is loopback.
3. **Trusted proxy (optional, off by default):** when `OPENCODEX_TRUST_PROXY=1`, also consider `X-Forwarded-Host` (first value) the same way. Do not trust forwarded headers unless explicitly enabled.
4. **Fail closed:** public Host + no valid admission secret → 401 (management JSON / data-plane error shape unchanged).
5. **Loopback Host unchanged:** `127.0.0.1` / `localhost` / `::1` keep today’s open local DX when bind is loopback.

Startup behavior when only tunneling (bind still loopback): do **not** require a token at process start (local dashboard keeps working). First public-Host request without a token gets 401 with a clear message pointing at `OPENCODEX_API_AUTH_TOKEN` / API keys page.

### 2. Operator contract

Public base URL example: `https://<tunnel-host>/v1`

Required client headers when Host is public:

```
x-opencodex-api-key: <token>
```

Optional (ngrok free):

```
ngrok-skip-browser-warning: 1
```

`Authorization: Bearer …` and `x-api-key` remain accepted per existing `hasValidApiAuth`.

### 3. Docs

Update `docs-site` Remote access section:

- Explicit **tunnel footgun**: ngrok/cloudflared to loopback previously skipped auth; now public Host requires a token.
- Copy-paste curl against `/healthz` and `/v1/models` with auth + ngrok skip header.
- Keep LAN `0.0.0.0` guidance as-is.

### 4. GUI (impeccable, thin)

On the existing API page (preferred over a new nav item):

- Short “Remote / tunnel” block: effective local base URL; optional paste/display of public base if user sets it (config key or session-only — prefer env/docs first; GUI copy snippets without persisting secrets).
- Copy buttons for `x-opencodex-api-key` header line (key value only if already known to the UI) and `ngrok-skip-browser-warning: 1`.
- Warning copy when the page is loaded under a non-loopback Host without configured auth (surface existing 401s honestly).

All visible strings go through i18n (`en` + other locales). No hardcoded UI copy.

### 5. Tests

Focused Bun tests near existing auth-cors / management auth coverage:

- Loopback Host + loopback bind → management allowed without token
- Public Host + loopback bind + no token → 401 management and data-plane
- Public Host + valid env token → allowed
- `OPENCODEX_TRUST_PROXY` off → ignore spoofed `X-Forwarded-Host` from loopback client
- `OPENCODEX_TRUST_PROXY=1` + public forwarded host + no token → 401
- Non-loopback bind startup without token still fails (`assertServerAuthConfig`)

### 6. Privacy / security

- Never log tokens, request bodies, or account identifiers.
- Do not commit live ngrok URLs or operator tokens.
- `bun run privacy:scan` must stay green.

## Success criteria

1. Reproducing the reference setup (ngrok → `127.0.0.1:10100`) without a token returns 401 for `/api/providers` and `/v1/models` when `Host` is the public hostname.
2. Local `http://127.0.0.1:10100` dashboard and API keep working without a token on loopback bind.
3. Docs describe tunnel + auth + ngrok skip header.
4. Focused tests green; `bun run typecheck` green for touched files.

## OpenSpec change

`openspec/changes/tunnel-loopback-auth/` (proposal / design / tasks / spec to follow).
