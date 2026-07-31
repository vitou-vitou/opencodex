import { useState } from "react";
import { useI18n, useT } from "../i18n/shared";
import type { CodexAccountEntry, CodexQuotaRecoveryCandidate } from "./codex-account-pool-types";

export type CodexQuotaRecoveryNoticeProps = {
  active: CodexAccountEntry | undefined;
  candidates: CodexQuotaRecoveryCandidate[];
  refreshing: boolean;
  onRefresh: () => void;
  onSelect: (account: CodexQuotaRecoveryCandidate) => Promise<boolean> | boolean;
  onLogin: () => void;
  autoSwitchEnabled?: boolean;
  switchError?: string;
};

function formatReset(resetAt: number | undefined, locale: string): string {
  if (typeof resetAt !== "number" || !Number.isFinite(resetAt)) return "";
  return new Date(resetAt < 10_000_000_000 ? resetAt * 1000 : resetAt).toLocaleString(locale);
}

function titleFor(active: CodexAccountEntry, urgent: boolean, t: ReturnType<typeof useT>): string {
  const status = active.quotaHealth?.status;
  if (status === "exhausted") return t("codexAuth.quotaExhausted");
  if (urgent) return t("codexAuth.quotaUrgent");
  if (status === "critical") return t("codexAuth.quotaCritical");
  if (status === "unknown") return t("codexAuth.quotaStale");
  return t("codexAuth.quotaWarning");
}

function explanation(candidate: CodexQuotaRecoveryCandidate, t: ReturnType<typeof useT>): string {
  if (candidate.needsReauth || candidate.health?.status === "reauth_required") return t("codexAuth.recoveryReauth");
  if (candidate.quotaHealth.status === "exhausted") return t("codexAuth.recoveryWait");
  if (candidate.quotaHealth.status === "unknown") return t("codexAuth.recoveryUnknown");
  return candidate.recoveryEligible ? t("codexAuth.recoveryReady") : t("codexAuth.recoveryDisabled");
}

export default function CodexQuotaRecoveryNotice({
  active,
  candidates,
  refreshing,
  onRefresh,
  onSelect,
  onLogin,
  autoSwitchEnabled = false,
  switchError,
}: CodexQuotaRecoveryNoticeProps) {
  const t = useT();
  const { locale } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);
  const health = active?.quotaHealth;
  const visible = Boolean(active && health && (
    health.status === "warning" || health.status === "critical" || health.status === "exhausted" || (health.status === "unknown" && health.stale)
  ));
  if (!active || !health || !visible) return null;

  const urgent = health.status === "critical" && (health.percent ?? 0) >= 95;
  const alert = health.status === "critical" || health.status === "exhausted";
  const reset = formatReset(health.resetAt, locale === "en" ? "en-US" : locale);

  return (
    <section className={`notice-warn quota-recovery-notice${alert ? " notice-err" : ""}`} role={alert ? "alert" : "status"} style={{ marginBottom: 12 }}>
      <strong>{titleFor(active, urgent, t)}</strong>
      {health.windowLabel && typeof health.percent === "number" && (
        <div className="card-sub">{t("codexAuth.recoveryUsage", { window: health.windowLabel, percent: Math.round(health.percent) })}</div>
      )}
      {reset && <div className="card-sub">{t("codexAuth.quotaReset", { when: reset })}</div>}
      <div className="card-sub">{autoSwitchEnabled ? t("codexAuth.recoveryAutoSwitch") : t("codexAuth.recoveryAutoSwitchOff")}</div>
      <div className="card-sub">{health.action === "wait_for_reset" ? t("codexAuth.recoveryWait") : health.action === "refresh" ? t("codexAuth.quotaStale") : t("codexAuth.recoveryNextAction")}</div>
      {health.status === "exhausted" && <div className="card-sub">{t("codexAuth.recoveryNewSession")}</div>}
      <div className="modal-actions" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-ghost btn-sm" disabled={refreshing} onClick={onRefresh}>{t("codexAuth.recoveryRefresh")}</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setPickerOpen(true)}>{t("codexAuth.recoverySwitch")}</button>
      </div>
      {pickerOpen && (
        <div className="card quota-recovery-picker" style={{ marginTop: 12 }}>
          <strong>{t("codexAuth.recoveryPickerTitle")}</strong>
          <p className="card-sub">{t("codexAuth.recoveryNewSession")}</p>
          {switchError && <div className="notice-err" role="alert">{switchError}</div>}
          {candidates.map(candidate => {
            const resetAt = formatReset(candidate.quotaHealth.resetAt, locale === "en" ? "en-US" : locale);
            const disabled = !candidate.recoveryEligible;
            return (
              <button
                key={candidate.id}
                type="button"
                data-recovery-account={candidate.id}
                className="card"
                disabled={disabled || refreshing}
                onClick={() => {
                  void Promise.resolve(onSelect(candidate)).then(ok => { if (ok) setPickerOpen(false); });
                }}
                style={{ display: "block", width: "100%", textAlign: "left", marginTop: 8 }}
              >
                <strong>{candidate.alias ?? candidate.email}</strong>{candidate.plan && <span className="badge badge-green" style={{ marginLeft: 8 }}>{candidate.plan}</span>}
                <div className="card-sub">{typeof candidate.quotaHealth.percent === "number" ? `${Math.round(candidate.quotaHealth.percent)}%` : t("codexAuth.recoveryUnknown")}{resetAt ? ` · ${t("codexAuth.quotaReset", { when: resetAt })}` : ""}</div>
                <div className="card-sub faint">{explanation(candidate, t)}</div>
              </button>
            );
          })}
          <div className="modal-actions" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onLogin}>{t("codexAuth.recoveryLogin")}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPickerOpen(false)}>{t("common.close")}</button>
          </div>
        </div>
      )}
    </section>
  );
}
