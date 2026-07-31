## ADDED Requirements

### Requirement: Docs distinguish parallel fleet from quota pool
The docs site SHALL explain that opencodex Codex account pooling is a quota pool with thread affinity, not a parallel multi-account fleet.

#### Scenario: How It Works callout
- **WHEN** a user reads Getting Started → How It Works → Codex auth account selection
- **THEN** the page MUST state that the pool is not N parallel Codex sessions
- **AND** MUST restate thread affinity for existing threads and quota/cooldown rebalance for new sessions

#### Scenario: Compare Proxies multi-account note
- **WHEN** a user reads guides/compare-proxies
- **THEN** the page MUST contrast “many accounts at once” (parallel fleet) with “survive quota on one laptop” (quota pool / opencodex)

### Requirement: Codex Auth GUI states pool-not-parallel
The Codex Auth dashboard SHALL present copy that the account pool serves one request path with thread affinity and does not run N parallel Codex sessions.

#### Scenario: Pool mode banner note
- **WHEN** OpenAI account mode is Pool
- **THEN** the UI MUST show a note keyed as pool-not-parallel (or equivalent) clarifying sequential/failover pooling

#### Scenario: Auto-switch and provider pool blurbs
- **WHEN** a user reads automatic switching or Providers OpenAI pool descriptions
- **THEN** the copy MUST mention quota/429 switching and MUST NOT claim parallel multi-session orchestration

### Requirement: CLI help states affinity and quota-pool semantics
Account-related CLI help SHALL describe Codex pool behavior as quota-pool routing with thread affinity.

#### Scenario: Help text
- **WHEN** a user runs accounts / auto-switch related CLI help
- **THEN** the help text MUST mention thread affinity and quota-pool (or equivalent wording)
- **AND** MUST NOT describe the feature as running parallel Codex sessions per pool account

### Requirement: No routing algorithm change
This change SHALL NOT alter Codex account pick, affinity binding, or auto-switch threshold algorithms except via documentation and help/copy surfaces.

#### Scenario: Behavior unchanged
- **WHEN** the change is implemented
- **THEN** existing affinity and auto-switch tests continue to pass without algorithm rewrites
