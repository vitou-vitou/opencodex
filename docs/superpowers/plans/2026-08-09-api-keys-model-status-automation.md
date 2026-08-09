# API Keys Model Status Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-fill the External model catalog Status column on load (all models) and via a **Test all** button (filtered list), using a concurrency-5 client pool over the existing chat-completions ping.

**Architecture:** Extract pure `runPool` + `probeModelChatCompletions` into `api-keys-utils.ts`. `ApiKeys.tsx` owns batch progress state, an in-flight id set (skip duplicates), auto-start after a successful catalog load, and wires **Test all** over `filteredModels`. Status cell UI stays unchanged.

**Tech Stack:** Bun, React, TypeScript, bun:test, existing GUI i18n (`useI18n` / `t`)

**Spec:** `docs/superpowers/specs/2026-08-09-api-keys-model-status-automation-design.md`

## Global Constraints

- Concurrency fixed at **5** (no UI to change it).
- Auto-load probes **all** loaded models; **Test all** probes **filtered** models only.
- One protocol only: `POST` chat-completions ping (`max_tokens: 1`, `stream: false`).
- No new backend routes; no Status persistence across reloads.
- No hardcoded user-facing strings — new copy goes in all six locale files (`en`, `de`, `ja`, `ko`, `ru`, `zh`).
- Numeric Status values / `—` / `…` remain technical literals (already shipped).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `gui/src/pages/api-keys-utils.ts` | Modify | `MODEL_TEST_CONCURRENCY`, `runPool`, `probeModelChatCompletions` |
| `gui/tests/api-keys-model-test-pool.test.ts` | Create | Unit tests for pool + probe result mapping |
| `gui/src/pages/ApiKeys.tsx` | Modify | Shared probe wiring, batch runner, auto-start, Test all handler |
| `gui/src/pages/api-keys-panels.tsx` | Modify | Test all button + progress in models panel header |
| `gui/src/i18n/en.ts` (+ `de`/`ja`/`ko`/`ru`/`zh`) | Modify | `api.testAll`, `api.testingAll` |
| `gui/tests/apikeys-layout.test.ts` | Modify | Guards for Test all + pool/auto wiring |
| `gui/src/styles.css` | Modify (minimal) | Optional header flex so button sits cleanly |

---

### Task 1: Pure pool + probe helpers (TDD)

**Files:**
- Modify: `gui/src/pages/api-keys-utils.ts`
- Create: `gui/tests/api-keys-model-test-pool.test.ts`

**Interfaces:**
- Consumes: existing `ModelTestEntry`
- Produces:
  - `MODEL_TEST_CONCURRENCY: 5`
  - `runPool<T>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void>`
  - `probeModelChatCompletions(chatCompletionsUrl: string, modelId: string, networkFailLabel: string, fetchFn?: typeof fetch): Promise<ModelTestEntry>`

- [ ] **Step 1: Write the failing tests**

