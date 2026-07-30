---
title: Сравнение прокси
description: Когда выбирать opencodex вместо LiteLLM, Claude Code Router и go-llm-proxy.
---

opencodex — это **локальный прокси провайдеров для OpenAI Codex и Claude Code**: маршрутизация к
многим провайдерам, пул аккаунтов ChatGPT и мост Responses/Anthropic, чтобы эти клиенты могли
использовать модели, для которых они не проектировались. Это **не** общий корпоративный LLM-шлюз и
**не** control plane оркестрации мультиагентов.

Соседние инструменты решают другие задачи. Выбирайте по **роли**, а не по звёздам.

:::note[Снимок звёзд]
Примерно на 2026-07-30 GitHub stars: [LiteLLM](https://github.com/BerriAI/litellm) ~55k,
[Claude Code Router](https://github.com/musistudio/claude-code-router) ~36k,
[opencodex](https://github.com/lidge-jun/opencodex) ~5.9k,
[go-llm-proxy](https://github.com/yatesdr/go-llm-proxy) нишевый. Звёзды — про популярность, не про
подходящесть.
:::

## Быстрый выбор

| Выберите… | Когда нужно… |
| --- | --- |
| **opencodex** | Codex CLI/App/SDK и/или Claude Code с многими провайдерами, локальный дашборд и пул аккаунтов Codex |
| **LiteLLM** | Организационный API-шлюз для приложений/бэкендов (100+ провайдеров, стоимость, guardrails, LB) |
| **Claude Code Router (CCR)** | Локальный control plane: маршрутизация агентов по моделям, слияние возможностей, оркестрация инструментов |
| **go-llm-proxy** | Трансляция протоколов + инъекция возможностей (vision, OCR/PDF, веб-поиск) |

## opencodex

**Роль:** дать Codex и Claude Code произвольных LLM-провайдеров через один Bun-native локальный прокси.

**Выбирайте opencodex, когда:**

- Вы работаете в Codex и/или Claude Code и хотите Claude, Gemini, Grok, DeepSeek, Ollama, OpenRouter и т.д.
- Важны аффинити **пула аккаунтов** ChatGPT, выбор по квоте и веб-дашборд opencodex
- Нужны адаптеры Responses ↔ провайдер без корпоративного шлюза

**Не для:** централизованного multi-tenant учёта затрат для парка внутренних сервисов (LiteLLM);
флотов агентов с отдельным control plane оркестрации (CCR).

См. [Как это работает](/ru/getting-started/how-it-works/), [Провайдеры](/ru/guides/providers/),
[Claude Code](/ru/guides/claude-code/).

## LiteLLM

**Роль:** организационный / multi-provider **API-шлюз** ([BerriAI/litellm](https://github.com/BerriAI/litellm)).

**Выбирайте LiteLLM, когда:** приложениям/командам нужен шлюз с бюджетами, ключами и наблюдаемостью;
или стандартизируете Bedrock, Azure, Vertex, vLLM в OpenAI-подобном API.

**Предпочтите opencodex, когда** основные клиенты — Codex / Claude Code и нужны их UX и пул аккаунтов,
а не enterprise-шлюз.

## Claude Code Router (CCR)

**Роль:** локальный **мультиагентный control plane**
([musistudio/claude-code-router](https://github.com/musistudio/claude-code-router)).

**Выбирайте CCR, когда:** боль — **маршрутизация и оркестрация агентов**, а не «направить Codex на
другого провайдера».

**Предпочтите opencodex, когда** нужен **прокси провайдеров** для Codex/Claude Code (адаптеры, пул,
дашборд).

## go-llm-proxy

**Роль:** лёгкий Go-прокси для моста протоколов и **инъекции возможностей**
([yatesdr/go-llm-proxy](https://github.com/yatesdr/go-llm-proxy)) — описание изображений, PDF/OCR,
веб-поиск.

**Выбирайте go-llm-proxy, когда:** локальным/secure бэкендам не хватает vision/PDF/поиска и прокси
должен закрыть пробелы прозрачно; или главная задача — трансляция протоколов перед vLLM/Bedrock/
смешанными бэкендами.

**Предпочтите opencodex, когда** нужны реестр провайдеров вокруг Codex/Claude Code, пул аккаунтов и
дашборд. У opencodex тоже есть [сайдкары](/ru/guides/sidecars/), но фокус продукта другой.

## Несколько аккаунтов: две разные задачи

«Несколько аккаунтов Codex» обычно означает одно из двух — не смешивайте:

| Задача | Паттерн | Пример |
| --- | --- | --- |
| **Параллельный флот** | N аккаунтов × N параллельных агентов | Харнесы в духе Star Fleet (аккаунт на параллельного агента) |
| **Пул квот** | Один активный путь Codex; смена при 429 / квоте + affinity треда | Codex Auth в opencodex; локальные ротаторы `auth.json` вроде `codex-rotate` |

opencodex реализует **пул квот**. Существующие треды остаются на одном аккаунте; новые сессии могут
перераспределяться по использованию, кулдауну и здоровью. Это не оркестратор параллельных
мультиаккаунтов.

## Рядом

[1rgs/claude-code-proxy](https://github.com/1rgs/claude-code-proxy) (~3.7k) фокусируется на запуске
Claude Code с OpenAI-подобными моделями. Пересечение есть; opencodex дополнительно покрывает
**Codex** (Responses API, пул аккаунтов, реестр провайдеров) в том же локальном прокси.
