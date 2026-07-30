---
title: 프록시 비교
description: LiteLLM, Claude Code Router, go-llm-proxy와 비교해 언제 opencodex를 고를지.
---

opencodex는 **OpenAI Codex와 Claude Code용 로컬 프로바이더 프록시**입니다 — 다중 프로바이더 라우팅,
ChatGPT 계정 풀, Responses/Anthropic 브리지로 해당 클라이언트가 원래 설계되지 않은 모델을 쓸 수 있게
합니다. **범용 엔터프라이즈 LLM 게이트웨이**도 아니고 **멀티 에이전트 오케스트레이션 컨트롤 플레인**도
아닙니다.

근처 도구는 다른 일을 합니다. 스타 수가 아니라 **역할**로 고르세요.

:::note[Star 스냅샷]
2026-07-30 기준 대략적인 GitHub stars: [LiteLLM](https://github.com/BerriAI/litellm) ~55k,
[Claude Code Router](https://github.com/musistudio/claude-code-router) ~36k,
[opencodex](https://github.com/lidge-jun/opencodex) ~5.9k,
[go-llm-proxy](https://github.com/yatesdr/go-llm-proxy) 니치. Stars는 인기이지 적합도가 아닙니다.
:::

## 빠른 선택

| 선택… | 이럴 때 |
| --- | --- |
| **opencodex** | Codex CLI/App/SDK 및/또는 Claude Code가 여러 프로바이더와 대화하고, 로컬 대시보드와 Codex 계정 풀이 필요할 때 |
| **LiteLLM** | 앱/백엔드용 조직 API 게이트웨이(100+ 프로바이더, 비용, 가드레일, LB) |
| **Claude Code Router (CCR)** | 에이전트를 모델 간에 라우팅하고 능력 융합·도구 오케스트레이션하는 로컬 제어면 |
| **go-llm-proxy** | 프로토콜 변환 + 비전 설명·OCR/PDF·웹 검색 등 능력 주입 |

## opencodex

**역할:** Codex와 Claude Code가 임의 LLM 프로바이더를 하나의 Bun 네이티브 로컬 프록시로 사용.

**opencodex를 고를 때:**

- Codex 및/또는 Claude Code에서 Claude, Gemini, Grok, DeepSeek, Ollama, OpenRouter 등을 쓰고 싶을 때
- Codex ChatGPT **계정 풀** 친화성, 쿼터 기반 선택, opencodex 웹 대시보드가 중요할 때
- 조직 게이트웨이 없이 Responses ↔ 프로바이더 어댑터가 필요할 때

**비적합:** 내부 서비스 함대의 중앙 멀티테넌트 비용 거버넌스(LiteLLM). 전용 오케스트레이션 컨트롤
플레인이 필요한 에이전트 무리(CCR).

[동작 원리](/ko/getting-started/how-it-works/), [프로바이더](/ko/guides/providers/),
[Claude Code](/ko/guides/claude-code/) 참고.

## LiteLLM

**역할:** 조직 / 다중 프로바이더 **API 게이트웨이**([BerriAI/litellm](https://github.com/BerriAI/litellm)).

**LiteLLM을 고를 때:** 예산·키·관측 가능성이 있는 게이트웨이가 앱/팀에 필요하거나 Bedrock, Azure,
Vertex, vLLM 등을 OpenAI 형태로 표준화할 때.

**대신 opencodex:** 주 클라이언트가 Codex / Claude Code이고 네이티브 UX와 계정 풀이 필요하며
엔터프라이즈 게이트웨이가 아닐 때.

## Claude Code Router (CCR)

**역할:** 로컬 **멀티 에이전트 제어면**
([musistudio/claude-code-router](https://github.com/musistudio/claude-code-router)).

**CCR을 고를 때:** 통증이 “Codex를 다른 프로바이더로 돌리기”가 아니라 **에이전트 라우팅과
오케스트레이션**일 때.

**대신 opencodex:** Codex/Claude Code **프로바이더 프록시**(어댑터, 풀, 대시보드)가 필요할 때.

## go-llm-proxy

**역할:** 프로토콜 브리징과 **능력 주입**용 경량 Go 프록시
([yatesdr/go-llm-proxy](https://github.com/yatesdr/go-llm-proxy)) — 비전 설명, PDF/OCR, 웹 검색.

**go-llm-proxy를 고를 때:** 로컬/보안 백엔드에 비전·PDF·검색이 없어 프록시가 투명하게 메우길 원하거나,
vLLM/Bedrock/혼합 백엔드 앞 프로토콜 변환이 주 목적인 경우.

**대신 opencodex:** Codex/Claude Code 중심 레지스트리, 계정 풀, 대시보드가 필요할 때. opencodex에도
[사이드카](/ko/guides/sidecars/)가 있지만 제품 초점은 다릅니다.

## 근처 도구

[1rgs/claude-code-proxy](https://github.com/1rgs/claude-code-proxy)(~3.7k)는 Claude Code를 OpenAI형
모델로 돌리는 데 초점입니다. 겹침은 있으나 opencodex는 같은 로컬 프록시에서 **Codex**(Responses API,
계정 풀, 다중 프로바이더 레지스트리)도 다룹니다.
