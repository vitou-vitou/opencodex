## ADDED Requirements

### Requirement: Inbound header pins Codex pool account
When the request includes `x-ocx-codex-account` with value `main` or a known pool account id, and OpenAI account mode is pool, the proxy SHALL authenticate that account for the request and SHALL NOT auto-switch to a different pool account.

#### Scenario: Valid pin selects account
- **WHEN** a pool-mode Responses request includes `x-ocx-codex-account: <id>` for a usable pool account
- **THEN** upstream uses that account's credential
- **AND** auto-switch / lowest-usage selection is skipped for that request

#### Scenario: Pin main alias
- **WHEN** the header value is `main`
- **THEN** the main Codex login pool identity is used

### Requirement: Pin fails closed
When a pin is present but the account is missing, unusable, needs reauthentication, or is cooling down without an admitted same-account probe, the proxy SHALL return an error and SHALL NOT fall over to another pool account.

#### Scenario: Unknown pin
- **WHEN** the header names an unknown account id
- **THEN** the response is an authentication or invalid-request error
- **AND** no other pool account is used

#### Scenario: Cooldown pin
- **WHEN** the pinned account is in cooldown and no same-account probe is admitted
- **THEN** the client receives a cooldown/rate-limit error for that account
- **AND** another pool account is not substituted

### Requirement: Unpinned traffic unchanged
Requests without `x-ocx-codex-account` SHALL keep existing thread affinity and auto-switch behavior.

#### Scenario: No header
- **WHEN** pool-mode traffic omits the pin header
- **THEN** account selection matches pre-change quota-pool rules

### Requirement: Codex launcher injects pin
The CLI SHALL provide a way to run Codex with `--account <id|main>` so the pin header is sent via Codex `env_http_headers` and an environment variable.

#### Scenario: Launcher help
- **WHEN** a user runs the Codex launcher help
- **THEN** `--account` is documented for research pin use
