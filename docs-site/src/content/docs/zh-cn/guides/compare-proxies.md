---
title: 代理对比
description: 何时选择 opencodex，而不是 LiteLLM、Claude Code Router 或 go-llm-proxy。
---

opencodex 是面向 **OpenAI Codex 与 Claude Code 的本地提供商代理** —— 多提供商路由、ChatGPT
账号池，以及 Responses/Anthropic 桥接，让这些客户端使用并非为其设计的模型。它**不是**通用企业级
LLM 网关，也**不是**多智能体编排控制平面。

相近工具解决不同问题。请按**职责**选择，而不是追星数。

:::note[Star 快照]
约截至 2026-07-30 的 GitHub stars：[LiteLLM](https://github.com/BerriAI/litellm) ~55k，
[Claude Code Router](https://github.com/musistudio/claude-code-router) ~36k，
[opencodex](https://github.com/lidge-jun/opencodex) ~5.9k，
[go-llm-proxy](https://github.com/yatesdr/go-llm-proxy) 小众。Stars 衡量热度，不衡量契合度。
:::

## 快速选择

| 选择… | 当你需要… |
| --- | --- |
| **opencodex** | Codex CLI/App/SDK 和/或 Claude Code 对接多提供商，并需要本地仪表盘与 Codex 账号池 |
| **LiteLLM** | 面向应用/后端的组织级 API 网关（100+ 提供商、成本、护栏、负载均衡） |
| **Claude Code Router (CCR)** | 在模型间路由智能体、融合能力并编排工具的本地控制平面 |
| **go-llm-proxy** | 协议转换 + 视觉描述、OCR/PDF、网页搜索等能力注入 |

## opencodex

**职责：** 让 Codex 与 Claude Code 通过一个 Bun 原生本地代理使用任意 LLM 提供商。

**选择 opencodex 当：**

- 你主要在 Codex 和/或 Claude Code 中使用 Claude、Gemini、Grok、DeepSeek、Ollama、OpenRouter 等
- 你关心 Codex ChatGPT **账号池**亲和性、配额感知选择与 opencodex Web 仪表盘
- 你想要 Responses ↔ 提供商适配器，而不想搭建组织级网关

**不适合：** 内部服务集群的集中多租户成本治理（优先 LiteLLM）；需要专用编排控制平面的智能体集群（优先 CCR）。

参见[工作原理](/zh-cn/getting-started/how-it-works/)、[提供商](/zh-cn/guides/providers/)、
[Claude Code](/zh-cn/guides/claude-code/)。

## LiteLLM

**职责：** 组织 / 多提供商 **API 网关**（[BerriAI/litellm](https://github.com/BerriAI/litellm)）。

**选择 LiteLLM 当：** 应用或团队需要带预算、密钥与可观测性的网关；或要把 Bedrock、Azure、Vertex、
vLLM 等标准化为 OpenAI 形态 API。

**改选 opencodex：** 主客户端是 Codex / Claude Code，需要原生体验与账号池，而非企业网关。

## Claude Code Router (CCR)

**职责：** 本地 **多智能体控制平面**
（[musistudio/claude-code-router](https://github.com/musistudio/claude-code-router)）。

**选择 CCR 当：** 痛点是 **智能体路由与编排**，而不是“把 Codex 指到另一个提供商”。

**改选 opencodex：** 你需要 Codex/Claude Code 的 **提供商代理**（适配器、账号池、仪表盘）。

## go-llm-proxy

**职责：** 用于协议桥接与 **能力注入** 的轻量 Go 代理
（[yatesdr/go-llm-proxy](https://github.com/yatesdr/go-llm-proxy)）—— 视觉描述、PDF/OCR、网页搜索。

**选择 go-llm-proxy 当：** 本地或安全后端缺少视觉/PDF/搜索，希望由代理透明补齐；或以 vLLM/Bedrock/
混合后端前的协议转换为主要需求。

**改选 opencodex：** 你需要以 Codex/Claude Code 为中心的注册表、账号池与仪表盘。opencodex 也有
[边车](/zh-cn/guides/sidecars/)，但产品重心不同。

## 多账号：两种不同工作

“多个 Codex 账号”通常指下面两种之一——不要混为一谈：

| 工作 | 模式 | 示例 |
| --- | --- | --- |
| **并行舰队** | N 账号 × N 并发智能体 | Star Fleet 风格编排（每个并行智能体一个账号） |
| **配额池** | 一条活跃 Codex 路径；遇 429/配额切换并保留线程亲和 | opencodex Codex Auth；如 `codex-rotate` 的本地 `auth.json` 轮换 |

opencodex 实现的是**配额池**。已有线程留在同一账号；新会话可按用量、冷却与健康再平衡。它不是并行多账号编排器。

## 相近工具

[1rgs/claude-code-proxy](https://github.com/1rgs/claude-code-proxy)（~3.7k）侧重让 Claude Code
跑在 OpenAI 形态模型上。存在重叠，但 opencodex 在同一本地代理中还覆盖 **Codex**（Responses API、
账号池、多提供商注册表）。
