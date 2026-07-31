## 1. Confirm peer facts

- [x] 1.1 Confirm canonical GitHub URLs and one-line README jobs for LiteLLM, CCR, and go-llm-proxy via `gh` / public README
- [x] 1.2 Decide open questions: include claude-code-proxy “also nearby” note? README cross-link yes/no?

## 2. English guide

- [x] 2.1 Add `docs-site/src/content/docs/guides/compare-proxies.md` with niche + four JTBD sections + dated star footnote
- [x] 2.2 Add Guides sidebar entry (slug `guides/compare-proxies`) with locale label translations in `docs-site/astro.config.mjs`

## 3. Locales

- [x] 3.1 Add `guides/compare-proxies` pages under ko, zh-cn, ru, ja that do not contradict English
- [x] 3.2 Spot-check niche / “choose when” framing matches EN across locales

## 4. Optional polish + verify

- [x] 4.1 If approved in 1.2, add a one-line README pointer to the guide
- [x] 4.2 Build or preview docs-site enough to confirm sidebar link and page render
- [x] 4.3 Confirm diff touches only docs / sidebar / optional README (no `src/` or GUI behavior changes)
