import { useCallback, useEffect, useState } from "react";
import { Notice } from "../ui";
import { useT } from "../i18n";
import { useCopyFeedback } from "../components/use-copy-feedback";

type NgrokStatus = {
  enabled: boolean;
  running: boolean;
  publicUrl: string | null;
  port: number;
  hasToken: boolean;
  hasBinary: boolean;
  error: string | null;
};

export default function Ngrok({ apiBase }: { apiBase: string }) {
  const t = useT();
  const [status, setStatus] = useState<NgrokStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const { outcomeFor, copy } = useCopyFeedback<"url">();

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch(`${apiBase}/api/ngrok`, { signal });
    const data = await res.json().catch(() => null) as (NgrokStatus & { error?: string }) | null;
    if (!res.ok || !data) {
      throw new Error((data && typeof data.error === "string" && data.error) || t("ngrok.loadFail"));
    }
    setStatus({
      enabled: data.enabled === true,
      running: data.running === true,
      publicUrl: typeof data.publicUrl === "string" ? data.publicUrl : null,
      port: typeof data.port === "number" ? data.port : 0,
      hasToken: data.hasToken === true,
      hasBinary: data.hasBinary === true,
      error: typeof data.error === "string" ? data.error : null,
    });
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
      const body = await res.json().catch(() => ({})) as NgrokStatus & { error?: string };
      if (!res.ok) {
        setMessage({ tone: "err", text: typeof body.error === "string" ? body.error : t("ngrok.saveFailed") });
        return;
      }
      setTokenDraft("");
      setStatus({
        enabled: body.enabled === true,
        running: body.running === true,
        publicUrl: typeof body.publicUrl === "string" ? body.publicUrl : null,
        port: typeof body.port === "number" ? body.port : 0,
        hasToken: body.hasToken === true,
        hasBinary: body.hasBinary === true,
        error: typeof body.error === "string" ? body.error : null,
      });
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

  const copyOutcome = outcomeFor("url");
  const copyLabel = copyOutcome === "copied"
    ? t("ngrok.copied")
    : copyOutcome === "unavailable"
      ? t("ngrok.copyUnavailable")
      : t("ngrok.copy");

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
            <span className="title">{t("ngrok.publicUrl")}</span>
            <span className="desc mono">{status.publicUrl ?? t("ngrok.noUrl")}</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!status.publicUrl}
            onClick={() => status.publicUrl && copy(status.publicUrl, "url")}
          >
            <span aria-live="polite">{copyLabel}</span>
          </button>
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
        </div>
      </div>
    </section>
  );
}
