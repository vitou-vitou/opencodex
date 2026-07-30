---
title: Compare Proxies
description: When to choose opencodex versus LiteLLM, Claude Code Router, and go-llm-proxy.
---

opencodex is a **local provider proxy for OpenAI Codex and Claude Code** — multi-provider routing,
ChatGPT account-pool concerns, and Responses/Anthropic bridging so those clients can use models they
were not built for. It is **not** a general enterprise LLM gateway and **not** a multi-agent
orchestration control plane.

Nearby tools solve different jobs. Use this page to pick the right category — not to chase star
counts.

:::note[Star snapshot]
Approximate GitHub stars as of 2026-07-30: [LiteLLM](https://github.com/BerriAI/litellm) ~55k,
[Claude Code Router](https://github.com/musistudio/claude-code-router) ~36k,
[opencodex](https://github.com/lidge-jun/opencodex) ~5.9k,
[go-llm-proxy](https://github.com/yatesdr/go-llm-proxy) niche. Stars measure popularity, not fit.
:::

## Quick choose

| Choose… | When you need… |
| --- | --- |
| **opencodex** | Codex CLI/App/SDK and/or Claude Code talking to many providers, with local dashboard and Codex account-pool routing |
| **LiteLLM** | An org-wide API gateway: 100+ providers, cost tracking, guardrails, load balancing for apps and backends |
| **Claude Code Router (CCR)** | A local control plane to route agents across models, fuse capabilities, and orchestrate tools |
| **go-llm-proxy** | Protocol translation plus capability injection (vision describe, OCR/PDF, web search) in front of local or cloud backends |

## opencodex

**Job:** Make Codex and Claude Code use arbitrary LLM providers through one Bun-native local proxy.

**Choose opencodex when:**

- You live in Codex and/or Claude Code and want Claude, Gemini, Grok, DeepSeek, Ollama, OpenRouter, etc.
- You care about Codex ChatGPT **account pool** affinity, quota-aware account selection, and the
  opencodex web dashboard.
- You want Responses ↔ provider adapters without standing up an org gateway.

**Not for:** Centralized multi-tenant cost governance for a fleet of internal services (prefer
LiteLLM). Agent fleets that need a dedicated orchestration control plane (prefer CCR).

See [How It Works](/getting-started/how-it-works/), [Providers](/guides/providers/), and
[Claude Code](/guides/claude-code/).

## LiteLLM

**Job:** Organization / multi-provider **API gateway** ([BerriAI/litellm](https://github.com/BerriAI/litellm)) —
OpenAI-compatible (and native) access to 100+ LLM APIs with cost tracking, guardrails, load
balancing, and logging.

**Choose LiteLLM when:**

- Apps, backends, or many teams need one gateway with budgets, keys, and observability.
- You are standardizing on an OpenAI-shaped API across Bedrock, Azure, Vertex, vLLM, and more.

**Prefer opencodex instead when** the primary clients are Codex / Claude Code and you want their
native UX plus account-pool behavior, not an enterprise gateway.

## Claude Code Router (CCR)

**Job:** Local **multi-agent control plane**
([musistudio/claude-code-router](https://github.com/musistudio/claude-code-router)) — route across
models, fuse capabilities, orchestrate tools, stay in control of agent traffic.

**Choose CCR when:**

- Your pain is **agent routing and orchestration**, not “point Codex at another provider.”
- You want a dedicated control plane for many agents and model routes.

**Prefer opencodex instead when** you need a Codex/Claude Code **provider proxy** (adapters, pool,
dashboard) rather than an agent control plane.

## go-llm-proxy

**Job:** Lightweight Go proxy for protocol bridging and **capability injection**
([yatesdr/go-llm-proxy](https://github.com/yatesdr/go-llm-proxy)) — translate between Anthropic /
OpenAI / Bedrock-style backends and inject vision description, PDF/OCR, and web search when the
upstream model lacks them.

**Choose go-llm-proxy when:**

- Local or secure backends are missing vision / PDF / search tooling and you want the proxy to fill
  those gaps transparently.
- Protocol translation in front of vLLM / Bedrock / mixed backends is the main need.

**Prefer opencodex instead when** you want the Codex/Claude Code–centric provider registry, account
pool, and dashboard; opencodex also has [sidecars](/guides/sidecars/) for web search and vision, but
the product focus differs.

## Also nearby

[1rgs/claude-code-proxy](https://github.com/1rgs/claude-code-proxy) (~3.7k stars) focuses on running
Claude Code against OpenAI-shaped models. Overlap with “Claude Code + other models” exists; opencodex
additionally targets **Codex** (Responses API, account pool, multi-provider registry) in the same
local proxy.
