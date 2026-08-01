## Context

Kiro adapter maps catalog ids to CodeWhisperer wire. Registry keeps `liveModels: false` so a spurious `/models` 2xx cannot drop seeded ids. Docs-driven seeds can still list models the account/region rejects.

## Goals / Non-Goals

**Goals:** Align static catalog with probe results; denylist regression; Desktop defaults use surviving Kiro ids.

**Non-Goals:** Runtime soft-ban; auto-failover on INVALID_MODEL_ID; changing other providers' live reconciliation.

## Decisions

1. Classification:
   - **drop**: HTTP body/status indicates invalid/unknown model (`INVALID_MODEL_ID`, ValidationException on model id).
   - **keep**: HTTP 200.
   - **keep-with-note**: auth/quota/5xx/network — do not prune.
2. Update `KIRO_MODELS`, `KIRO_MODEL_CONTEXT_WINDOWS`; `KIRO_MODEL_REASONING_EFFORTS` is derived from `KIRO_MODELS`.
3. CI never calls live Kiro — bake probe results into static list + denylist fixture.
4. Desktop retarget is an operator step after prune (`ocx claude desktop move/default/apply`).

## Risks

- Regional/account variance: probe reflects this machine's Kiro login; document that in tasks.
- Over-pruning if probe misclassifies: only drop on explicit invalid-model signals.
