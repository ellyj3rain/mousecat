function normalized(value) { return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase(); }
function inside(file, root) { const a = normalized(file), b = normalized(root); return !!b && (a === b || a.startsWith(b + "/")); }

export function projectContext(doc, project) {
  return { ...doc, secrets: (doc.secrets || []).filter(secret => secret.path && inside(secret.path, project.path)) };
}

export function scopedInterpretation(shared) {
  return { ...shared,
    rollupHealth: (project, doc) => shared.rollupHealth(project, projectContext(doc, project)),
    projectShortName: project => project.name || shared.projectShortName(project),
    safetyMeter(project) {
      return shared.safetyMeter(project).map(segment => segment.key === "saved" && !project.isRepo ? { ...segment, unknown: true, plain: "Commit state not observed" } : segment.key === "clean" && !project.drift
        ? { ...segment, label: "Version", level: 0, ok: false, unknown: true, plain: "Version consistency not observed" } : segment);
    },
    portraitDimensions(project) {
      return shared.portraitDimensions(project).map(segment => segment.key === "clean" && !project.drift
        ? { ...segment, label: "Version", value: 0, color: "--text-tertiary", num: "unknown" } : segment);
    },
    fleetSummary(doc) {
      const result = { risk: 0, attention: 0, neutral: 0, ok: 0, total: 0 };
      for (const project of doc.projects || []) {
        const count = shared.fleetSummary(projectContext({ ...doc, projects: [project] }, project));
        for (const key of Object.keys(result)) result[key] += count[key];
      }
      return result;
    },
    attentionSignals(doc) {
      const machine = shared.attentionSignals({ ...doc, projects: [] });
      const projectSignals = (doc.projects || []).flatMap(project => shared.attentionSignals(projectContext({ ...doc, projects: [project], services: [], families: (doc.families || []).filter(family => family.family !== "services") }, project)));
      return [...projectSignals, ...machine].sort((a, b) => shared.HEALTH_RANK[a.health] - shared.HEALTH_RANK[b.health]);
    },
  };
}

export function activeWorkspace(doc, workspace, status = "live", now = Date.now()) {
  const base = doc || { projects: [] };
  if (!workspace || !Array.isArray(workspace.objects)) {
    return { ...base, projects: [], workspace: null };
  }
  const age = now - Date.parse(workspace.observedAt);
  if (status !== "live" || !Number.isFinite(age) || age > 45000 || age < -5000) return { ...base, projects: [], workspace: { ...workspace, effectiveStatus: "unavailable" } };
  const projects = [];
  for (const object of workspace.objects) {
    const observation = object.observation;
    if (!object.root || observation?.status !== "observed" || typeof observation.state?.isRepo !== "boolean") continue;
    const state = observation.state;
    if (state.observation?.status === "unavailable") continue;
    const previous = (base.projects || []).find(p => p.id === object.id && normalized(p.path) === normalized(object.root));
    const baseAge = now - Date.parse(base.generatedAt);
    const drift = state.drift || (baseAge >= 0 && baseAge < 45000 ? previous?.drift : null) || null;
    const remotes = Array.isArray(state.remotes) && state.remotes.every(value => typeof value === "string") ? state.remotes : null;
    const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
    const dirty = count(state.dirty);
    const remoteStanding = ["configured-unverified", "no-remote-observed", "unknown"].includes(state.remoteStanding) ? state.remoteStanding : "unknown";
    const project = { id: object.id, name: object.label, kind: object.kind, path: object.root, isRepo: state.isRepo,
      branch: state.branch ?? null, dirty, ahead: count(state.ahead), behind: count(state.behind),
      upstream: typeof state.upstream === "string" ? state.upstream : null,
      zeroCommit: typeof state.zeroCommit === "boolean" ? state.zeroCommit : null,
      lastCommit: state.lastCommit ?? null, remotes, remoteStanding,
      remoteObservation: state.remoteObservation || "unreported", remoteEvaluation: state.remoteEvaluation || "unreported", drift,
      lossRisk: !state.isRepo ? "not-git" : state.zeroCommit === true ? "zero-commit" : dirty !== null && dirty > 15 ? "dirty-heavy" : remoteStanding === "no-remote-observed" ? "no-remote" : dirty === null || remoteStanding === "unknown" ? "unknown" : "none" };
    projects.push(project);
  }
  return { ...base, projects, workspace: { ...workspace, effectiveStatus: "live" } };
}

export function workspaceSummary(doc) {
  const workspace = doc.workspace;
  const objects = workspace?.objects || [];
  const configured = objects.filter(o => o.root).length;
  return { total: objects.length || doc.projects.length, configured,
    pending: objects.filter(o => !o.root).length,
    unavailable: objects.filter(o => o.root && o.observation?.status !== "observed").length,
    observedAt: workspace?.observedAt || doc.generatedAt, runtime: workspace?.runtime || null };
}
