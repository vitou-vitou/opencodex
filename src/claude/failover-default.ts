/**
 * Failover Default (option C): replace Claude Code Default slots with ranked
 * family-chain heads and mirror chains onto client-facing aliases so hops work.
 *
 * Does NOT rotate on every HTTP 200 — hops only on failure / cooldown / threshold.
 */
import { saveConfigPreservingClaudeCode } from "../config";
import type { OcxClaudeDesktopFamily, OcxClaudeRouteCandidate, OcxConfig } from "../types";
import { claudeCodeAlias } from "./alias";
import {
  DESKTOP_CHAIN_FAMILIES,
  ensureRecommendedFamilyChains,
} from "./route-chains";
import { applyIdeClaudeEnv, type IdeApplyResult } from "./ide-settings-env";
import { findLiveProxy } from "../server/proxy-liveness";

/** Common Claude Code Default / Opus ids that should remap to the ranked opus head. */
export const FAILOVER_DEFAULT_OPUS_IDS = [
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-opus-4-5",
] as const;

function familyHead(
  chains: Record<string, OcxClaudeRouteCandidate[]> | undefined,
  family: OcxClaudeDesktopFamily,
): OcxClaudeRouteCandidate | undefined {
  const chain = chains?.[family];
  return Array.isArray(chain) && chain.length > 0 ? chain[0] : undefined;
}

function headAlias(candidate: OcxClaudeRouteCandidate): string {
  return claudeCodeAlias(candidate.provider, candidate.model);
}

export interface FailoverDefaultResult {
  added: OcxClaudeDesktopFamily[];
  replaced: OcxClaudeDesktopFamily[];
  heads: Partial<Record<OcxClaudeDesktopFamily, string>>;
  opusAlias?: string;
  ide?: IdeApplyResult;
}

export type FailoverDefaultDeps = {
  save?: (config: OcxConfig) => void;
  findLiveProxy?: typeof findLiveProxy;
  applyIde?: typeof applyIdeClaudeEnv;
};

/**
 * Mutates + saves config, then refreshes IDE env (Claude home + Cursor).
 */
export async function applyFailoverDefault(
  config: OcxConfig,
  opts: { replace?: boolean; skipIde?: boolean; port?: number } = {},
  deps: FailoverDefaultDeps = {},
): Promise<FailoverDefaultResult> {
  const replace = opts.replace === true;
  const { added, replaced } = ensureRecommendedFamilyChains(config, replace);

  // ensureRecommendedFamilyChains no-ops when nothing changes — still ensure routing object exists
  // after a prior apply so we can re-point slots.
  if (!config.claudeCode?.routing?.chains) {
    ensureRecommendedFamilyChains(config, true);
  }

  const chains = { ...(config.claudeCode?.routing?.chains ?? {}) };
  const heads: Partial<Record<OcxClaudeDesktopFamily, string>> = {};
  const tierModels: { opus?: string; sonnet?: string; haiku?: string; fable?: string } = {
    ...(config.claudeCode?.tierModels ?? {}),
  };

  for (const family of DESKTOP_CHAIN_FAMILIES) {
    const head = familyHead(chains, family);
    if (!head) continue;
    const alias = headAlias(head);
    heads[family] = alias;
    tierModels[family] = alias;
    // Client sends the alias when Default/tier env is set — chain must be keyed by that id.
    chains[alias] = (chains[family] ?? []).map(c => ({ ...c }));
    const routeKey = `${head.provider}/${head.model}`;
    chains[routeKey] = (chains[family] ?? []).map(c => ({ ...c }));
  }

  const opusAlias = heads.opus;
  const modelMap: Record<string, string> = { ...(config.claudeCode?.modelMap ?? {}) };
  if (opusAlias) {
    for (const id of FAILOVER_DEFAULT_OPUS_IDS) {
      modelMap[id] = opusAlias;
      // Chain lookup uses the raw client model id (before modelMap).
      chains[id] = (chains.opus ?? []).map(c => ({ ...c }));
    }
  }

  config.claudeCode = {
    ...(config.claudeCode ?? {}),
    routing: {
      ...(config.claudeCode?.routing ?? {}),
      chains,
      threshold: config.claudeCode?.routing?.threshold ?? 90,
      maxHops: config.claudeCode?.routing?.maxHops ?? 3,
    },
    tierModels,
    ...(opusAlias ? { model: opusAlias } : {}),
    modelMap,
  };

  (deps.save ?? saveConfigPreservingClaudeCode)(config);

  let ide: IdeApplyResult | undefined;
  if (!opts.skipIde) {
    const live = await (deps.findLiveProxy ?? findLiveProxy)();
    const port = opts.port ?? live?.port ?? config.port ?? 10100;
    ide = (deps.applyIde ?? applyIdeClaudeEnv)({ config, port });
  }

  return { added, replaced, heads, ...(opusAlias ? { opusAlias } : {}), ...(ide ? { ide } : {}) };
}
