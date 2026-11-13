/* ============================================================================
   GitHubAccounts — the GitHub auth MANAGEMENT module (lives in Settings). Reads
   real `gh auth status` and lets the operator directly manage their GitHub
   sign-in: sign in / add an account (opens an interactive terminal), switch the
   active account, or sign out (with an inline confirm). It facilitates the
   operator's own gh auth; it never reads or enters credentials.
   ============================================================================ */
import { useCallback, useEffect, useState } from "react";
import { engine, type GitHubStatus, type GitHubAccount } from "../data/engineApi";
import { useOverlays } from "../state/overlays";

export function GitHubAccounts() {
  const { toast } = useOverlays();
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingLogout, setPendingLogout] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const keyOf = (a: GitHubAccount) => `${a.host}/${a.login}`;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await engine.githubStatus());
    } catch {
      setStatus({ available: false, authenticated: false, accounts: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onLogin() {
    setBusy("login");
    setNote(null);
    try {
      const r = await engine.githubLogin();
      setNote(r.note || (r.ok ? "Sign-in started in a terminal. Complete it there, then Refresh." : r.error || "Could not start sign-in."));
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not start sign-in.");
    } finally {
      setBusy(null);
    }
  }
  async function onSwitch(a: GitHubAccount) {
    setBusy("switch:" + keyOf(a));
    try {
      const r = await engine.githubSwitch({ host: a.host, user: a.login });
      if (r.ok) {
        toast("Switched account", `Active GitHub account is now ${a.login}.`, false);
        await refresh();
      } else toast("Could not switch", r.error || "It did not complete.", true);
    } finally {
      setBusy(null);
    }
  }
  async function onLogout(a: GitHubAccount) {
    setBusy("logout:" + keyOf(a));
    try {
      const r = await engine.githubLogout({ host: a.host, user: a.login });
      if (r.ok) {
        toast("Signed out", `${a.login} signed out.`, false);
        setPendingLogout(null);
        await refresh();
      } else toast("Could not sign out", r.error || "It did not complete.", true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="set-group">
      <h4>GitHub account</h4>
      <p>Manage the GitHub sign-in this app uses for backups. Sign in or add an account, switch the active one, or sign out.</p>

      {loading && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Reading GitHub sign-in…</div>}

      {!loading && status && !status.available && (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          The GitHub CLI (gh) is not installed, so account management is unavailable. Local backups still work.
        </div>
      )}

      {!loading && status && status.available && status.accounts.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Not signed in to GitHub.</div>
      )}

      {!loading &&
        status &&
        status.accounts.map((a) => (
          <div key={keyOf(a)} className="row" style={{ cursor: "default" }}>
            <span className="dot" style={{ background: `var(${a.active ? "--state-passed" : "--text-faint"})` }} />
            <div className="main">
              <div className="lbl">
                {a.login}
                {a.active && <span style={{ fontSize: 9, letterSpacing: ".5px", color: "var(--state-passed)", marginLeft: 6 }}>ACTIVE</span>}
              </div>
              <div className="sub">
                {a.host}
                {a.protocol ? ` · ${a.protocol}` : ""}
                {a.scopes && a.scopes.length ? ` · ${a.scopes.length} scopes` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {!a.active && (
                <button className="mini-btn" disabled={busy != null} onClick={() => onSwitch(a)}>
                  {busy === "switch:" + keyOf(a) ? "…" : "Make active"}
                </button>
              )}
              {pendingLogout === keyOf(a) ? (
                <>
                  <button className="mini-btn" disabled={busy != null} onClick={() => onLogout(a)}>
                    {busy === "logout:" + keyOf(a) ? "…" : "Confirm sign out"}
                  </button>
                  <button className="mini-btn" onClick={() => setPendingLogout(null)}>Cancel</button>
                </>
              ) : (
                <button className="mini-btn" disabled={busy != null} onClick={() => setPendingLogout(keyOf(a))}>Sign out</button>
              )}
            </div>
          </div>
        ))}

      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button className="mini-btn" disabled={busy != null} onClick={onLogin}>
          {busy === "login" ? "…" : "Sign in / add account"}
        </button>
        <button className="mini-btn" disabled={busy != null} onClick={refresh}>Refresh</button>
      </div>

      {note && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{note}</div>}
    </div>
  );
}
