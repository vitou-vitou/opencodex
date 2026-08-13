## Why

Claude Code’s picker **Default** is fixed Opus 5. Operators expect ranked gateway failover (arena order, hop on non-200). Option **C** (locked): an explicit Failover Default apply — not silent Opus intercept.

## What Changes

- `applyFailoverDefault`: ensure family chains, point Default/tier slots at ranked opus head alias, mirror chains onto client-facing ids, then IDE env apply.
- CLI: `ocx claude ide failover-default [--replace]`
- API: `POST /api/claude-code/failover-default`
- GUI Claude Code page: Failover Default card + Apply (Impeccable polish)
- Docs note under Claude Code / Cursor IDE

## Non-Goals

- Rotate on every HTTP 200
- Silent intercept of all bare Anthropic ids without apply (option B)
