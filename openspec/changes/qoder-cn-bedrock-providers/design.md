## Context

OpenCodex Free tab = keyless or free-tier **LLM HTTP** backends. JetBrains Agents = local coding agents. Mixing them confuses operators.

## LDA-PO

1. **Logic** — Only ship presets with a documented OpenAI-compatible (or existing adapter) endpoint + auth story. Label Amazon Bedrock distinctly from Amazon Q agent.
2. **Data** — Registry rows: `id`, `label`, `baseUrl`, `authKind: key`, notes, optional `baseUrlChoices` / `allowBaseUrlOverride`.
3. **Architecture** — `registry.ts` → `derive.ts` → GUI Paid catalog; no new adapter module.
4. **Portal** — Reuse `openai-chat` + Cloudflare-style region/account template pattern.
5. **Others** — Coding Plan China keys are interactive-tools-only (same class as Tencent note); Bedrock needs AWS Bedrock API key.

## Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Qoder CN endpoint | `coding.dashscope.aliyuncs.com/v1` | Official Coding Plan China OpenAI URL used by Qoder CN |
| Keep `alibaba` id | Relabel International only | Avoid breaking saved configs |
| Amazon Q agent | Do not add fake preset | No OpenAI chat API; Bedrock Mantle is the proxyable AWS path |
| Bedrock default region | `us-east-1` + choices | Matches AWS workshop/docs examples |
| JetBrains ACP agents | Explicit out of scope | No stable public chat Completions contract |

## Risks

- Operators may still paste pay-as-you-go DashScope keys into Coding Plan URLs → documented note.
- Bedrock model IDs are region/account-dependent → `liveModels: true`, light static seed.
