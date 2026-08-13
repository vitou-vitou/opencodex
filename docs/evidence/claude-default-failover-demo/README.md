# Claude Default → ranked failover (demo)

**Status:** waiting for pick (A / B / C). No production code yet.

## Goal

When Cursor Claude Code uses **Default**, route through opencodex with **arena ranking** and **hop on failure** (non-200 / cooldown), not fixed Anthropic Opus.

## Path map

| Surface | Path | Share? |
|---------|------|--------|
| Cursor Claude picker **Default** | Claude Code → `ANTHROPIC_DEFAULT_*` / built-in Opus | Client-owned label |
| IDE env | `ocx claude ide apply` → settings `env` | Already shipped |
| Proxy inbound | `POST /v1/messages` → `resolveClaudeRoute` / `routing.chains` | Core |
| Arena rank | `ocx claude route refresh-arena` / `ensure-chains` | Exists; **your `routing` is null** |
| Dashboard Claude page | GUI apply / status | Polish target if C |

## Important constraint

**Nothing rotates on every HTTP 200.** Failover hops on failure / cooldown / threshold — success sticks to the chosen hop.

## Options

| | Idea | Diff size | Risk |
|---|------|-----------|------|
| **A** | Remap Default slots (`tierModels` / `ANTHROPIC_MODEL`) to gateway aliases + `ensure-chains` | Small | Picker may still say “Opus 5” |
| **B** | Intercept bare `claude-opus-5` into `chains.opus` | Medium–large | Breaks native Opus / subscription pierce |
| **C** ★ | Explicit **Failover Default** apply (chains + tier slot + ide apply + GUI polish) | Medium | Clearest UX; recommended |

## Recommend

**C** — one operator action, uses existing routing, Impeccable polish on Claude Code page, no silent hijack of Anthropic Default.

## Artifacts

- `option-a-remap-slots.png`
- `option-b-intercept-opus.png`
- `option-c-failover-default.png`
- `compare-abc-default-failover.png`

## Lock

Reply **A**, **B**, or **C** (or `skip demo` / `just code C`).
