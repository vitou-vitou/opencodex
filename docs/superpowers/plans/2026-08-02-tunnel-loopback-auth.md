# Tunnel loopback auth — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fail closed on public `Host` even when bind is loopback.  
**Architecture:** Extend `auth-cors.ts` with per-request Host / trusted-forwarded-host checks; keep bind-only startup assert.  
**Tech stack:** Bun TypeScript, existing `tests/server-auth.test.ts`, docs-site Starlight, GUI i18n.

---

### Task 1: Auth helpers + wire into hasValidApiAuth

**Files:**
- Modify: `src/server/auth-cors.ts`
- Test: `tests/server-auth.test.ts`

- [ ] 1.1 Add failing tests for public Host / trust proxy matrix
- [ ] 1.2 Implement `isTrustProxyEnabled`, `requestEffectiveHostname`, `isApiAuthRequiredForRequest`
- [ ] 1.3 Use request-aware check in `hasValidApiAuth`, `requireResponsesApiAuth`, `isAllowedRequestOrigin`
- [ ] 1.4 Run focused `server-auth` tests

### Task 2: Docs + thin GUI

- [ ] 2.1 Remote access docs (tunnel footgun + headers)
- [ ] 2.2 API page Remote snippet + i18n (all locales)

### Task 3: Verify

- [ ] 3.1 typecheck + focused tests
- [ ] 3.2 Aikido scan
