export const KIRO_MODELS = [
  "kiro-auto",
  // Probe 2026-08-01 (us-east-1 Kiro login via ocx /v1/messages): only these IDs returned 200.
  // Docs-listed Claude Opus / newer Sonnet / GPT-5.6 tiers were rejected as INVALID_MODEL_ID.
  "claude-sonnet-4.5",
  "claude-haiku-4.5",
  "deepseek-3.2",
  "minimax-m2.5",
  "minimax-m2.1",
  "glm-5",
  "qwen3-coder-next",
];

/** Model IDs pruned after live INVALID_MODEL_ID probe — must stay out of KIRO_MODELS. */
export const KIRO_PRUNED_INVALID_MODEL_IDS = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "claude-sonnet-5",
  "claude-opus-5",
  "claude-opus-4.8",
  "claude-opus-4.7",
  "claude-opus-4.6",
  "claude-opus-4.5",
  "claude-sonnet-4.6",
  "claude-sonnet-4.0",
] as const;

// Per-model context windows as documented on Kiro's official model catalog
// (https://kiro.dev/docs/models/ — "Quick comparison", page updated 2026-07-14).
// "Auto" is a router with no fixed window on Kiro's table, so it is intentionally omitted.
export const KIRO_MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "claude-sonnet-4.5": 200_000,
  "claude-haiku-4.5": 200_000,
  "deepseek-3.2": 128_000,
  "minimax-m2.5": 200_000,
  "minimax-m2.1": 200_000,
  "glm-5": 200_000,
  "qwen3-coder-next": 256_000,
};

const KIRO_REASONING_EFFORTS = ["low", "medium", "high", "xhigh", "max"];

// Remaining catalog models map efforts to bounded thinking instructions until native
// effort support is verified for these IDs.
export const KIRO_MODEL_REASONING_EFFORTS: Record<string, string[]> = Object.fromEntries(
  KIRO_MODELS.map(id => [id, KIRO_REASONING_EFFORTS]),
);

export function normalizeKiroModelId(id: string): string {
  let model = id.trim().toLowerCase();
  model = model.replace(/^kiro\//, "").replace(/^kiro-/, "");
  if (model === "auto") return "auto";

  model = model.replace(/-\d{8}$/, "");
  model = model.replace(/-(low|medium|high|xhigh|max)$/, "");
  model = model.replace(/(\d+)-(\d+)/g, "$1.$2");
  model = model.replace(/^claude-([\d.]+)-(sonnet|opus|haiku)$/, "claude-$2-$1");
  return model;
}
