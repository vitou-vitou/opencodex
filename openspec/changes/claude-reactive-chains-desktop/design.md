## Context

Reactive failover for `/v1/messages` already exists (`claudeCode.routing.chains`, hop loop,
cooldowns). Desktop could not use it because inbound ids did not match chain keys.

## Goals / Non-Goals

**Goals:** Family-key chain lookup for Desktop; recommended kiro→xai template; merge-on-apply / CLI ensure; docs.

**Non-Goals:** GUI chain editor; proactive quota for non-openai providers; round-robin; Codex pool changes.

## Decisions

1. **Lookup order:** exact → Desktop family (from `desktopProfile.assignments` / defaults + optional 3P registry) → date-stripped. Family before date-strip so all Desktop date aliases do not collapse onto one `claude-opus-4-8` chain.
2. **Recommended template:** Candidate order follows [arena.ai text](https://arena.ai/leaderboard/text) Elo among kiro + xai callable models (snapshot 2026-08-01): opus/sonnet/fable = `xai/grok-4.5` → `kiro/glm-5` → `kiro/claude-sonnet-4.5`; haiku = `kiro/deepseek-3.2` → `kiro/claude-haiku-4.5` → `kiro/minimax-m2.5`. Refresh with `ensure-chains --replace`.
3. **Merge policy:** never overwrite a non-empty existing chain for that family key unless `--replace`.
4. **Install surfaces:** `ocx claude route ensure-chains` and Desktop apply only (not silent auto-reconcile on every provider change).

## Risks

- Arena rankings drift; snapshot is documented in code comments — re-rank periodically.
- Quality/cost of hopping to Grok or GLM may differ from the Desktop family default the user clicked.
- Operators who keyed chains only as `claude-opus-4-8` for Desktop should migrate to family keys.
