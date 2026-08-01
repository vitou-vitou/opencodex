## 1. OpenSpec

- [x] 1.1 proposal, design, specs, tasks

## 2. Probe

- [x] 2.1 Probe each `KIRO_MODELS` id via `POST /v1/messages` (`hi`, small max_tokens)
- [x] 2.2 Classify keep / drop / keep-with-note

## 3. Prune

- [x] 3.1 Update `kiro-models.ts` lists and context windows
- [x] 3.2 Denylist unit test + map consistency test
- [x] 3.3 typecheck + focused tests + Aikido

## 4. Desktop

- [x] 4.1 Retarget Desktop defaults off pruned ids and apply

### Probe notes (2026-08-01, this machine's Kiro login)

- **keep:** kiro-auto, claude-sonnet-4.5, claude-haiku-4.5, deepseek-3.2, minimax-m2.5, minimax-m2.1, glm-5, qwen3-coder-next
- **drop (INVALID_MODEL_ID):** gpt-5.6-*, claude-sonnet-5, claude-opus-*, claude-sonnet-4.6, claude-sonnet-4.0
- Desktop defaults: Opus=`kiro/kiro-auto`, Sonnet=`kiro/claude-sonnet-4.5`, Haiku=`kiro/claude-haiku-4.5`
