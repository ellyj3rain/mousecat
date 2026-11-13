/* ============================================================================
   SafetyGate — the loss-risk SAFETY NET + GitHub control surface. For one at-risk
   project it shows: who you are signed in to GitHub as (real, read-only); the
   real plans the engine computes from live git state (save/commit; back up); and
   for backup, EVERY target as a pickable choice (GitHub remotes preferred, other
   remotes, a local bundle) so YOU choose where it goes, never one forced remote.
   Repository creation remains unavailable until account/host/environment identity
   is bound to the preview. Each retained action is a true dry-run preview
   until you approve it; every attempt is recorded and automatic Undo is retired.
   The engine is the gate of record.
   ============================================================================ */
import { useCallback, useEffect, useRef, useState } from "react";
import { useOverlays } from "../state/overlays";
import { useFleet } from "../data/useFleet";
import { useNotifications } from "../state/notifications";
import { MCModel } from "../model/engine";
import { HEALTH_COLOR, HEALTH_GLYPH, HEALTH_LABEL } from "../lib/visual";
import {
  engine,
  type ActionKind,
  type PlanResult,
  type BuiltPlan,
  type Applied,
  type GitHubStatus,
  type BackupChoice,
} from "../data/engineApi";
import { PreviewCoordinator, sameActionToken, type ActionToken } from "../data/previewCoordinator";

const GATE_ACTIONS: ActionKind[] = ["commit", "backup"];

