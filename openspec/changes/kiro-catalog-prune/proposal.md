## Why

Kiro uses a static model catalog (`liveModels: false`) because it does not speak OpenAI `GET /models`. Seeded IDs can drift from what the AWS runtime accepts, so Claude Desktop / Codex pickers advertise models that fail with `INVALID_MODEL_ID` (e.g. `claude-opus-4.8`, `claude-sonnet-4.6`).

## What Changes

- Probe each seeded Kiro model id against the live proxy runtime.
- Prune IDs that fail with `INVALID_MODEL_ID` (or equivalent hard model-validation errors) from `KIRO_MODELS` and related metadata maps.
- Keep IDs that succeed or fail for infra reasons (auth/quota/5xx).
- Add a regression denylist so pruned IDs do not silently return.
- Retarget Claude Desktop family defaults away from pruned IDs (operator apply).

## Capabilities

### New Capabilities

- `kiro-catalog-prune`: Static Kiro catalog only lists model IDs verified callable (or infra-ambiguous) after a live probe; known-dead IDs stay denylisted in tests.

### Modified Capabilities

- (none)

## Impact

- `src/providers/kiro-models.ts`
- Registry consumers of `KIRO_MODELS` / context windows
- Tests under `tests/`
- Local Claude Desktop defaults (not committed config)
