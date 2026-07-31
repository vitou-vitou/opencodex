## Why

Explorer research (2026-07-30) showed newcomers often confuse **opencodex** with adjacent LLM proxies (LiteLLM, Claude Code Router, go-llm-proxy). The docs site explains how opencodex works but never states **when to choose it vs peers**, so positioning lives only in tribal knowledge and star-count noise.

## What Changes

- Add an English docs guide that positions opencodex against LiteLLM, Claude Code Router (CCR), and go-llm-proxy (job-to-be-done, not a feature laundry list).
- Wire the page into the docs-site Guides sidebar (with locale sidebar labels).
- Add short, non-contradictory locale stubs (or translated pages) so non-English locales do not fall back to stale/empty expectations.
- Optionally add a one-paragraph “Related tools” pointer from Getting Started / README — no runtime or API changes.

## Capabilities

### New Capabilities

- `docs-competitive-positioning`: User-facing documentation that states opencodex’s niche (Codex / Claude Code provider proxy + account pool) and contrasts it with LiteLLM (org gateway), CCR (multi-agent control plane), and go-llm-proxy (protocol / vision-OCR-search inject), with clear “choose X when…” guidance.

### Modified Capabilities

- (none — no existing `openspec/specs/` capabilities; docs-only change)

## Impact

- `docs-site/src/content/docs/` (new guide + locale mirrors)
- `docs-site/astro.config.mjs` (sidebar entry)
- Possibly `README.md` (short cross-link only)
- No changes to `src/` proxy runtime, APIs, config schema, or GUI
