## 1. OpenSpec

- [x] 1.1 Write proposal.md, design.md, specs, tasks.md for docs-multi-account-lanes

## 2. Docs

- [x] 2.1 Add not-parallel-fleet callout to how-it-works (EN + locales)
- [x] 2.2 Add multi-account lanes note to compare-proxies (EN + locales)

## 3. GUI

- [x] 3.1 Add `codexAuth.poolNotParallelNote` and strengthen pool/autoSwitch/openaiPoolDesc in all locale files
- [x] 3.2 Render note under Pool banner in CodexAuth.tsx
- [x] 3.3 Run `bun run lint:i18n`

## 4. CLI

- [x] 4.1 Clarify accounts / auto-switch help for affinity + quota-pool
- [x] 4.2 Add or extend help-text coverage if the suite already tests CLI help

## 5. Verify

- [x] 5.1 typecheck + focused affinity tests if src/ touched
- [x] 5.2 Aikido scan on changed first-party files
