# Task 2 Report: Route Cooldown Map & TTL Derivation

## Summary
Successfully implemented a pure in-memory cooldown map with TTL-from-status math for Claude Code provider failover. All tests pass, implementation complete.

## Files Created

1. **`src/claude/route-cooldowns.ts`** (69 lines)
   - Exports: `RouteCooldownSource`, `RouteCooldown`, `ttlForStatus()`, `coolCandidate()`, `candidateCooldown()`, `clearCandidateCooldown()`, `clearAllCooldowns()`, `activeCooldowns()`
   - Self-contained in-memory Map<string, RouteCooldown>
   - No external dependencies or imports

2. **`tests/claude-route-cooldowns.test.ts`** (61 lines)
   - 10 test cases across two describe blocks
   - Uses `afterEach(clearAllCooldowns())` for test isolation
   - Full coverage of TTL derivation and cooldown lifecycle

## TDD Steps & Output

### Step 1: Write failing test
✓ Created `tests/claude-route-cooldowns.test.ts` with complete test suite

### Step 2: Run test to verify fail
```
$ bun test tests/claude-route-cooldowns.test.ts

# Result: FAIL (module not found)
Unhandled error: Cannot find module '../src/claude/route-cooldowns'

0 pass
1 fail
1 error
```

### Step 3: Write implementation
✓ Created `src/claude/route-cooldowns.ts` with all required functions:
- `ttlForStatus(status, opts?)`: Maps HTTP status to TTL + source
  - 401/403 → 60s (reauth)
  - 429 → 60s default, prefers Retry-After, falls back to resetAt
  - 5xx/0 → 30s (upstream_error)
- `coolCandidate(key, source, ttlMs, now?)`: Stores/updates cooldown, keeps later expiry
- `candidateCooldown(key, now?)`: Reads cooldown (null if absent or expired)
- `clearCandidateCooldown(key)`: Removes one entry
- `clearAllCooldowns()`: Clears all entries (test isolation)
- `activeCooldowns(now?)`: Returns filtered non-expired entries

### Step 4: Run test to verify pass
```
$ bun test tests/claude-route-cooldowns.test.ts

 10 pass
 0 fail
 13 expect() calls
Ran 10 tests across 1 file. [40.00ms]
```

### Step 5: Commit
```
$ git add src/claude/route-cooldowns.ts tests/claude-route-cooldowns.test.ts
$ git commit -m "feat(claude): add route cooldown map and TTL derivation"

[vitou/feat/claude-provider-failover 1215c5c9]
 2 files changed, 130 insertions(+)
```

## Commit Details
- **Hash**: `1215c5c9`
- **Message**: `feat(claude): add route cooldown map and TTL derivation`
- **Branch**: `vitou/feat/claude-provider-failover`
- **Files**: 2 created, 130 lines added

## Test Coverage
- ✓ TTL defaults (429→60s, 401→60s, 5xx→30s)
- ✓ Retry-After override for 429
- ✓ resetAt-derived TTL for 429 when Retry-After absent
- ✓ Cooldown set/read within TTL
- ✓ Expired cooldown cleanup
- ✓ Repeat write idempotence (keeps later until)
- ✓ Single key + all keys clear operations
- ✓ Active cooldowns filters expired entries

## Implementation Notes
- Self-contained: no imports, pure functions with in-memory Map
- TTL math: `until = now + Math.max(0, ttlMs)` prevents negative expiries
- Idempotency: `coolCandidate()` compares `existing.until >= until` to keep the later expiry on repeat writes
- Cleanup: `candidateCooldown()` auto-deletes expired entries during read
- Source validation: `ttlForStatus()` strictly validates `retryAfterMs` and `resetAt` types before use

## Concerns
None. Implementation matches spec exactly, all tests pass, code is clean and testable.
