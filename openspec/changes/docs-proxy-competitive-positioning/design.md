## Context

opencodex docs cover install, lifecycle, providers, and Codex/Claude integration, but not **category positioning**. Explorer survey (2026-07-30) ranked adjacent tools by stars and jobs:

| Tool | Approx. stars | Primary job |
|------|---------------|-------------|
| LiteLLM | ~55k | Org / multi-provider API gateway |
| Claude Code Router (CCR) | ~36k | Multi-agent routing control plane |
| opencodex | ~5.9k | Codex + Claude Code provider proxy + account pool |
| go-llm-proxy | niche | Protocol bridge + vision/OCR/search inject |

Constraints: docs live in Starlight (`docs-site/`); English is source of truth; locales must not contradict English. Runtime (`src/`) is out of scope.

## Goals / Non-Goals

**Goals:**
- Publish one durable “Compare Proxies” guide with honest JTBD framing.
- Wire Guides sidebar (EN + locale labels).
- Keep locale pages consistent with English (full translation preferred; short faithful stubs acceptable if time-boxed).

**Non-Goals:**
- Benchmarking latency/cost or claiming superiority on stars.
- Changing proxy routing, adapters, GUI, or config schema.
- Deep product marketing pages for competitors (link out; do not mirror their docs).
- Installing or recommending ECC / skill frameworks (wrong category).

## Decisions

1. **Slug `guides/compare-proxies`**  
   - Rationale: Fits existing Guides IA; “compare” is discoverable; avoids “vs” SEO spam.  
   - Alternative: `getting-started/why-opencodex` — rejected (sounds marketing-first, buried before providers).

2. **Four-column mental model (job → choose when → not for)**  
   - Rationale: Matches Explorer findings; reduces feature-matrix rot.  
   - Alternative: Large checkbox matrix — rejected (goes stale as peers ship features).

3. **Star counts as dated snapshot footnote, not headline**  
   - Rationale: Stars swing; niche ≠ quality. Include “as of YYYY-MM-DD” once.  
   - Alternative: Live star badges — rejected (build complexity, vanity metric).

4. **Locale strategy: English first + mirrored pages**  
   - Rationale: AGENTS.md docs-sync; Starlight locales already exist for every guide.  
   - Alternative: English-only until translators catch up — allowed only if locale stubs clearly say “English source; translation pending” without contradicting facts; prefer real translations for this short page.

5. **Optional README one-liner**  
   - Link to the guide under a “Related / positioning” blurb. Skip if README is already dense; not required for G1.

## Risks / Trade-offs

- **[Risk] Competitor owners dispute framing** → Mitigation: Cite public README job statements; keep language descriptive (“aimed at…”) not pejorative.
- **[Risk] Guide drifts as peers evolve** → Mitigation: JTBD sections + dated star footnote; no feature parity table.
- **[Risk] Locale lag contradicts EN** → Mitigation: Spec requires non-contradiction; ship EN + locales in same change.
- **[Trade-off] Naming CCR** → Use “Claude Code Router (CCR)” once, then CCR; link canonical repo.

## Migration Plan

1. Land OpenSpec artifacts; user confirms G1.
2. Add EN page + sidebar + locale pages in one PR.
3. Rollback = delete page + sidebar entry (no data migration).

## Open Questions

1. Exact CCR / go-llm-proxy GitHub URLs to cite (confirm at apply time via `gh`).
2. Include claude-code-proxy (~3.7k) as a short “also nearby” note, or keep the four-tool set only?
3. README cross-link: yes / no?
