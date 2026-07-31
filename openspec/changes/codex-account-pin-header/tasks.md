## 1. OpenSpec

- [x] 1.1 proposal, design, specs, tasks

## 2. Runtime

- [x] 2.1 Parse `x-ocx-codex-account` in resolveCodexAuthContext; pin path fail-closed
- [x] 2.2 Bind thread affinity to pin when thread id present; skip auto-switch

## 3. CLI

- [x] 3.1 Ensure env_http_headers mapping for pin env
- [x] 3.2 `ocx codex --account` launcher (or extend ensure/exec) sets env and runs codex

## 4. Tests / docs / GUI

- [x] 4.1 Unit/integration tests for pin, fail-closed, unpinned unchanged
- [x] 4.2 Docs + Codex Auth i18n hint
- [x] 4.3 typecheck + Aikido
