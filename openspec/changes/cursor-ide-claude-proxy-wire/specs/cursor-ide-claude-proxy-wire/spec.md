## ADDED Requirements

### Requirement: Persist Claude Code IDE proxy env

The product SHALL provide `ocx claude ide apply` that writes `ANTHROPIC_BASE_URL` (and related Claude Code gateway env) so Cursor IDE Claude Code chat routes through the local opencodex proxy.

#### Scenario: Apply writes Claude home env

- **GIVEN** the proxy port is 10100
- **WHEN** the operator runs `ocx claude ide apply`
- **THEN** `~/.claude/settings.json` contains `env.ANTHROPIC_BASE_URL` = `http://127.0.0.1:10100` and `env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY` = `1`

#### Scenario: Apply writes Cursor settings when present

- **GIVEN** Cursor User `settings.json` exists
- **WHEN** the operator runs `ocx claude ide apply`
- **THEN** `claudeCode.environmentVariables` includes the same `ANTHROPIC_BASE_URL` entry

#### Scenario: Admission key when configured

- **GIVEN** `config.apiKeys` is non-empty
- **WHEN** apply runs
- **THEN** `ANTHROPIC_AUTH_TOKEN` is set to the first admission key and `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST` is `1`

#### Scenario: Revert removes managed keys only

- **GIVEN** apply previously wrote managed keys alongside unrelated `env` entries
- **WHEN** the operator runs `ocx claude ide revert`
- **THEN** managed keys are removed and unrelated entries remain
