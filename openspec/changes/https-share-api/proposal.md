# OpenSpec change: https-share-api (brainstorm)

**Status:** Approach A live smoke — ngrok HTTPS + admission token verified (2026-08-12)  
**Mode:** OpenSpec (opencodex `.spec-mode`)  
**Complexity:** Standard (AFK auto) · G1 held for user pick of approach  
**Synced skills:** `vitou-vitou/laravel13.x` `main` @ `8ac0042` → `~/.cursor/skills` + `~/.claude/skills` (triad + brainstorming + caveman-spec-triad)

## Intent

Expose / share OpenCodex’s OpenAI-compatible API over **HTTPS** (public or team URL), similar in spirit to Warp’s “share a link” — but for `/v1/*` clients, not a terminal session.

## LDA-PO (compress)

1. **Logic** — Admit remote clients with token; terminate TLS at edge; forward to loopback OCX.
2. **Data** — `OPENCODEX_API_AUTH_TOKEN` / dashboard `apiKeys`; no provider keys in the share URL.
3. **Architecture** — Prefer tunnel edge (ngrok/cloudflared/Herd Expose) in front of existing Bun proxy; do not rebuild adapters in Laravel.
4. **Portal** — Reuse archived `tunnel-loopback-auth` + docs `Remote access` / `Tunnels`.
5. **Others** — Laravel+Herd only if a separate PHP product shell is desired.

## Approaches

| ID | Approach | Verdict |
|----|----------|---------|
| A | Tunnel → OCX loopback | **Recommended** |
| B | Native TLS in OCX | Deferred / unnecessary for share |
| C | New Laravel + Herd (+ Expose) | Only if PHP SaaS shell |
| D | Warp session share | Wrong layer |

## Visual

`docs` companion HTML: `.superpowers/brainstorm/https-share-options.html`

## Open question (one)

What is the primary consumer of the HTTPS URL?
1. Personal phone / second laptop pointing Codex/Claude at your home PC  
2. Teammates sharing one provider pool  
3. Public SaaS product with accounts/billing  

## Non-goals (until chosen)

- Rewriting OpenCodex as Laravel
- Shipping native TLS inside Bun without a clear need