```typescript
// gui/tests/api-keys-model-test-pool.test.ts
import { describe, expect, test } from "bun:test";
import {
  MODEL_TEST_CONCURRENCY,
  probeModelChatCompletions,
  runPool,
} from "../src/pages/api-keys-utils";

describe("MODEL_TEST_CONCURRENCY", () => {
  test("is 5", () => {
    expect(MODEL_TEST_CONCURRENCY).toBe(5);
  });
});

describe("runPool", () => {
  test("runs all items", async () => {
    const seen: number[] = [];
    await runPool([1, 2, 3], 2, async (n) => { seen.push(n); });
    expect(seen.sort()).toEqual([1, 2, 3]);
  });

  test("never exceeds concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    await runPool([1, 2, 3, 4, 5, 6], 3, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Bun.sleep(20);
      active -= 1;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  test("empty list resolves immediately", async () => {
    let calls = 0;
    await runPool([], 5, async () => { calls += 1; });
    expect(calls).toBe(0);
  });
});

describe("probeModelChatCompletions", () => {
  test("ok stores httpStatus", async () => {
    const fetchFn = (async () => new Response("{}", { status: 200 })) as typeof fetch;
    const entry = await probeModelChatCompletions("http://example/v1/chat/completions", "m1", "Failed", fetchFn);
    expect(entry).toEqual({ state: "ok", httpStatus: 200 });
  });

  test("http error stores status and detail", async () => {
    const fetchFn = (async () => new Response("nope", { status: 401 })) as typeof fetch;
    const entry = await probeModelChatCompletions("http://example/v1/chat/completions", "m1", "Failed", fetchFn);
    expect(entry.state).toBe("error");
    expect(entry.httpStatus).toBe(401);
    expect(entry.detail).toBe("nope");
  });

  test("network failure has no httpStatus", async () => {
    const fetchFn = (async () => { throw new Error("offline"); }) as typeof fetch;
    const entry = await probeModelChatCompletions("http://example/v1/chat/completions", "m1", "Failed", fetchFn);
    expect(entry).toEqual({ state: "error", detail: "offline" });
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `bun.exe test ./gui/tests/api-keys-model-test-pool.test.ts`

Expected: FAIL (exports missing / not defined)

- [ ] **Step 3: Implement helpers in `api-keys-utils.ts`**

Append (keep existing types/endpoints untouched):

```typescript
export const MODEL_TEST_CONCURRENCY = 5;

export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let next = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      await worker(items[index]!);
    }
  });
  await Promise.all(runners);
}

