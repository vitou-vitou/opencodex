import { useCallback, useEffect, useState } from "react";
import { Notice } from "../ui";
import { IconExternal } from "../icons";
import { useT } from "../i18n";
import { useCopyFeedback } from "../components/use-copy-feedback";

const NGROK_SIGNUP_URL = "https://dashboard.ngrok.com/signup";
const NGROK_TOKEN_URL = "https://dashboard.ngrok.com/get-started/your-authtoken";

type NgrokStatus = {
  enabled: boolean;
  running: boolean;
  publicUrl: string | null;
  publicUrls: string[];
  localUrl: string;
  port: number;
  hasToken: boolean;
  hasBinary: boolean;
  error: string | null;
};

function parseStatus(data: Partial<NgrokStatus> & { error?: string }, fallbackPort = 0): NgrokStatus {
  const port = typeof data.port === "number" ? data.port : fallbackPort;
  const publicUrls = Array.isArray(data.publicUrls)
    ? data.publicUrls.filter((u): u is string => typeof u === "string" && u.length > 0)
    : (typeof data.publicUrl === "string" && data.publicUrl ? [data.publicUrl] : []);
  const localUrl = typeof data.localUrl === "string" && data.localUrl
    ? data.localUrl
    : (port > 0 ? `http://127.0.0.1:${port}` : "");
  return {
    enabled: data.enabled === true,
    running: data.running === true,
    publicUrl: typeof data.publicUrl === "string" ? data.publicUrl : null,
    publicUrls,
    localUrl,
    port,
    hasToken: data.hasToken === true,
    hasBinary: data.hasBinary === true,
    error: typeof data.error === "string" ? data.error : null,
  };
}

export default function Ngrok({ apiBase }: { apiBase: string }) {
  const t = useT();
  const [status, setStatus] = useState<NgrokStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const { outcomeFor, copy } = useCopyFeedback<string>();

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch(`${apiBase}/api/ngrok`, { signal });
    const data = await res.json().catch(() => null) as (Partial<NgrokStatus> & { error?: string }) | null;
    if (!res.ok || !data) {
      throw new Error((data && typeof data.error === "string" && data.error) || t("ngrok.loadFail"));
    }
    setStatus(parseStatus(data));
  }, [apiBase, t]);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    void refresh(ac.signal)
      .then(() => { if (!ac.signal.aborted) setLoadError(""); })
      .catch((err: unknown) => {
        if (!ac.signal.aborted) setLoadError(err instanceof Error ? err.message : t("ngrok.loadFail"));
      })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    const timer = setInterval(() => {
      void refresh().catch(() => {});
    }, 4000);
    return () => {
      ac.abort();
      clearInterval(timer);
    };
  }, [refresh, t]);

  const saveToken = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/ngrok`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken: tokenDraft.trim() || null }),
      });
      const body = await res.json().catch(() => ({})) as Partial<NgrokStatus> & { error?: string };
      if (!res.ok) {
        setMessage({ tone: "err", text: typeof body.error === "string" ? body.error : t("ngrok.saveFailed") });
        return;
      }
      setTokenDraft("");
      setStatus(parseStatus(body));
      setMessage({ tone: "ok", text: t("ngrok.tokenSaved") });
    } catch {
      setMessage({ tone: "err", text: t("ngrok.saveFailed") });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <section className="ngrok-page"><p className="page-sub">{t("ngrok.loading")}</p></section>;
  if (loadError) return <section className="ngrok-page"><Notice tone="err">{loadError}</Notice></section>;
  if (!status) return null;

  const copyLabelFor = (scope: string) => {
    const outcome = outcomeFor(scope);
    if (outcome === "copied") return t("ngrok.copied");
    if (outcome === "unavailable") return t("ngrok.copyUnavailable");
    return t("ngrok.copy");
  };

  return (
    <section className="ngrok-page">
      <h2 className="page-title">{t("ngrok.title")}</h2>
      <p className="page-sub">{t("ngrok.subtitle")}</p>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {status.error && <Notice tone="err">{status.error}</Notice>}

      <div className="card" style={{ marginTop: 12 }}>
        <div className="setting-row">
          <div className="setting-label">
            <span className="title">{t("ngrok.statusTitle")}</span>
            <span className="desc">
              {status.running ? t("ngrok.statusRunning") : t("ngrok.statusStopped")}
              {" · "}
              {t("ngrok.portLabel")}: {status.port}
              {" · "}
              {status.enabled ? t("ngrok.enabledOn") : t("ngrok.enabledOff")}
            </span>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span className="title">{t("ngrok.prereqs")}</span>
            <span className="desc">
              {status.hasBinary ? t("ngrok.binaryOk") : t("ngrok.binaryMissing")}
              {" · "}
              {status.hasToken ? t("ngrok.tokenOk") : t("ngrok.tokenMissing")}
            </span>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="setting-label" style={{ marginBottom: 4 }}>
          <span className="title">{t("ngrok.urlsTitle")}</span>
          <span className="desc">{t("ngrok.urlsHint")}</span>
        </div>

        {status.localUrl && (
          <div className="setting-row">
            <div className="setting-label">
              <span className="title">{t("ngrok.localUrl")}</span>
              <span className="desc mono">{status.localUrl}</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => copy(status.localUrl, status.localUrl)}
            >
              <span aria-live="polite">{copyLabelFor(status.localUrl)}</span>
            </button>
          </div>
        )}

        {status.publicUrls.length > 0 ? status.publicUrls.map((url) => (
          <div className="setting-row" key={url}>
            <div className="setting-label">
              <span className="title">{t("ngrok.publicUrl")}</span>
              <span className="desc mono">{url}</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => copy(url, url)}
            >
              <span aria-live="polite">{copyLabelFor(url)}</span>
            </button>
          </div>
        )) : (
          <div className="setting-row">
            <div className="setting-label">
              <span className="title">{t("ngrok.publicUrl")}</span>
              <span className="desc mono">{t("ngrok.noUrl")}</span>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" disabled>
              <span>{t("ngrok.copy")}</span>
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="setting-label">
          <span className="title">{t("ngrok.tokenTitle")}</span>
          <span className="desc">{t("ngrok.tokenHint")}</span>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <input
            type="password"
            autoComplete="off"
            value={tokenDraft}
            placeholder={status.hasToken ? t("ngrok.tokenPlaceholderSet") : t("ngrok.tokenPlaceholder")}
            onChange={e => setTokenDraft(e.target.value)}
            aria-label={t("ngrok.tokenTitle")}
            style={{ flex: "1 1 220px", minWidth: 0 }}
          />
          <button type="button" className="btn primary" disabled={busy} onClick={() => void saveToken()}>
            {busy ? t("ngrok.saving") : t("ngrok.saveToken")}
          </button>
          <a
            className="btn btn-ghost"
            href={status.hasToken ? NGROK_TOKEN_URL : NGROK_SIGNUP_URL}
            target="_blank"
            rel="noreferrer"
          >
            <IconExternal style={{ width: 13, height: 13 }} aria-hidden="true" />
            {status.hasToken ? t("ngrok.getToken") : t("ngrok.signUp")}
          </a>
        </div>
      </div>
    </section>
  );
}
