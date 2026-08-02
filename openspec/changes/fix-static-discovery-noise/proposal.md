## Why

On `ocx start`, catalog sync probes OpenAI-style `GET {baseUrl}/models` for every provider where `liveModels !== false`. Kimi returns HTTP 402 (listing payment/plan-gated) and Google Antigravity returns HTTP 404 (CCA has no OpenAI `/models`). Static seeds already work; the warn spam is false alarm noise.

## What Changes

- Set `liveModels: false` on registry entries `kimi`, `kimi-code`, and `google-antigravity` (same pattern as `kiro`).
- Document why each is static-only (one-line registry notes + oauth comment sync).
- Add regression tests that assert the flags and that discovery does not fetch when disabled.

## Capabilities

### New Capabilities

- `static-discovery-noise`: Providers whose live `/models` probe is structurally wrong or bill-gated MUST use static catalog seeds without emitting HTTP discovery warnings on start.

### Modified Capabilities

- (none)

## Impact

- `src/providers/registry.ts`
- `src/oauth/index.ts` (comment only)
- Focused tests under `tests/`
- No API or config schema change for operators (enrichment already copies `liveModels` from registry)
