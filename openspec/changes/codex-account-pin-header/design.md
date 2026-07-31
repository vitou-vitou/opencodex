## Context

`resolveCodexAuthContext` selects pool accounts via thread affinity + auto-switch. Research fleets need sticky per-worker identity. Codex CLI can send headers via `env_http_headers = { "header" = "ENV_VAR" }`.

## Goals / Non-Goals

**Goals:** Header pin; fail-closed; launcher; docs/GUI hint; unpinned behavior unchanged.

**Non-Goals:** Fleet orchestrator; Zoho/account farming; ports-per-account; changing default auto-switch.

## Decisions

1. Header name: `x-ocx-codex-account` (values: `main` or pool account id).
2. Pin path inside `resolveCodexAuthContext` before thread resolution.
3. Fail-closed: unknown id / unusable / needsReauth / cooldown without usable probe → error; never pick another account.
4. Same-account probe lease for cooldown clearing still allowed (identity unchanged).
5. Launcher sets `OCX_CODEX_ACCOUNT` and ensures `env_http_headers` maps `x-ocx-codex-account` → that env (extend inject or ephemeral override).

## Risks / Trade-offs

- Loopback Design B may lack provider `env_http_headers` today → launcher must ensure header path works (inject helper or temp provider).
- Affinity vs pin conflict: pin wins for the request; bind affinity to pinned account when thread id present.