export function SafetyGate() {
  const { safety, closeSafety, toast } = useOverlays();
  const { doc } = useFleet();
  const { pushHistory } = useNotifications();

  const project = safety ? doc.projects.find((p) => p.id === safety) : null;
  const projectPath = project?.path ?? null;
  const projectName = project ? MCModel.projectShortName(project) : "";

  const [loading, setLoading] = useState(true);
  const [gh, setGh] = useState<GitHubStatus | null>(null);
  const [plans, setPlans] = useState<Record<string, PlanResult | null>>({});
  const [applied, setApplied] = useState<Record<string, Applied | null>>({});
  const [backupSel, setBackupSel] = useState<string>("");
  const [backupPlanning, setBackupPlanning] = useState(false);
  const [busy, setBusy] = useState<{ action: ActionKind; token: ActionToken } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const coordinator = useRef(new PreviewCoordinator());

  const selOf = (plan: PlanResult | null | undefined): string => {
    if (!plan || plan.feasible === false) return "";
    if (plan.targetKind === "bundle") return "bundle";
    return plan.remote?.name ?? "";
  };

  const loadAll = useCallback(async (path: string) => {
    const token = coordinator.current.beginLoad(path);
    setLoading(true);
    setError(null);
    // allSettled: one failed plan must not blank the whole gate (resilience)
    const settled = await Promise.allSettled([
      engine.githubStatus(),
      ...GATE_ACTIONS.map((a) => engine.plan(a, path)),
    ]);
    if (!coordinator.current.acceptsLoad(token)) return;
    const s0 = settled[0];
    setGh(s0.status === "fulfilled" ? (s0.value as GitHubStatus) : { available: false, authenticated: false, accounts: [] });
    const map: Record<string, PlanResult | null> = {};
    GATE_ACTIONS.forEach((a, i) => {
      const r = settled[i + 1];
      map[a] = r.status === "fulfilled" ? (r.value as PlanResult) : null;
    });
    setPlans(map);
    setBackupSel(selOf(map["backup"]));
    if (settled.every((r) => r.status === "rejected")) {
      setError("Could not reach the engine. Is the local engine running?");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!safety || !projectPath) return;
    setApplied({});
    setPlans({});
    setBusy(null);
    setBackupPlanning(false);
    void loadAll(projectPath);
    return () => coordinator.current.invalidate();
  }, [safety, projectPath, loadAll]);

  const replanBackup = useCallback(
    async (choiceId: string) => {
      if (!projectPath) return;
      const token = coordinator.current.beginAction(projectPath, "backup");
      setBackupSel(choiceId);
      setBackupPlanning(true);
      setPlans((m) => ({ ...m, backup: null }));
      setApplied((m) => {
        const next = { ...m };
        delete next.backup;
        return next;
      });
      const opts = choiceId === "bundle" ? { target: "bundle" } : { remote: choiceId };
      try {
        const next = await engine.plan("backup", projectPath, opts);
        if (!coordinator.current.acceptsAction(token)) return;
        setPlans((m) => ({ ...m, backup: next }));
      } catch (e) {
        if (coordinator.current.acceptsAction(token)) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (coordinator.current.acceptsAction(token)) setBackupPlanning(false);
      }
    },
    [projectPath],
  );

  if (!safety) return null;
  if (!project || !projectPath) return null;

  const health = MCModel.rollupHealth(project, doc);

  async function onApprove(action: ActionKind, plan: BuiltPlan) {
    const current = plans[action];
    if (!current || current.feasible === false || current.id !== plan.id || (action === "backup" && backupPlanning)) {
      toast("Preview changed", "Review the current preview before approving it.", true);
      return;
    }
    const actionToken = coordinator.current.beginAction(projectPath!, `apply:${action}`);
    setBusy({ action, token: actionToken });
    try {
      const res = await engine.apply(plan.id, true);
      const stillCurrent = coordinator.current.acceptsAction(actionToken);
      if (stillCurrent) setApplied((m) => ({ ...m, [action]: res }));
      if (res.ok) {
        pushHistory({ id: "action:" + res.id, name: projectName, text: `${plan.title} applied`, health: "ok", kind: "action", at: res.at, read: false });
        toast(plan.title, `Done for ${projectName}.`, false);
        if (stillCurrent) await loadAll(projectPath!);
      } else {
        const caution = res.effectsPossible ? " Inspect the recorded steps before another action." : "";
        toast(res.outcomeUnconfirmed ? "Outcome unconfirmed" : "Could not complete", (res.error || "The action did not complete.") + caution, true);
      }
    } catch (e) {
      toast("Could not complete", e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy((currentBusy) => currentBusy && sameActionToken(currentBusy.token, actionToken) ? null : currentBusy);
    }
  }

  function ApproveRow({ action, plan }: { action: ActionKind; plan: BuiltPlan }) {
    const app = applied[action];
    const verb = action === "commit" ? "save" : action === "backup" ? "back up" : "connect";
    return (
      <div className="modal-foot" style={{ borderTop: "none", paddingTop: "6px" }}>
        {app ? (
          <span style={{ color: app.ok ? "var(--state-passed)" : "var(--state-warning)", fontSize: "12.5px", marginRight: "auto" }}>
            {app.ok ? "Done." : app.outcomeUnconfirmed ? "Outcome unconfirmed; inspect the audit." : "Attempt stopped; inspect recorded steps."}
          </span>
        ) : (
          <button className="btn primary" style={{ marginLeft: "auto" }} disabled={busy != null || loading || (action === "backup" && backupPlanning)} onClick={() => onApprove(action, plan)}>
            {busy?.action === action ? "Working." : `Approve and ${verb}`}
          </button>
        )}
      </div>
    );
  }

  function Steps({ plan }: { plan: BuiltPlan }) {
    return (
      <div className="action-steps">
        {plan.steps.map((s) => (
          <div className="step" key={s.n}>
            <div className="n">{s.n}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 500 }}>{s.label}</div>
              <div className="ba">
                <span className="before">{s.before}</span>
                <span className="arrow">→</span>
                <span className="after">{s.after}</span>
              </div>
            </div>
          </div>
        ))}
        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "8px" }}>
          {plan.recovery}
        </div>
      </div>
    );
  }

  const commitPlan = plans["commit"];
  const backupPlan = plans["backup"];

  function BackupChoices({ choices }: { choices?: BackupChoice[] }) {
    if (!choices?.length) return null;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", margin: "4px 0 10px" }}>
        <span style={{ fontSize: "11px", color: "var(--text-muted)", alignSelf: "center", marginRight: "2px" }}>back up to</span>
        {choices.map((choice) => (
          <button key={choice.id} className="chip" aria-pressed={backupSel === choice.id}
            disabled={busy != null || backupPlanning}
            title={choice.pushUrls?.join("\n") || choice.url || (choice.kind === "bundle" ? "A full backup file on this machine" : choice.name)}
            onClick={() => replanBackup(choice.id)}>
            {choice.name}
            {(choice.pushUrls?.length || 0) > 1 && <span> ({choice.pushUrls!.length} destinations)</span>}
            {choice.isGitHub && <span style={{ marginLeft: "5px", fontSize: "9px", color: "var(--state-passed)" }}>GitHub</span>}
          </button>
        ))}
      </div>
    );
  }

  const authLine = !gh
    ? "Checking GitHub sign-in…"
    : !gh.available
      ? "GitHub CLI not found, local backups only."
      : gh.authenticated
        ? `Signed in to GitHub as ${gh.accounts[0]?.login}`
        : "Not signed in to GitHub";
  const authColor = gh?.authenticated ? "--state-passed" : gh?.available ? "--state-warning" : "--text-muted";

  return (
    <div className="scrim" onClick={closeSafety}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span
            className="risk-tag"
            style={{ color: `var(${HEALTH_COLOR[health.health]})`, background: `color-mix(in srgb, var(${HEALTH_COLOR[health.health]}) 16%, transparent)` }}
          >
            <span aria-hidden="true">{HEALTH_GLYPH[health.health]}</span> {HEALTH_LABEL[health.health]}
          </span>
          <div className="t">Keep {projectName} safe</div>
          <button className="icon-btn" aria-label="Close" onClick={closeSafety}>✕</button>
        </div>

        <div className="modal-body">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", marginBottom: "12px" }}>
            <span aria-hidden="true" style={{ color: `var(${authColor})` }}>●</span>
            <span style={{ color: "var(--text-secondary)" }}>{authLine}</span>
          </div>
          <div style={{ fontSize: "12.5px", color: "var(--text-secondary)", marginBottom: "14px" }}>
            {health.reason}. Here is exactly what I can do, read from this project's real state. Nothing changes until you approve it.
          </div>

          {loading && <div className="plan-empty">Checking this project's real state…</div>}
          {error && <div className="plan-empty" style={{ color: "var(--state-failed)" }}>Could not read the project: {error}</div>}

          {!loading && commitPlan && (commitPlan.feasible === false ? (
            <div className="action-card">
              <div className="action-head">
                <div className="ti"><div className="t">Save your work</div><div className="d">{commitPlan.reason}</div></div>
                <span aria-hidden="true" style={{ color: "var(--text-muted)", fontSize: "16px" }}>—</span>
              </div>
            </div>
          ) : (
            <div className="action-card armed">
              <div className="action-head"><div className="ti"><div className="t">{commitPlan.title}</div><div className="d">{commitPlan.explain}</div></div></div>
              <Steps plan={commitPlan} />
              <ApproveRow action="commit" plan={commitPlan} />
            </div>
          ))}

          {!loading && backupPlan && (backupPlan.feasible === false ? (
            <div className="action-card">
              <div className="action-head">
                <div className="ti"><div className="t">Back up your work</div><div className="d">{backupPlan.reason}</div></div>
                <span aria-hidden="true" style={{ color: "var(--text-muted)", fontSize: "16px" }}>—</span>
              </div>
              <BackupChoices choices={backupPlan.choices} />
            </div>
          ) : (
            <div className="action-card armed">
              <div className="action-head"><div className="ti"><div className="t">{backupPlan.title}</div><div className="d">{backupPlan.explain}</div></div></div>
              <BackupChoices choices={backupPlan.choices} />
              <Steps plan={backupPlan} />
              <ApproveRow action="backup" plan={backupPlan} />
            </div>
          ))}
          {backupPlanning && <div className="plan-empty">Rechecking the selected backup destination.</div>}

        </div>

        <div className="modal-foot">
          <button className="btn" onClick={closeSafety}>Done</button>
        </div>
      </div>
    </div>
  );
}
