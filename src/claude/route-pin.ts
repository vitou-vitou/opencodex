import type { OcxConfig } from "../types";
import { saveConfigPreservingClaudeCode } from "../config";

export function getRoutePin(config: OcxConfig): { provider: string; hard: boolean } | null {
  const pin = config.claudeCode?.routing?.pin;
  if (!pin || typeof pin.provider !== "string" || pin.provider.length === 0) return null;
  return { provider: pin.provider, hard: pin.hard === true };
}

export function setRoutePin(
  config: OcxConfig,
  pin: { provider: string; hard: boolean } | null,
): OcxConfig {
  const claudeCode = { ...(config.claudeCode ?? {}) };
  const routing = { ...(claudeCode.routing ?? {}) };
  if (pin) routing.pin = { provider: pin.provider, hard: pin.hard };
  else delete routing.pin;
  claudeCode.routing = routing;
  config.claudeCode = claudeCode;
  saveConfigPreservingClaudeCode(config);
  return config;
}
