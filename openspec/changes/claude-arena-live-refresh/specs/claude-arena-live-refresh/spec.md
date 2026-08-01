## ADDED Requirements

### Requirement: On-demand arena refresh
The CLI SHALL provide `ocx claude route refresh-arena` that fetches the arena.ai text leaderboard, matches rows to the local visible catalog, builds family chains (opus/sonnet/haiku/fable, max 3 candidates each), and persists `claudeCode.routing.arenaSnapshot`.

#### Scenario: Successful refresh
- **WHEN** the operator runs `ocx claude route refresh-arena` and the fetch + parse succeed
- **THEN** `arenaSnapshot.fetchedAt` is set to now
- **AND** `arenaSnapshot.chains` contains up to 3 candidates per family from matched catalog routes

#### Scenario: Fetch failure
- **WHEN** the arena fetch fails or the HTML cannot be parsed
- **THEN** the command exits non-zero
- **AND** any previous snapshot is left unchanged

### Requirement: Optional apply into live chains
`refresh-arena --apply` SHALL merge snapshot chains into `claudeCode.routing.chains`. Without `--replace`, only missing/empty family keys are filled. With `--replace`, family keys are overwritten.

#### Scenario: Apply merge
- **WHEN** `--apply` is set and `chains.opus` already exists
- **THEN** opus is left unchanged unless `--replace` is also set

### Requirement: Stale refresh on ensure-chains
When `ensure-chains` runs and the snapshot is missing or older than `arenaMaxAgeHours` (default 168), the implementation SHALL attempt one best-effort arena refresh before merging. On refresh failure it SHALL fall back to existing snapshot, else static `RECOMMENDED_FAMILY_CHAINS`.

#### Scenario: Fresh snapshot
- **WHEN** snapshot age is below `arenaMaxAgeHours`
- **THEN** `ensure-chains` does not fetch arena

#### Scenario: Offline fallback
- **WHEN** no snapshot exists and refresh fails
- **THEN** `ensure-chains` uses static `RECOMMENDED_FAMILY_CHAINS`

### Requirement: CI does not call live arena
Unit tests SHALL use fixture leaderboard text and MUST NOT require network access to arena.ai.

#### Scenario: Fixture match
- **WHEN** a fixture containing known model names is parsed against a fake catalog
- **THEN** family chain order follows fixture Elo ranks for matched ids
