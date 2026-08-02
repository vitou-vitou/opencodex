## ADDED Requirements

### Requirement: Ngrok tunnel lifecycle

The system SHALL start and stop an `ngrok http` tunnel targeting the live opencodex listen port when the operator enables or disables Ngrok via the management API or dashboard sidebar switch.

#### Scenario: Enable with token and binary present

- **WHEN** `PUT /api/ngrok` with `{ "enabled": true }` and an auth token is available (env or config) and the `ngrok` binary is on PATH
- **THEN** the proxy spawns `ngrok http <listenPort>`, persists `ngrok.enabled: true`, and subsequent `GET /api/ngrok` reports `running: true` with a non-empty `publicUrl` when the inspector API returns a tunnel

#### Scenario: Enable without token

- **WHEN** `PUT /api/ngrok` with `{ "enabled": true }` and neither `NGROK_AUTHTOKEN` nor `ngrok.authToken` is set
- **THEN** the response is an error status, no child process is left running, and `ngrok.enabled` is not set to true

#### Scenario: Disable

- **WHEN** `PUT /api/ngrok` with `{ "enabled": false }`
- **THEN** any ngrok child is stopped and `ngrok.enabled` is persisted as false

### Requirement: Status without secret leakage

`GET /api/ngrok` SHALL return enabled, running, publicUrl, port, hasToken, hasBinary, and optional error text, and MUST NOT return the auth token value.

#### Scenario: Token present is boolean only

- **WHEN** a token is configured and the client calls `GET /api/ngrok`
- **THEN** the body includes `hasToken: true` and does not include `authToken`

### Requirement: Sidebar and page

The dashboard SHALL expose a Ngrok nav entry with an on/off switch mirroring Claude, and a `#ngrok` page showing status and allowing optional token save.
