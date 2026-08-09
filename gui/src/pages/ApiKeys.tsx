import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Notice } from "../ui";
import { useI18n, LOCALES } from "../i18n/shared";
import { readJsonIfOk, readJsonOrThrow } from "../fetch-json";
import {
  classifyExternalModel,
  externalModelId,
  type ExternalModelRow,
} from "../api-access-models";
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
import {
  ApiKeysAuthPanel,
  ApiKeysEndpointsPanel,
  ApiKeysManagePanel,
  ApiKeysModelsPanel,
  ApiKeysUsagePanel,
} from "./api-keys-panels";

interface KeysResponse {
  keys?: ApiKeyEntry[];
  endpoint?: string;
  baseUrl?: string;
  responsesEndpoint?: string;
  chatCompletionsEndpoint?: string;
  messagesEndpoint?: string;
  modelsEndpoint?: string;
  claudeCodeEnabled?: boolean;
}

interface CreateKeyResponse {
  key?: unknown;
}

export default function ApiKeys({ apiBase }: { apiBase: string }) {
  const { t, locale } = useI18n();
  const localeTag = LOCALES.find(l => l.code === locale)?.htmlLang;
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [endpoints, setEndpoints] = useState<ApiEndpointInfo>(DEFAULT_ENDPOINTS);
  const [claudeCodeEnabled, setClaudeCodeEnabled] = useState(true);
  const [keysLoadFailed, setKeysLoadFailed] = useState(false);
  const [keysHydrated, setKeysHydrated] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [models, setModels] = useState<ExternalModelRow[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsLoadFailed, setModelsLoadFailed] = useState(false);
  const [modelQuery, setModelQuery] = useState("");
  const [copiedModelId, setCopiedModelId] = useState<string | null>(null);
  const [modelTests, setModelTests] = useState<Record<string, ModelTestEntry>>({});
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const creatingRef = useRef(false);
  const batchRunningRef = useRef(false);
  const inFlightRef = useRef(new Set<string>());
  const autoBatchStartedRef = useRef(false);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/keys`);
      const data = await readJsonIfOk<KeysResponse>(res);
      if (!data) {
        // Keep last-good keys/endpoints/Claude setting; only mark the refresh failed.
        setKeysLoadFailed(true);
        return;
      }
      const derived = deriveApiEndpoints(data.endpoint ?? "");
      setKeys(data.keys ?? []);
      setEndpoints({
        baseUrl: data.baseUrl ?? derived.baseUrl,
        responses: data.responsesEndpoint ?? data.endpoint ?? DEFAULT_ENDPOINTS.responses,
        chatCompletions: data.chatCompletionsEndpoint ?? derived.chatCompletions,
        messages: data.messagesEndpoint ?? derived.messages,
        models: data.modelsEndpoint ?? derived.models,
      });
      setClaudeCodeEnabled(data.claudeCodeEnabled !== false);
      setKeysLoadFailed(false);
    } catch {
      setKeysLoadFailed(true);
    } finally {
      // Endpoint derivation finished (success or fail); unlock auto Status batch.
      setKeysHydrated(true);
    }
  }, [apiBase]);

  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsLoadFailed(false);
    try {
      const res = await fetch(`${apiBase}/v1/models`);
      if (!res.ok) {
        setModels([]);
        setModelsLoadFailed(true);
        return;
      }
      const data = await res.json() as unknown;
      const rawRows = Array.isArray(data)
        ? data
        : (typeof data === "object" && data !== null && Array.isArray((data as { data?: unknown }).data)
          ? (data as { data: unknown[] }).data
          : null);
      if (!rawRows) {
        setModels([]);
        setModelsLoadFailed(true);
        return;
      }
      const rows = rawRows
        .filter((row): row is { id: string; owned_by?: string } => (
          typeof row === "object"
          && row !== null
          && typeof (row as { id?: unknown }).id === "string"
        ))
        .map(row => classifyExternalModel(row))
        .sort((a, b) => externalModelId(a).localeCompare(externalModelId(b)));
      setModels(rows);
    } catch {
      setModels([]);
      setModelsLoadFailed(true);
    } finally {
      setModelsLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchKeys();
      void fetchModels();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [fetchKeys, fetchModels]);

  const filteredModels = useMemo(() => {
    const query = modelQuery.trim().toLowerCase();
    if (!query) return models;
    return models.filter(model => {
      const id = externalModelId(model).toLowerCase();
      return id.includes(query)
        || model.displayName.toLowerCase().includes(query)
        || model.provider.toLowerCase().includes(query);
    });
  }, [modelQuery, models]);

  const handleCreate = async (name?: string): Promise<boolean> => {
    if (creatingRef.current) return false;
    creatingRef.current = true;
    setCreating(true);
    setActionError(null);
    try {
      const effectiveName = name ?? newName;
      const res = await fetch(`${apiBase}/api/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: effectiveName || "default" }),
      });
      const data = await readJsonOrThrow<CreateKeyResponse>(res, t("api.createFailed"));
      if (typeof data?.key !== "string" || data.key.length === 0) {
        setActionError(t("api.createFailed"));
        return false;
      }
      setNewKey(data.key);
      setNewName("");
      void fetchKeys();
      return true;
    } catch {
      setActionError(t("api.createFailed"));
      return false;
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setActionError(null);
    try {
      const res = await fetch(`${apiBase}/api/keys`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        setActionError(t("api.deleteFailed"));
        return;
      }
      setConfirmDelete(null);
      void fetchKeys();
    } catch {
      setActionError(t("api.deleteFailed"));
    }
  };

  const copyKey = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyModelId = async (modelId: string) => {
    try {
      await navigator.clipboard.writeText(modelId);
      setCopiedModelId(modelId);
      window.setTimeout(() => setCopiedModelId(current => (current === modelId ? null : current)), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const sourceLabel = (model: ExternalModelRow): string => {
    if (model.native) return t("api.sourceNative");
    if (model.provider === "combo") return t("api.sourceCombo");
    if (model.custom) return t("api.sourceCustom");
    return model.provider;
  };

  const protocolLabel = (protocol: string): string => {
    if (protocol === "responses") return t("api.protocolResponses");
    if (protocol === "messages") return t("api.protocolMessages");
    return t("api.protocolChatCompletions");
  };

  const applyProbe = useCallback(async (model: ExternalModelRow): Promise<void> => {
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
  }, [endpoints.chatCompletions, t]);

  const startBatch = useCallback(async (list: ExternalModelRow[]) => {
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
  }, [applyProbe]);

  const testModel = async (model: ExternalModelRow) => {
    await applyProbe(model);
  };

  const testAllFiltered = () => {
    void startBatch(filteredModels);
  };

  useEffect(() => {
    if (autoBatchStartedRef.current) return;
    if (!keysHydrated || modelsLoading || modelsLoadFailed || models.length === 0) return;
    // Mark one-shot only once keys hydrated and we start (or skip empty) with post-keys endpoints.
    autoBatchStartedRef.current = true;
    void startBatch(models);
  }, [keysHydrated, models, modelsLoading, modelsLoadFailed, startBatch]);

  // Subtitle carries two inline <code> chips; split the localized string on both tokens.
  const subtitleParts = t("api.subtitle").split(/\{authHeader\}|\{altHeader\}/);

  return (
    <section className="api-page">
      <div className="page-head">
        <h2>{t("api.title")}</h2>
      </div>
      <p className="page-sub">
        {subtitleParts[0]}
        <code>Authorization: Bearer ocx_...</code>
        {subtitleParts[1]}
        <code>x-opencodex-api-key</code>
        {subtitleParts[2]}
      </p>

      {(keysLoadFailed || actionError) && (
        <Notice tone="err">{actionError ?? t("api.keysLoadFailed")}</Notice>
      )}

      <ApiKeysEndpointsPanel endpoints={endpoints} claudeCodeEnabled={claudeCodeEnabled} />
      <ApiKeysAuthPanel claudeCodeEnabled={claudeCodeEnabled} />
      <ApiKeysManagePanel
        keys={keys}
        keysLoadFailed={keysLoadFailed}
        newName={newName}
        creating={creating}
        newKey={newKey}
        copied={copied}
        confirmDelete={confirmDelete}
        localeTag={localeTag}
        onNewNameChange={setNewName}
        onCreate={() => { void handleCreate(); }}
        onDismissNewKey={() => setNewKey(null)}
        onCopyKey={copyKey}
        onConfirmDelete={setConfirmDelete}
        onCancelDelete={() => setConfirmDelete(null)}
        onDelete={(id) => { void handleDelete(id); }}
      />
      <ApiKeysModelsPanel
        filteredModels={filteredModels}
        modelsLoading={modelsLoading}
        modelsLoadFailed={modelsLoadFailed}
        modelQuery={modelQuery}
        copiedModelId={copiedModelId}
        modelTests={modelTests}
        batchProgress={batchProgress}
        claudeCodeEnabled={claudeCodeEnabled}
        onModelQueryChange={setModelQuery}
        onCopyModelId={(modelId) => { void copyModelId(modelId); }}
        onTestAll={testAllFiltered}
        onTestModel={(model) => { void testModel(model); }}
        sourceLabel={sourceLabel}
        protocolLabel={protocolLabel}
      />
      <ApiKeysUsagePanel endpoints={endpoints} claudeCodeEnabled={claudeCodeEnabled} />
    </section>
  );
}
