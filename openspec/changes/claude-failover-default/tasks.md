## 1. Implementation
- [x] 1. `src/claude/failover-default.ts` + unit tests
- [x] 2. CLI `ocx claude ide failover-default` + API POST
- [x] 3. GUI Claude quickstart Failover Default button + i18n
- [x] 4. Docs note in `docs-site/.../guides/claude-code.md`

## 2. Verification
- [x] 5. `bun test ./tests/claude-failover-default.test.ts`
- [x] 6. `bun x tsc --noEmit` + `bun run lint:i18n` (gui)
- [x] 7. Local apply: `bun run src/cli/index.ts claude ide failover-default --replace`
