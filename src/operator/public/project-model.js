// Explicit project references own navigation. Surface IDs identify registered sources.
export function projectModel(snapshot = {}) {
  const projects = new Map();
  for (const source of snapshot.projects || []) {
    const ref = source.surface.projectRef;
    if (!projects.has(ref)) projects.set(ref, { ref, label: ref.replace(/^project:/u, "").replaceAll("-", " "), sources: [], threads: new Map() });
    const project = projects.get(ref);
    project.sources.push(source);
    for (const thread of source.threads?.archived || []) {
      if (project.threads.get(thread.interactionId)?.availability !== "live") project.threads.set(thread.interactionId, { ...thread, availability: "retained" });
    }
    for (const thread of source.threads?.live || []) project.threads.set(thread.interactionId, { ...thread, availability: "live" });
  }
  for (const interaction of snapshot.widget?.interactions || []) {
    const project = projects.get(interaction.projectRef);
    if (project) project.threads.set(interaction.interactionId, { ...interaction, availability: "live" });
  }
  const groups = (snapshot.projectGroups || []).map(group => ({ ...group,
    members: [...projects.values()].filter(project => project.sources.some(source => group.memberSurfaceIds.includes(source.surface.surfaceId))),
  }));
  return { projects, groups };
}

export function inQuestionScope(interaction, scope, model) {
  if (scope.interaction && interaction.interactionId !== scope.interaction) return false;
  if (!scope.project) return true;
  return interaction.projectRef === scope.project || Boolean(model.projects.get(scope.project)?.threads.has(interaction.interactionId));
}

export function projectRoute(ref) { return "#projects?" + new URLSearchParams({ project: ref }); }
export function pendingQuestionCount(thread) {
  if (thread.availability === "retained") return 0;
  return thread.items ? thread.items.filter(item => ["open", "deferred"].includes(item.status)).length : (thread.openCount || 0) + (thread.deferredCount || 0);
}
export function questionRoute(project, interaction) {
  const params = new URLSearchParams();
  if (project) params.set("project", project);
  if (interaction) params.set("interaction", interaction);
  return "#questions" + (params.size ? "?" + params : "");
}

export function projectGraphRoute(project, surfaceId, source) {
  return "#projects?" + new URLSearchParams({ project, graph: surfaceId + ":" + source });
}

// Graph discovery follows declared project sources, independently of project grouping.
export function registeredGraphs(snapshot = {}) {
  const result = new Map();
  for (const project of projectModel(snapshot).projects.values()) for (const source of project.sources) {
    for (const item of source.page?.dataSources || []) {
      if (item.schema !== "development.continuity-graph/1") continue;
      const id = JSON.stringify([project.ref, source.surface.surfaceId, item.name]);
      result.set(id, { id, projectRef: project.ref, projectLabel: project.label,
        surfaceId: source.surface.surfaceId, source: item.name, label: item.label || item.name,
        exists: item.exists === true, bytes: item.bytes || 0,
        href: projectGraphRoute(project.ref, source.surface.surfaceId, item.name) });
    }
  }
  return [...result.values()].sort((a, b) => a.projectLabel.localeCompare(b.projectLabel)
    || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}
