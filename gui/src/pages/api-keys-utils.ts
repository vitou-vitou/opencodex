export interface ApiKeyEntry {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
}

export interface ApiEndpointInfo {
  baseUrl: string;
  responses: string;
  chatCompletions: string;
  messages: string;
  models: string;
}

export type ModelTestState = "idle" | "testing" | "ok" | "error";

export type ModelTestEntry = {
  state: ModelTestState;
  httpStatus?: number;
  detail?: string;
};

export const DEFAULT_ENDPOINTS: ApiEndpointInfo = {
  baseUrl: "http://127.0.0.1:10100/v1",
  responses: "http://127.0.0.1:10100/v1/responses",
  chatCompletions: "http://127.0.0.1:10100/v1/chat/completions",
  messages: "http://127.0.0.1:10100/v1/messages",
  models: "http://127.0.0.1:10100/v1/models",
};

export function deriveApiEndpoints(endpoint: string): ApiEndpointInfo {
  const responses = endpoint || DEFAULT_ENDPOINTS.responses;
  const match = responses.match(/^(.*)\/v1\/responses\/?$/);
  const baseUrl = match ? `${match[1]}/v1` : responses.replace(/\/responses\/?$/, "");
  return {
    baseUrl,
    responses,
    chatCompletions: `${baseUrl}/chat/completions`,
    messages: `${baseUrl}/messages`,
    models: `${baseUrl}/models`,
  };
}

export function formatCreatedDate(iso: string, localeTag?: string): string {
  return new Date(iso).toLocaleDateString(localeTag);
}

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
