/* ============================================================================
   ToastHost — ephemeral, native-notification stand-in toasts. Auto-dismiss is
   handled by the overlays store; clicking one dismisses it early.
   ============================================================================ */
import { useOverlays } from "../state/overlays";

export function ToastHost() {
  const { toasts, dismissToast } = useOverlays();
  return (
    <div id="toasts">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={"toast" + (t.danger ? " crit" : "")}
          role="status"
          onClick={() => dismissToast(t.id)}
        >
          <div className="tt">{t.title}</div>
          <div className="tb">{t.body}</div>
        </div>
      ))}
    </div>
  );
}
