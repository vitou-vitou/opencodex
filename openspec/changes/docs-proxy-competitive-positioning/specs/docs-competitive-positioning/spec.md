## ADDED Requirements

### Requirement: Competitive positioning guide exists
The docs site SHALL publish an English guide at slug `guides/compare-proxies` that explains when to choose opencodex versus LiteLLM, Claude Code Router (CCR), and go-llm-proxy.

#### Scenario: Reader finds the guide in Guides
- **WHEN** a user opens the docs Guides sidebar
- **THEN** an entry for Compare Proxies (or equivalent localized label) links to `guides/compare-proxies`

#### Scenario: Guide states opencodex niche
- **WHEN** a user reads `guides/compare-proxies`
- **THEN** the page MUST state that opencodex is a local provider proxy for OpenAI Codex and Claude Code (including multi-provider routing and ChatGPT account-pool concerns)
- **AND** the page MUST NOT claim opencodex is a general enterprise LLM gateway or a multi-agent orchestration control plane

### Requirement: Peer jobs are contrasted honestly
The compare-proxies guide SHALL describe each peer by primary job-to-be-done and include explicit “choose X when…” guidance for LiteLLM, CCR, go-llm-proxy, and opencodex.

#### Scenario: LiteLLM framing
- **WHEN** a user reads the LiteLLM section
- **THEN** the guide MUST frame LiteLLM as an organization / multi-provider API gateway
- **AND** MUST state when LiteLLM is the better fit than opencodex

#### Scenario: CCR framing
- **WHEN** a user reads the Claude Code Router section
- **THEN** the guide MUST frame CCR as a multi-agent / routing control plane for Claude Code-style workflows
- **AND** MUST state when CCR is the better fit than opencodex

#### Scenario: go-llm-proxy framing
- **WHEN** a user reads the go-llm-proxy section
- **THEN** the guide MUST frame go-llm-proxy around protocol bridging and capability injection (e.g. vision / OCR / search)
- **AND** MUST state when that tool is the better fit than opencodex

### Requirement: Locales do not contradict English
Non-English docs locales (ko, zh-cn, ru, ja) SHALL provide a `guides/compare-proxies` page whose meaning does not contradict the English source.

#### Scenario: Locale page present
- **WHEN** a user switches the docs locale to ko, zh-CN, ru, or ja
- **THEN** `guides/compare-proxies` is available in that locale
- **AND** niche and peer job framing remain consistent with the English guide

### Requirement: No runtime impact
This change SHALL NOT modify proxy runtime behavior, configuration schema, management API, or GUI code.

#### Scenario: Docs-only diff
- **WHEN** the change is implemented
- **THEN** only documentation and docs-site navigation (and optionally README cross-links) are modified
- **AND** `src/`, `gui/src/`, and runtime tests remain behaviorally unchanged
