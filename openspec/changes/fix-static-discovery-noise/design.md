## Context

`fetchProviderModels` skips live discovery when `prov.liveModels === false` and returns configured/registry seeds. Kiro already uses this because it does not speak OpenAI `GET /models`. Kimi coding and Antigravity CCA currently leave `liveModels` unset (live-by-default), so startup always hits a failing endpoint once before #395 log suppression.

## Goals / Non-Goals

**Goals:** Stop HTTP 402/404 discovery warnings for kimi / kimi-code / google-antigravity; keep static catalogs in Models / Codex.

**Non-Goals:** Wire Antigravity `:fetchAvailableModels` into live catalog; quiet github-copilot authoritative drops; GUI; daemon.

## Decisions

1. **Disable probe at registry (not quiet-log):** `liveModels: false` avoids the network call entirely — correct for Antigravity (404 structural) and acceptable for Kimi (docs-driven seed is authoritative; 402 listing is not useful).
2. **Include `kimi-code`:** Same `https://api.kimi.com/coding/v1` base as oauth `kimi`; key variant would emit the same noise.
3. **No operator migration:** `enrichProviderFromRegistry` copies `liveModels` when the registry defines it, so existing configs pick up the flag on next start refresh path that merges registry presets.
4. **Tests:** Registry parity asserts flags; unit test confirms `fetchProviderModels` with `liveModels: false` returns seeds without calling `fetch`.

## Risks / Trade-offs

- [Risk] Kimi later exposes a working free `/models` list → Mitigation: flip `liveModels: true` and rely on live catalog again; static seed remains fallback.
- [Risk] Antigravity model lineup drifts vs `:fetchAvailableModels` → Mitigation: existing static `ANTIGRAVITY_MODELS` maintenance (unchanged); live catalog wiring stays a separate change.