export async function probeModelChatCompletions(
  chatCompletionsUrl: string,
  modelId: string,
  networkFailLabel: string,
  fetchFn: typeof fetch = fetch,
): Promise<ModelTestEntry> {
  try {
    const res = await fetchFn(chatCompletionsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        stream: false,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return {
        state: "error",
        httpStatus: res.status,
        detail: detail.slice(0, 160) || String(res.status),
      };
    }
    return { state: "ok", httpStatus: res.status };
  } catch (error) {
    return {
      state: "error",
      detail: error instanceof Error ? error.message : networkFailLabel,
    };
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun.exe test ./gui/tests/api-keys-model-test-pool.test.ts`

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add gui/src/pages/api-keys-utils.ts gui/tests/api-keys-model-test-pool.test.ts
git commit -m "$(cat <<'EOF'
feat(gui): add model status probe pool helpers

EOF
)"
```

---

### Task 2: i18n keys for Test all

**Files:**
- Modify: `gui/src/i18n/en.ts` (source of truth / `TKey`)
- Modify: `gui/src/i18n/de.ts`, `ja.ts`, `ko.ts`, `ru.ts`, `zh.ts`

**Interfaces:**
- Produces keys: `api.testAll`, `api.testingAll` (vars `{done}`, `{total}`)

- [ ] **Step 1: Add English keys next to existing test keys**

In `gui/src/i18n/en.ts`, after `"api.testingModel"`:

```typescript
  "api.testAll": "Test all",
  "api.testingAll": "Testing {done}/{total}…",
```

- [ ] **Step 2: Mirror in every other locale**

Suggested strings (adjust if a locale already has a closer idiom):

| Locale | `api.testAll` | `api.testingAll` |
|--------|---------------|------------------|
| de | Alle testen | Teste {done}/{total}… |
| ja | すべてテスト | テスト中 {done}/{total}… |
| ko | 모두 테스트 | 테스트 중 {done}/{total}… |
| ru | Тестировать все | Тест {done}/{total}… |
| zh | 全部测试 | 测试中 {done}/{total}… |

- [ ] **Step 3: Lint i18n**

Run: `cd gui && bun.exe run lint:i18n`

Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add gui/src/i18n/*.ts
git commit -m "$(cat <<'EOF'
i18n(gui): add Test all labels for model status batch

EOF
)"
```

---

### Task 3: Batch runner + auto-start + row Test in `ApiKeys.tsx`

**Files:**
- Modify: `gui/src/pages/ApiKeys.tsx`

**Interfaces:**
- Consumes: `MODEL_TEST_CONCURRENCY`, `runPool`, `probeModelChatCompletions`, `externalModelId`
- Produces (passed to panel):
  - `batchProgress: { done: number; total: number } | null` — `null` when idle
  - `onTestAll: () => void`

- [ ] **Step 1: Import helpers**

```typescript
import {
  DEFAULT_ENDPOINTS,
  deriveApiEndpoints,
  MODEL_TEST_CONCURRENCY,
  probeModelChatCompletions,
  runPool,
  type ApiEndpointInfo,
  type ApiKeyEntry,
  type ModelTestEntry,
} from "./api-keys-utils";
```

- [ ] **Step 2: Add batch state + in-flight ref**

Inside `ApiKeys`:

```typescript
const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
const batchRunningRef = useRef(false);
const inFlightRef = useRef(new Set<string>());
const autoBatchStartedRef = useRef(false);
```

- [ ] **Step 3: Replace `testModel` with shared probe + skip-if-in-flight**

```typescript
const applyProbe = async (model: ExternalModelRow): Promise<void> => {
  const modelId = externalModelId(model);
  if (inFlightRef.current.has(modelId)) return;
  inFlightRef.current.add(modelId);
  setModelTests(current => ({ ...current, [modelId]: { state: "testing" } }));
  try {
    const entry = await probeModelChatCompletions(
      endpoints.chatCompletions,
      modelId,
      t("api.testFailed"),
    );
    setModelTests(current => ({ ...current, [modelId]: entry }));
  } finally {
    inFlightRef.current.delete(modelId);
  }
};

const startBatch = async (list: ExternalModelRow[]) => {
  if (batchRunningRef.current || list.length === 0) return;
  batchRunningRef.current = true;
  setBatchProgress({ done: 0, total: list.length });
  try {
    await runPool(list, MODEL_TEST_CONCURRENCY, async (model) => {
      await applyProbe(model);
      setBatchProgress(current => (
        current ? { ...current, done: Math.min(current.total, current.done + 1) } : current
      ));
    });
  } finally {
    batchRunningRef.current = false;
    setBatchProgress(null);
  }
};

const testModel = async (model: ExternalModelRow) => {
  await applyProbe(model);
};

const testAllFiltered = () => {
  void startBatch(filteredModels);
};
```

Note: `startBatch` / `applyProbe` must see current `endpoints` and `t`. Prefer `useCallback` with deps `[endpoints.chatCompletions, t]` for `applyProbe`, and wrap `startBatch` accordingly so the auto-effect is stable.

- [ ] **Step 4: Auto-start once after successful non-empty load**

```typescript
useEffect(() => {
  if (autoBatchStartedRef.current) return;
  if (modelsLoading || modelsLoadFailed || models.length === 0) return;
  autoBatchStartedRef.current = true;
  void startBatch(models);
}, [models, modelsLoading, modelsLoadFailed, startBatch]);
```

Do **not** reset `autoBatchStartedRef` on search changes. Reload / remount is the only auto re-run (matches non-goal: no persistence).

- [ ] **Step 5: Pass new props into `ApiKeysModelsPanel`**

```tsx
<ApiKeysModelsPanel
  ...
  batchProgress={batchProgress}
  onTestAll={testAllFiltered}
  onTestModel={(model) => { void testModel(model); }}
  ...
/>
```

- [ ] **Step 6: Typecheck**

Run: `bun.exe run typecheck`

Expected: exit 0 (panel props will fail until Task 4 — implement Task 4 in the same session before claiming green, or temporarily keep compiling by adding props in Task 4 immediately after)

If splitting commits: finish Task 4 before this typecheck, or commit Tasks 3–4 together.

- [ ] **Step 7: Commit** (after Task 4 if needed for compile)

```bash
git add gui/src/pages/ApiKeys.tsx
git commit -m "$(cat <<'EOF'
feat(gui): auto-batch and Test all for model Status probes

EOF
)"
```

---

### Task 4: Test all control in models panel header

**Files:**
- Modify: `gui/src/pages/api-keys-panels.tsx`
- Modify: `gui/src/styles.css` (only if header layout needs a flex gap)

**Interfaces:**
- Consumes: `batchProgress`, `onTestAll` from Task 3
- Status column rendering unchanged

- [ ] **Step 1: Extend `ApiKeysModelsPanel` props**

```typescript
  batchProgress: { done: number; total: number } | null;
  onTestAll: () => void;
```

- [ ] **Step 2: Render control in `api-panel-head`**

```tsx
<div className="api-panel-head">
  <h3 className="panel-title">{t("api.modelsTitle")}</h3>
  <span className="muted mono text-label">{t("api.modelsCount", { count: filteredModels.length })}</span>
  {batchProgress ? (
    <span className="muted small mono" aria-live="polite">
      {t("api.testingAll", { done: batchProgress.done, total: batchProgress.total })}
    </span>
  ) : (
    <button
      type="button"
      className="btn btn-sm btn-ghost"
      disabled={modelsLoading || modelsLoadFailed || filteredModels.length === 0}
      onClick={onTestAll}
    >
      {t("api.testAll")}
    </button>
  )}
</div>
```

- [ ] **Step 3: Ensure header layout**

If `.api-panel-head` is not already a flex row with gap, add:

```css
.api-panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
```

(Only add if missing — do not duplicate.)

- [ ] **Step 4: Commit**

```bash
git add gui/src/pages/api-keys-panels.tsx gui/src/styles.css
git commit -m "$(cat <<'EOF'
feat(gui): show Test all control on model catalog header

EOF
)"
```

---

### Task 5: Layout / wiring guards + rebuild

**Files:**
- Modify: `gui/tests/apikeys-layout.test.ts`

- [ ] **Step 1: Extend layout test assertions**

In the stacked-layout / models section of `gui/tests/apikeys-layout.test.ts`, add:

```typescript
expect(src).toContain('t("api.testAll")');
expect(src).toContain("batchProgress");
expect(page).toContain("runPool(");
expect(page).toContain("MODEL_TEST_CONCURRENCY");
expect(page).toContain("autoBatchStartedRef");
expect(page).toContain("startBatch(models)");
expect(page).toContain("startBatch(filteredModels)");
```

- [ ] **Step 2: Run layout + pool tests**

Run:

```bash
bun.exe test ./gui/tests/apikeys-layout.test.ts ./gui/tests/api-keys-model-test-pool.test.ts
cd gui && bun.exe run lint:i18n
bun.exe run typecheck
```

Expected: all green

- [ ] **Step 3: Rebuild packaged GUI**

Run: `bun.exe run build:gui`

Expected: Vite build succeeds; hard-refresh dashboard to verify Status fills automatically and **Test all** appears.

- [ ] **Step 4: Commit**

```bash
git add gui/tests/apikeys-layout.test.ts gui/dist
git commit -m "$(cat <<'EOF'
test(gui): guard model Status batch wiring; rebuild dist

EOF
)"
```

Only commit `gui/dist` if this repo normally commits built GUI assets after dashboard UI changes (it does for proxy-served UI). If dist is huge/noisy, follow existing branch practice — include it when the Status column rebuild required it.

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Auto-probe all models on successful load | Task 3 |
| Test all → filtered only | Task 3 + 4 |
| Concurrency 5 | Task 1 (`MODEL_TEST_CONCURRENCY`) |
| Reuse Status cell / ModelTestEntry | Tasks 1–3 (no Status UI change) |
| Skip duplicate in-flight | Task 3 (`inFlightRef`) |
| Progress i18n `{done}/{total}` | Tasks 2 + 4 |
| Per-row Test kept | Task 3 (`applyProbe`) |
| No backend / no persistence / chat-only | Global constraints + Tasks 1–3 |
| Unit test pool | Task 1 |
| Layout guards | Task 5 |

## Placeholder / consistency scan

- No TBD/TODO left in steps.
- Names consistent: `runPool`, `probeModelChatCompletions`, `MODEL_TEST_CONCURRENCY`, `batchProgress`, `startBatch`, `applyProbe`, `inFlightRef`, `autoBatchStartedRef`.
- Commit Tasks 3+4 together if typecheck otherwise fails mid-split.
