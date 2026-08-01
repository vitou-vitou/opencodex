import { describe, expect, test } from "bun:test";
import {
  KIRO_MODELS,
  KIRO_MODEL_CONTEXT_WINDOWS,
  KIRO_PRUNED_INVALID_MODEL_IDS,
  normalizeKiroModelId,
} from "../src/providers/kiro-models";

describe("Kiro static catalog prune", () => {
  test("pruned INVALID_MODEL_ID ids stay out of KIRO_MODELS", () => {
    const set = new Set(KIRO_MODELS);
    for (const id of KIRO_PRUNED_INVALID_MODEL_IDS) {
      expect(set.has(id)).toBe(false);
    }
  });

  test("context-window keys are a subset of catalog models (excluding kiro-auto)", () => {
    const catalog = new Set(KIRO_MODELS);
    for (const id of Object.keys(KIRO_MODEL_CONTEXT_WINDOWS)) {
      expect(catalog.has(id)).toBe(true);
    }
  });

  test("every non-auto catalog model has a context window", () => {
    for (const id of KIRO_MODELS) {
      if (id === "kiro-auto" || id === "auto") continue;
      expect(KIRO_MODEL_CONTEXT_WINDOWS[id]).toBeGreaterThan(0);
    }
  });

  test("normalizeKiroModelId still maps dotted Claude ids", () => {
    expect(normalizeKiroModelId("kiro/claude-sonnet-4.5")).toBe("claude-sonnet-4.5");
    expect(normalizeKiroModelId("claude-4.5-sonnet")).toBe("claude-sonnet-4.5");
  });
});
