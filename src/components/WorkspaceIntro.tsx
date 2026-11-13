import type { StatusDoc } from "../types/status";
import { useWorkspace } from "../data/workspace";
import { useOverlays } from "../state/overlays";
import { timeAgo } from "../lib/visual";

export function WorkspaceIntro({ doc }: { doc: StatusDoc }) {
  const workspace = useWorkspace();
  const total = workspace.data?.objects.length || doc.projects.length;
  const objects = workspace.data?.objects || [];
  const pending = objects.filter(object => !object.root && !objects.some(member => member.relationships.some(link => link.kind === "part-of" && link.target === object.id))).length;
  return <section className="workspace-intro" aria-label="Current workspace">
    <div><p className="workspace-eyebrow">Your working commons</p><h1>The work, in view.</h1><p className="workspace-lead">Current sources, moving parts, and the things that need care.</p></div>
    <div className="workspace-reading"><span><strong>{total}</strong> in the commons</span><small>{doc.projects.length} observed{pending > 0 ? ` · ${pending} awaiting sources` : ""}</small><small>{workspace.status === "live" ? "Updated " + timeAgo(workspace.data?.observedAt) : workspace.status === "loading" ? "Connecting workspace" : "Workspace observation unavailable"}</small></div>
  </section>;
}

export function WorkspaceSources({ doc }: { doc: StatusDoc }) {
  const workspace = useWorkspace();
  const { openDrawer } = useOverlays();
  const waiting = (workspace.data?.objects || []).filter(object => !doc.projects.some(project => project.id === object.id));
  if (!waiting.length) return null;
  return <section className="workspace-sources" aria-label="Project source bindings">
    <div className="workspace-section-head"><h2>Source context</h2><p>Project composition and sources outside the current readings.</p></div>
    <div className="workspace-pending">{waiting.map(object => <button className="workspace-object" key={object.id} onClick={() => openDrawer({ title: object.label, tag: "source observation", rows: [{ k: "Source", v: object.root ? "Observation unavailable" : (workspace.data?.objects || []).some(member => member.relationships.some(link => link.kind === "part-of" && link.target === object.id)) ? "Aggregate project; member sources retain their own roots" : "No active observation root" }, { k: "Responsibility", v: object.responsibility || "Not declared" }, { k: "Authority", v: object.authority }], raw: object })}>
      <span className="workspace-object-title">{object.label}</span><span className="workspace-object-state">{object.root ? "Observation unavailable" : (workspace.data?.objects || []).some(member => member.relationships.some(link => link.kind === "part-of" && link.target === object.id)) ? "Member sources" : "No active source"}<span aria-hidden="true">↗</span></span>
    </button>)}</div>
  </section>;
}
