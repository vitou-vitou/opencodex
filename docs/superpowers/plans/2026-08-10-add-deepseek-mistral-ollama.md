# Add DeepSeek + Mistral + Ollama Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DeepSeek, Mistral, and Ollama providers to the opencodex dashboard via the UI — no code changes required.

**Architecture:** All three providers already exist in `PROVIDER_REGISTRY` (`src/providers/registry.ts`). Adding them is purely a dashboard operation: navigate to Providers → Add Provider → configure API key. Ollama requires a local Ollama process running; Mistral and DeepSeek require API keys from their respective consoles.

**Tech Stack:** opencodex dashboard at http://localhost:10100 — no build step needed.

---

## Pre-flight

- [ ] **Confirm dashboard is running**

  Open http://localhost:10100/#providers in browser.
  Expected: Providers page loads, shows 7 ready providers.

---

### Task 1: Add DeepSeek

**Files:** None (dashboard only)

- [ ] **Step 1: Get API key**

  Visit https://platform.deepseek.com/api_keys
  Create a new key, copy it.

- [ ] **Step 2: Add provider in dashboard**

  Click `+ Add Provider` (top right).
  Search for or select `deepseek`.
  Paste API key.
  Save.

- [ ] **Step 3: Verify provider is ready**

  In Providers list: `DeepSeek` should appear with green dot (Ready).
  Click it → Models tab → confirm `deepseek-v4-flash` and `deepseek-v4-pro` appear.

- [ ] **Step 4: Smoke test**

  Open a new chat, select model `deepseek/deepseek-v4-flash`.
  Send: `Say hello in one word.`
  Expected: Single-word response without error.

---

### Task 2: Add Mistral

**Files:** None (dashboard only)

- [ ] **Step 1: Get API key**

  Visit https://console.mistral.ai/api-keys
  Create a new key, copy it.

- [ ] **Step 2: Add provider in dashboard**

  Click `+ Add Provider`.
  Search for or select `mistral`.
  Paste API key.
  Save.

- [ ] **Step 3: Verify provider is ready**

  In Providers list: `Mistral` should appear with green dot (Ready).
  Click it → Models tab → confirm `codestral-latest` appears.
  Note: only one model shown — registry entry is minimal. Expected behavior.

- [ ] **Step 4: Smoke test**

  Open a new chat, select model `mistral/codestral-latest`.
  Send: `Write a hello world function in Python.`
  Expected: Valid Python code, no error.

---

### Task 3: Add Ollama (local)

**Files:** None (dashboard only)

- [ ] **Step 1: Verify Ollama is installed and running**

  Run in terminal:
  ```bash
  ollama list
  ```
  Expected: shows installed models (or empty list if none pulled yet).
  If command not found: install from https://ollama.com/download

- [ ] **Step 2: Pull at least one model**

  ```bash
  ollama pull llama3.3
  ```
  Wait for download to complete.
  Verify:
  ```bash
  ollama list
  ```
  Expected: `llama3.3` in list.

- [ ] **Step 3: Add provider in dashboard**

  Click `+ Add Provider`.
  Search for or select `ollama`.
  Base URL: `http://localhost:11434/v1` (default, no change needed).
  API key: leave blank.
  Save.

- [ ] **Step 4: Verify provider is ready**

  In Providers list: `Ollama (local)` should appear with green dot (Ready).
  Click it → Models tab → confirm `llama3.3` (or whichever model you pulled) appears.

- [ ] **Step 5: Smoke test**

  Open a new chat, select model `ollama/llama3.3`.
  Send: `Say hello in one word.`
  Expected: Single-word response from local model, no error.

---

## Post-completion

- [ ] **Verify all 3 in dashboard**

  http://localhost:10100/#providers
  Expected: 10 ready providers (was 7, added 3).

---

## Known Gaps (deferred)

- Mistral registry hardening (add model list, context windows, `liveModels: true`) — separate task
- DeepSeek deprecated model ids (`deepseek-chat`, `deepseek-reasoner`) pruning — separate task
