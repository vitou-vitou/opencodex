## ADDED Requirements

### Requirement: Chain lookup resolves Desktop family keys
When resolving `claudeCode.routing.chains` for an inbound `/v1/messages` model id, the proxy SHALL try keys in order: exact inbound id, Desktop family key (`opus` | `sonnet` | `haiku` | `fable`) when the id matches `desktopProfile` assignment alias (or resolved Desktop 3P route → family), then date-stripped id (`-\d{8}$`).

#### Scenario: Desktop date alias hits family chain
- **WHEN** Desktop sends `claude-opus-4-8-2026MMDD` assigned to family `sonnet` and `chains.sonnet` exists
- **THEN** the selector uses `chains.sonnet` even if `chains.claude-opus-4-8` also exists

#### Scenario: Claude Code dated id still works
- **WHEN** the client sends `claude-sonnet-4-5-20241022` and only `chains.claude-sonnet-4-5` exists
- **THEN** the selector uses that date-stripped chain

### Requirement: Recommended family chains merge without overwrite
The recommended kiro→xai family template SHALL be installable via `ocx claude route ensure-chains` and Desktop apply. Existing non-empty chains for a family key SHALL NOT be replaced.

#### Scenario: Missing keys filled
- **WHEN** `ensure-chains` or Desktop apply runs and `chains.sonnet` is absent
- **THEN** `chains.sonnet` is set to the recommended arena-ranked candidates (`xai/grok-4.5` → `kiro/glm-5` → `kiro/claude-sonnet-4.5`)

#### Scenario: Existing chain preserved
- **WHEN** `chains.opus` already has a non-empty candidate list and `--replace` is not set
- **THEN** ensure/apply leaves `chains.opus` unchanged

#### Scenario: Replace refreshes arena order
- **WHEN** `ocx claude route ensure-chains --replace` runs
- **THEN** family keys are overwritten with the current recommended arena-ranked template

### Requirement: Reactive hop still bounded by maxHops
Pre-stream 429/401/403/5xx on a chain candidate SHALL cool that candidate and re-pick within `maxHops` (existing behavior), including when the chain was selected via a Desktop family key.

#### Scenario: Family chain hops on 429
- **WHEN** the primary family candidate returns 429 before stream start and a second candidate exists
- **THEN** the request retries the next candidate and can return success
