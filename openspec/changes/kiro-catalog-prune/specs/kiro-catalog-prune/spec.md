## ADDED Requirements

### Requirement: Static Kiro catalog excludes known-invalid model IDs
The Kiro provider static model list SHALL NOT include model IDs that the live Kiro runtime rejects as invalid model identifiers (`INVALID_MODEL_ID` or equivalent validation failures).

#### Scenario: Known-dead id absent from catalog
- **WHEN** a model id was classified as invalid during the catalog prune probe
- **THEN** it does not appear in `KIRO_MODELS`
- **AND** a unit test denylist asserts it stays absent

#### Scenario: Callable id remains
- **WHEN** a model id returns a successful chat response during the probe
- **THEN** it remains in `KIRO_MODELS` (unless intentionally removed for other reasons)

### Requirement: Context window map stays consistent
Every non-router entry in `KIRO_MODELS` that has a documented context window SHALL have a matching key in `KIRO_MODEL_CONTEXT_WINDOWS`, and window keys SHALL NOT reference pruned ids.

#### Scenario: Map consistency
- **WHEN** the catalog module is loaded
- **THEN** no context-window key refers to an id absent from `KIRO_MODELS` (except documented omissions such as `kiro-auto`)
