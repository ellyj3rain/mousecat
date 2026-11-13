/* ============================================================================
   PanelBoundary — degrade gracefully PER PANEL. A render error in one region must
   never blank the whole board (resilience invariant). The fallback is honest and
   not a dead end: it names the failure and shows the raw error underneath, and
   offers a retry. Wrap each independently-failable region (a view, an overlay).
   ============================================================================ */
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  label?: string;
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class PanelBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // surfaced, never swallowed
    console.error(`[panel:${this.props.label ?? "?"}]`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="empty-note" style={{ margin: "24px auto", maxWidth: 540 }}>
        <div className="big">This panel hit a problem</div>
        <div style={{ marginTop: 8 }}>
          {this.props.label ? `The "${this.props.label}" view could not render.` : "A panel could not render."} The rest of the app keeps working.
        </div>
        <pre
          style={{
            marginTop: 12,
            padding: 10,
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-secondary)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflowX: "auto",
          }}
        >
          {String(error.message || error)}
        </pre>
        <button className="chip" style={{ marginTop: 12 }} onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
