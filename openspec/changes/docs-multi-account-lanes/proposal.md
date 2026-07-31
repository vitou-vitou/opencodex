## Why

Explorer research showed newcomers confuse two “multi Codex account” jobs: **parallel fleets** (N accounts × N concurrent agents) vs **quota pools** (one active path; rotate on 429/quota with thread affinity). opencodex implements the latter, but docs, Codex Auth copy, and CLI help still read like generic “rotation” and can be mistaken for parallel fleets.

## What Changes

- Docs: call out “not a parallel fleet” on How It Works and Compare Proxies (all locales).
- GUI: strengthen Pool / auto-switch copy and add an explicit pool-not-parallel note on Codex Auth.
- CLI: clarify accounts / auto-switch help as quota-pool + thread affinity (no new routing strategies).

## Capabilities

### New Capabilities

- `docs-multi-account-lanes`: User-facing clarity that opencodex Codex account pooling is a sequential/failover quota pool with thread affinity, not N parallel Codex sessions.

### Modified Capabilities

- (none)

## Impact

- `docs-site/` (how-it-works, compare-proxies + locales)
- `gui/src/i18n/*`, `gui/src/pages/CodexAuth.tsx`
- `src/cli/` account help strings (+ focused help test if applicable)
- No changes to Codex pick/affinity algorithms
