## ADDED Requirements

### Requirement: Explicit Failover Default apply

Operators SHALL be able to apply a Failover Default that replaces Claude Code Default slots with the ranked opus family chain head and enables failure hops.

#### Scenario: Apply merges chains and remaps Default

- **GIVEN** `claudeCode.routing` has no chains
- **WHEN** Failover Default is applied
- **THEN** family chains exist, `tierModels.opus` is the opus chain-head Claude Code alias, and `modelMap` maps `claude-opus-5` to that alias

#### Scenario: Hop keys exist for the Default alias

- **GIVEN** Failover Default was applied with opus head alias `A`
- **WHEN** Claude Code sends model `A`
- **THEN** `routing.chains[A]` is the opus candidate list (for failover)

#### Scenario: IDE env refreshed

- **GIVEN** Failover Default apply succeeds
- **WHEN** the command finishes
- **THEN** Claude home / Cursor IDE env include `ANTHROPIC_DEFAULT_OPUS_MODEL` (or equivalent tier env) pointing at the opus head
