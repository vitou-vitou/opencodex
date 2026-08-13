## Why

Cursor IDE’s Claude Code chat does not inherit `ocx claude` process env. Operators who already run the proxy on `:10100` (and even created `cursor-claude-fallback` admission keys) still have empty `~/.claude/settings.json` `env` and no `claudeCode.environmentVariables` in Cursor User settings — so IDE chat never hits the proxy.

## What Changes

- Add `ocx claude ide apply|show|revert` to write proxy env into:
  - `~/.claude/settings.json` → `env`
  - Cursor User `settings.json` → `claudeCode.environmentVariables` (when Cursor is installed)
- Reuse the same auth/admission rules as `buildClaudeEnv` / manual-env snippet.
- GUI Claude Code quickstart: Cursor/IDE apply hint + command.
- Docs: Cursor IDE section under Claude Code guide.

## Capabilities

### New Capabilities

- `cursor-ide-claude-proxy-wire`: Persist Claude Code IDE env so Cursor (and VS Code Claude extension) route through opencodex.

### Modified Capabilities

- (none)

## Impact

- `src/claude/ide-settings-env.ts` (new)
- `src/cli/claude-ide.ts` (new)
- `src/cli/index.ts`, `src/cli/help.ts`
- `gui/src/pages/claude-code-sections.tsx` + i18n
- `docs-site/.../guides/claude-code.md` (+ locales)
- tests

## Non-Goals

- macOS `launchctl` for Cursor Electron (still unsupported on Windows)
- Changing Cursor-as-LLM-provider adapter
- Auto-starting the proxy from the IDE extension
