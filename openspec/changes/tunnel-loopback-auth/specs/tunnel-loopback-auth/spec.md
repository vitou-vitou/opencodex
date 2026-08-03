## ADDED Requirements

### Requirement: Public Host requires admission auth on loopback bind
When the proxy is bound to a loopback hostname, requests whose `Host` header hostname is non-loopback SHALL require a valid admission secret (`OPENCODEX_API_AUTH_TOKEN` or a configured `apiKeys` entry) for both management and data-plane routes, using the same acceptance rules as non-loopback binds.

#### Scenario: Public Host without token is rejected
- **WHEN** the proxy binds to `127.0.0.1` and a client calls `/api/providers` or `/v1/models` with `Host` set to a public hostname and no admission secret
- **THEN** the response status is `401`

#### Scenario: Public Host with valid token is accepted
- **WHEN** the proxy binds to `127.0.0.1`, `OPENCODEX_API_AUTH_TOKEN` is set, and a client calls a protected route with that token in `x-opencodex-api-key` (or accepted Bearer / `x-api-key`) and a public `Host`
- **THEN** the request is not rejected for missing auth

#### Scenario: Loopback Host stays open
- **WHEN** the proxy binds to `127.0.0.1` and a client calls a management route with `Host: 127.0.0.1` (or `localhost` / `::1`) and no admission secret
- **THEN** the request is not rejected for missing auth

### Requirement: Forwarded host is untrusted by default
`X-Forwarded-Host` SHALL NOT force auth requirements unless `OPENCODEX_TRUST_PROXY` is enabled with a truthy value of `1`.

#### Scenario: Spoofed forwarded host ignored
- **WHEN** `OPENCODEX_TRUST_PROXY` is unset or not `1`, the request `Host` is loopback, and `X-Forwarded-Host` is a public hostname with no token
- **THEN** the request is not rejected for missing auth solely because of `X-Forwarded-Host`

#### Scenario: Trusted forwarded host requires auth
- **WHEN** `OPENCODEX_TRUST_PROXY=1`, the request `Host` is loopback, `X-Forwarded-Host` is a public hostname, and no admission secret is present
- **THEN** the response status is `401`

### Requirement: Operators can follow tunnel guidance
Docs SHALL describe the tunnel footgun, required admission header, and the ngrok free-tier `ngrok-skip-browser-warning` header for API clients.

#### Scenario: Remote access docs mention tunnels
- **WHEN** an operator reads the Remote access documentation
- **THEN** it states that public Host traffic requires a token even on loopback bind, and shows example client headers including the ngrok skip header
