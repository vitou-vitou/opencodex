## ADDED Requirements

### Requirement: Static catalog for Kimi coding providers
Registry entries `kimi` and `kimi-code` SHALL set `liveModels: false` so catalog sync uses the docs-driven static model seed and does not call OpenAI-style `GET /models` on the coding base URL.

#### Scenario: Registry flags
- **WHEN** `PROVIDER_REGISTRY` is loaded
- **THEN** entries `kimi` and `kimi-code` have `liveModels === false`

#### Scenario: No live fetch when disabled
- **WHEN** `fetchProviderModels` runs for a provider config with `liveModels: false` and a non-empty `models` seed
- **THEN** it returns the configured seed models without performing an HTTP models request

### Requirement: Static catalog for Google Antigravity
Registry entry `google-antigravity` SHALL set `liveModels: false` because Cloud Code Assist has no OpenAI-compatible `GET /models` endpoint; the static `ANTIGRAVITY_MODELS` list is the catalog source of truth.

#### Scenario: Registry flag
- **WHEN** `PROVIDER_REGISTRY` is loaded
- **THEN** entry `google-antigravity` has `liveModels === false`

#### Scenario: Startup without Antigravity 404 warn
- **WHEN** catalog sync runs for a configured `google-antigravity` provider with registry enrichment applied
- **THEN** discovery does not probe `GET {baseUrl}/models` and does not emit an HTTP 404 discovery warning for that provider
