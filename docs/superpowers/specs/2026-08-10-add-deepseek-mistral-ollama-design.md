# Add DeepSeek + Mistral + Ollama Providers

**Date:** 2026-08-10
**Scope:** Dashboard-only. No code changes. Registry entries already exist.

## Goal

Add 3 popular missing providers to the opencodex dashboard:
1. DeepSeek — leading open-weight coding models
2. Mistral — Codestral best-in-class code model
3. Ollama — local model runner, zero cost

## Registry Status

| Provider | Registry ID | Status |
|---------|-------------|--------|
| DeepSeek | `deepseek` | Full entry. V4 Pro/Flash with thinking, reasoning map, vision sidecar. Note: `deepseek-chat`/`deepseek-reasoner` deprecated 2026-07-24 but still in seed. |
| Mistral | `mistral` | Minimal entry. Only `codestral-latest`, no context window, no liveModels, freeze note. Works but limited picker. |
| Ollama | `ollama` | Full entry. Local, no key, baseUrl override supported. |

## Steps

### 1. DeepSeek
- Dashboard → Add Provider → select `deepseek`
- Auth: API key from https://platform.deepseek.com/api_keys
- Default model: `deepseek-v4-flash`
- Working models: `deepseek-v4-flash`, `deepseek-v4-pro`

### 2. Mistral
- Dashboard → Add Provider → select `mistral`
- Auth: API key from https://console.mistral.ai/api-keys
- Default model: `codestral-latest`
- Limitation: registry minimal — picker shows only `codestral-latest` until hardened

### 3. Ollama (local)
- Prerequisite: Ollama installed and running at `localhost:11434`
- Pull models first: `ollama pull <model>` (e.g. `llama3.3`, `qwen2.5-coder`, `deepseek-r1`)
- Dashboard → Add Provider → select `ollama`
- Auth: none required
- baseUrl override available if non-default port

## Known Gaps (future work)

- Mistral registry needs hardening: add model list, context windows, `liveModels: true`
- DeepSeek deprecated ids (`deepseek-chat`, `deepseek-reasoner`) should be pruned from registry seed
- Ollama: no static model list — user must pull models manually

## Decision

Add all 3 via dashboard as-is. Mistral hardening deferred to separate task.
