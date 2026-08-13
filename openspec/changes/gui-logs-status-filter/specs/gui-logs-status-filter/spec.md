## ADDED Requirements

### Requirement: Logs list status class filter

The Logs tab SHALL provide a Status segmented control with options All, 2xx, 4xx, and 5xx that filters the visible request log table by the parent entry HTTP status class.

#### Scenario: Default shows all statuses

- **GIVEN** the Logs tab has loaded one or more request entries with mixed statuses
- **WHEN** the Status filter is All (default)
- **THEN** every loaded entry that also passes Surface and Conversation filters is visible

#### Scenario: Filter to 4xx

- **GIVEN** the ring contains a 200 entry and a 429 entry
- **WHEN** the operator selects Status 4xx
- **THEN** only entries whose parent `status` is in 400–499 are visible

#### Scenario: Filter to 5xx

- **GIVEN** the ring contains a 502 entry and a 200 entry
- **WHEN** the operator selects Status 5xx
- **THEN** only entries whose parent `status` is in 500–599 are visible

#### Scenario: Combine with Surface

- **GIVEN** a Claude-surface 429 and a Codex-surface 429
- **WHEN** Surface is Claude and Status is 4xx
- **THEN** only the Claude 429 row is visible

#### Scenario: Empty after filter

- **GIVEN** the ring is non-empty but no entry matches the active Status (and other) filters
- **WHEN** the table would otherwise render
- **THEN** the UI shows a no-matches empty state (not the cold “no requests yet” copy)
