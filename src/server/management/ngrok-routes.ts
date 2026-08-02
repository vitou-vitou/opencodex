import { loadConfig, saveConfig } from "../../config";
import {
  getNgrokRuntimeSnapshot,
  resolveNgrokToken,
  startNgrokProcess,
  stopNgrokProcess,
} from "../../ngrok/manager";
import type { OcxConfig } from "../../types";
import { getServerListenPort } from "../lifecycle";
import { jsonResponse } from "../auth-cors";
import type { ManagementContext } from "./context";

function listenPortFor(config: OcxConfig): number {
  const live = getServerListenPort();
  if (typeof live === "number" && live > 0) return live;
  return config.port > 0 ? config.port : 10100;
}

function ngrokDto(config: OcxConfig, port: number) {
  return getNgrokRuntimeSnapshot(config, port);
}

export async function handleNgrokRoutes(ctx: ManagementContext): Promise<Response | null> {
  const { req, url, config } = ctx;

  if (url.pathname === "/api/ngrok" && req.method === "GET") {
    return jsonResponse(ngrokDto(config, listenPortFor(config)));
  }

  if (url.pathname === "/api/ngrok" && req.method === "PUT") {
    let parsedBody: unknown;
    try {
      parsedBody = await req.json();
    } catch {
      return jsonResponse({ error: "invalid JSON body" }, 400);
    }
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return jsonResponse({ error: "body must be an object" }, 400);
    }
    const body = parsedBody as { enabled?: unknown; authToken?: unknown };
    const wantsEnabled = body.enabled !== undefined;
    const wantsToken = body.authToken !== undefined;
    if (!wantsEnabled && !wantsToken) {
      return jsonResponse({ error: "body must set enabled and/or authToken" }, 400);
    }
    if (wantsEnabled && typeof body.enabled !== "boolean") {
      return jsonResponse({ error: "enabled must be a boolean" }, 400);
    }
    if (wantsToken && body.authToken !== null && typeof body.authToken !== "string") {
      return jsonResponse({ error: "authToken must be a string or null" }, 400);
    }

    const next = loadConfig();
    next.ngrok = { ...(next.ngrok ?? {}) };

    if (wantsToken) {
      if (body.authToken === null || (typeof body.authToken === "string" && body.authToken.trim() === "")) {
        delete next.ngrok.authToken;
      } else {
        next.ngrok.authToken = (body.authToken as string).trim();
      }
    }

    const port = listenPortFor(next);

    if (wantsEnabled && body.enabled === false) {
      await stopNgrokProcess();
      next.ngrok.enabled = false;
      saveConfig(next);
      Object.assign(config, next);
      return jsonResponse({ ok: true, ...ngrokDto(next, port) });
    }

    if (wantsEnabled && body.enabled === true) {
      const token = resolveNgrokToken(next);
      if (!token) {
        saveConfig(next);
        Object.assign(config, next);
        return jsonResponse({
          ...ngrokDto(next, port),
          error: "Ngrok auth token missing. Set NGROK_AUTHTOKEN or save a token on the Ngrok page.",
        }, 400);
      }
      const started = await startNgrokProcess(port, token);
      if (!started.ok) {
        next.ngrok.enabled = false;
        saveConfig(next);
        Object.assign(config, next);
        return jsonResponse({ ...ngrokDto(next, port), error: started.error }, 400);
      }
      next.ngrok.enabled = true;
      saveConfig(next);
      Object.assign(config, next);
      return jsonResponse({ ok: true, ...ngrokDto(next, port) });
    }

    // Token-only update.
    if (!next.ngrok.authToken && next.ngrok.enabled !== true) {
      // Preserve empty object only if enabled was already set; otherwise drop.
      if (next.ngrok.enabled === undefined) delete next.ngrok;
    }
    saveConfig(next);
    Object.assign(config, next);
    return jsonResponse({ ok: true, ...ngrokDto(loadConfig(), port) });
  }

  return null;
}
