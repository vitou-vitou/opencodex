## Why

PhpStorm **Tools → AI Assistant → Agents** lists coding agents (Qoder, Amazon Q, OpenCode, Nova, …). Operators expect matching **OpenCodex provider presets**. Most JetBrains Agents are ACP/CLI products without a documented OpenAI-compatible chat endpoint we can proxy (unlike MiMo Free / OpenCode Free).

What *is* proxyable today:

- **Qoder CN** rides Alibaba Cloud Model Studio **Coding Plan (China)** — OpenAI-compatible `https://coding.dashscope.aliyuncs.com/v1` with plan key `sk-sp-…`. International Coding Plan already exists as `alibaba` (`coding-intl…`).
- **Amazon Q (JetBrains)** has no OpenAI chat proxy API. The honest substitute for Codex/Claude routing is **Amazon Bedrock Mantle** (`https://bedrock-mantle.{region}.api.aws/v1` + Bedrock API key).

## What Changes

- Add registry preset `qoder-cn` (Qoder CN / Alibaba Coding Plan China).
- Clarify existing `alibaba` label/note as International Coding Plan.
- Add registry preset `amazon-bedrock` (Bedrock Mantle OpenAI-compatible; region chooser).
- Document why Nova / Poolside / Stakpak / siGit / pi ACP / Amazon Q *agent* are out of scope.
- Docs: providers guide EN (+ locales non-contradicting).

## Capabilities

### New Capabilities

- `provider-presets`: Qoder CN + Amazon Bedrock Mantle appear in Add provider / Paid catalog with correct base URLs and operator notes.

### Modified Capabilities

- (none)

## Impact

- `src/providers/registry.ts`
- Focused registry tests
- `docs-site` providers guide (EN + key locales)
- No new adapter (reuse `openai-chat`)

## Out of scope

- Keyless reverse-engineering of Qoder/Amazon Q IDE free tiers
- ACP wrappers for Nova, Poolside, Stakpak, siGit Code, pi ACP
- Renaming/removing existing Free presets (OpenCode Free, MiMo Free)
