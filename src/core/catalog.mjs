export const INTERACTION_SHAPES = Object.freeze([
  "decision",
  "parameter",
  "ratification",
  "queue",
  "review",
  "freeform",
  "ranking",
  "checklist",
]);

export const INTERACTION_STATUSES = Object.freeze([
  "open",
  "answered",
  "held",
  "ratified",
  "unavailable",
]);

export const WIDGET_ACTIONS = Object.freeze([
  "available",
  "ask",
  "respond",
  "hold",
  "snapshot",
]);

export const OPERATOR_WIDGET_CONTRACT = Object.freeze({
  schema: "mousecat.operator-widget.contract/1",
  api: Object.freeze({
    available: "operator_widget.available()",
    ask: "operator_widget.ask(payload)",
  }),
  requestSchema: "mousecat.operator-widget.request/1",
  resultSchema: "mousecat.operator-widget.result/1",
  shapes: INTERACTION_SHAPES,
  statuses: ["answered", "held", "unavailable"],
  ownership: Object.freeze({
    host: ["availability", "presentation", "batching", "accessibility", "adapter-rendering"],
    caller: ["interpretation", "recursion", "next-action", "failure-handling"],
  }),
});

export const MOUSECAT_TOOLS = Object.freeze([
  {
    name: "mousecat.widget",
    description: "Expose the generic host operator-widget contract for availability, request, response, hold, and snapshot flows.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: WIDGET_ACTIONS },
        request: { type: "object" },
        interactionId: { type: "string" },
        itemId: { type: "string" },
        responses: { type: "array" },
        response: { type: "object" },
        reason: { type: "string" },
      },
      additionalProperties: true,
    },
  },
  {
    name: "mousecat.ask",
    description: "Create a structured operator question with skill buttons for host rendering.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        shape: { type: "string", enum: [...INTERACTION_SHAPES, "point", "architecture", "tree", "batch"] },
        source: { type: "string" },
        sessionId: { type: "string" },
        interactionId: { type: "string" },
        parentInteractionId: { type: "string" },
        title: { type: "string" },
        skillRef: { type: "string" },
        options: { type: "array" },
        items: { type: "array" },
        constraints: { type: "object" },
      },
      additionalProperties: true,
    },
  },
  {
    name: "mousecat.session",
    description: "Start, snapshot, or reconstruct a Mousecat working session.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["start", "snapshot", "total-recall"] },
        sessionId: { type: "string" },
        facts: { type: "object" },
      },
      additionalProperties: true,
    },
  },
  {
    name: "mousecat.queue",
    description: "Manage Mass-Assault style decision queues.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["enqueue", "list", "answer", "hold", "ratify", "clear"] },
        item: { type: "object" },
        items: { type: "array" },
        itemId: { type: "string" },
        answer: { type: "object" },
        sessionId: { type: "string" },
        interactionId: { type: "string" },
      },
      additionalProperties: true,
    },
  },
  {
    name: "mousecat.visualize",
    description: "Return a live visualizer snapshot of skills, buttons, permits, queues, routes, and events.",
    inputSchema: {
      type: "object",
      properties: {
        includeEvents: { type: "boolean" },
        limit: { type: "integer" },
        stream: { type: "string", enum: ["snapshot", "events", "game"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "mousecat.route",
    description: "Resolve a route plan for an upstream without invoking it.",
    inputSchema: {
      type: "object",
      properties: {
        upstream: { type: "string" },
        capability: { type: "string" },
        intent: { type: "string" },
      },
      required: ["upstream"],
      additionalProperties: true,
    },
  },
  {
    name: "mousecat.bridge",
    description: "Read and summarize a public upstream bridge contract without invoking private tools.",
    inputSchema: {
      type: "object",
      properties: {
        upstream: { type: "string" },
        resourceName: { type: "string" },
        includeInputSchemas: { type: "boolean" },
      },
      additionalProperties: true,
    },
  },
  {
    name: "mousecat.invoke",
    description: "Permit-gated upstream invocation boundary.",
    inputSchema: {
      type: "object",
      properties: {
        upstream: { type: "string" },
        capability: { type: "string" },
        payload: { type: "object" },
        permit: { type: "object" },
      },
      required: ["upstream", "capability"],
      additionalProperties: true,
    },
  },
  {
    name: "mousecat.status",
    description: "Report Mousecat health, configured upstreams, permits, and policy posture.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "mousecat.credentials",
    description: "Inspect or register credential references without storing secret values.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["status", "list", "register-reference"] },
        upstream: { type: "string" },
        ref: { type: "string" },
        kind: { type: "string" },
      },
      additionalProperties: true,
    },
  },
]);

export const UPSTREAMS = Object.freeze([
  {
    id: "neo",
    label: "Neo",
    kind: "governed-engine",
    adapter: "descriptor",
    defaultEnabled: true,
    capabilities: ["skill-frameworks", "work-permits", "governance", "runtime-events"],
  },
  {
    id: "github",
    label: "GitHub",
    kind: "source-host",
    adapter: "descriptor",
    defaultEnabled: true,
    capabilities: ["issues", "pull-requests", "checks", "code-search"],
  },
  {
    id: "z-library",
    label: "Z-Library",
    kind: "external-library",
    adapter: "descriptor",
    defaultEnabled: false,
    capabilities: ["library-search", "metadata"],
    policy: "credential-reference-required; no private session state in source",
  },
  {
    id: "codex",
    label: "Codex",
    kind: "agent-host",
    adapter: "descriptor",
    defaultEnabled: true,
    capabilities: ["session-events", "tools", "workspace"],
  },
  {
    id: "claude",
    label: "Claude Code",
    kind: "agent-host",
    adapter: "descriptor",
    defaultEnabled: true,
    capabilities: ["session-events", "tools", "runtime-streams"],
  },
  {
    id: "browser",
    label: "Browser",
    kind: "tool-host",
    adapter: "descriptor",
    defaultEnabled: true,
    capabilities: ["navigate", "inspect", "screenshot"],
  },
  {
    id: "jetbrains",
    label: "JetBrains",
    kind: "ide",
    adapter: "descriptor",
    defaultEnabled: true,
    capabilities: ["operator-widget", "project-events", "run-configurations"],
  },
  {
    id: "cursor",
    label: "Cursor",
    kind: "ide",
    adapter: "descriptor",
    defaultEnabled: true,
    capabilities: ["operator-widget", "project-events", "agent-events"],
  },
  {
    id: "custom",
    label: "Custom Tools",
    kind: "extension",
    adapter: "descriptor",
    defaultEnabled: true,
    capabilities: ["registered-tools"],
  },
]);

function button(id, label, tool, payload, options = {}) {
  return Object.freeze({
    id,
    label,
    tool,
    payload: Object.freeze({ ...payload }),
    requiresPermit: options.requiresPermit || "operator-interaction",
    style: options.style || "primary",
  });
}

export const ATOMIC_SKILLS = Object.freeze([
  {
    id: "crucible.point",
    skill: "crucible",
    label: "Ask Point",
    summary: "Surface one operator decision with recommended options.",
    frameworkRefs: ["operator-decision"],
    defaultTool: "mousecat.ask",
    buttons: [
      button("btn.crucible.point", "Ask", "mousecat.ask", { shape: "point", skillRef: "crucible.point" }),
    ],
  },
  {
    id: "crucible.architecture",
    skill: "crucible",
    label: "Architecture Fork",
    summary: "Surface distinct system shapes for an unresolved architecture decision.",
    frameworkRefs: ["operator-decision"],
    defaultTool: "mousecat.ask",
    buttons: [
      button("btn.crucible.architecture", "Shape", "mousecat.ask", { shape: "architecture", skillRef: "crucible.architecture" }),
    ],
  },
  {
    id: "crucible.tree",
    skill: "crucible",
    label: "Decision Tree",
    summary: "Walk an interdependent plan decision tree.",
    frameworkRefs: ["operator-decision"],
    defaultTool: "mousecat.ask",
    buttons: [
      button("btn.crucible.tree", "Tree", "mousecat.ask", { shape: "tree", skillRef: "crucible.tree" }),
    ],
  },
  {
    id: "mass-assault.queue",
    skill: "mass-assault",
    label: "Run Queue",
    summary: "Present a mapped decision queue for rapid UI discharge.",
    frameworkRefs: ["operator-decision", "queue-ratification"],
    defaultTool: "mousecat.queue",
    buttons: [
      button("btn.mass-assault.enqueue", "Queue", "mousecat.queue", { action: "enqueue", skillRef: "mass-assault.queue" }),
      button("btn.mass-assault.ratify", "Ratify", "mousecat.queue", { action: "ratify", skillRef: "mass-assault.queue" }),
    ],
  },
  {
    id: "total-recall.docket",
    skill: "total-recall",
    label: "Recall",
    summary: "Reconstruct session state, loose threads, decisions, and next actions.",
    frameworkRefs: ["session-recall", "operator-decision"],
    defaultTool: "mousecat.session",
    buttons: [
      button("btn.total-recall.docket", "Recall", "mousecat.session", { action: "total-recall", skillRef: "total-recall.docket" }),
    ],
  },
  {
    id: "tool-boundary.route",
    skill: "tool-boundary",
    label: "Route",
    summary: "Resolve upstream route, permission, and availability before invocation.",
    frameworkRefs: ["tool-boundary-control"],
    defaultTool: "mousecat.route",
    buttons: [
      button("btn.tool-boundary.route", "Route", "mousecat.route", { skillRef: "tool-boundary.route" }, { requiresPermit: "observer" }),
    ],
  },
  {
    id: "tool-boundary.invoke",
    skill: "tool-boundary",
    label: "Invoke",
    summary: "Execute an upstream capability only after permit and adapter checks.",
    frameworkRefs: ["tool-boundary-control"],
    defaultTool: "mousecat.invoke",
    buttons: [
      button("btn.tool-boundary.invoke", "Invoke", "mousecat.invoke", { skillRef: "tool-boundary.invoke" }, { requiresPermit: "tool-invocation", style: "danger" }),
    ],
  },
]);

export const SKILL_FRAMEWORKS = Object.freeze([
  {
    id: "operator-decision",
    label: "Operator Decision Framework",
    atomicSkillRefs: ["crucible.point", "crucible.architecture", "crucible.tree", "mass-assault.queue", "total-recall.docket"],
    boundaryRefs: ["operator-interaction", "queue-ratification"],
    purpose: "Structured questions, mapped queues, ratification, and recall-fed decision backlogs.",
  },
  {
    id: "session-recall",
    label: "Session Recall Framework",
    atomicSkillRefs: ["total-recall.docket"],
    boundaryRefs: ["observer", "operator-interaction"],
    purpose: "Session reconstruction and loose-thread docketing.",
  },
  {
    id: "queue-ratification",
    label: "Queue Ratification Framework",
    atomicSkillRefs: ["mass-assault.queue"],
    boundaryRefs: ["operator-interaction"],
    purpose: "UI-only decision pipeline discharge and final ratification.",
  },
  {
    id: "tool-boundary-control",
    label: "Tool Boundary Control Framework",
    atomicSkillRefs: ["tool-boundary.route", "tool-boundary.invoke"],
    boundaryRefs: ["observer", "tool-invocation", "credential-steward"],
    purpose: "Route planning, permit checking, adapter availability, and credential-reference posture.",
  },
]);

export const WORK_PERMIT_PROFILES = Object.freeze([
  {
    id: "observer",
    label: "Observer",
    grants: ["mousecat.status", "mousecat.visualize", "mousecat.route", "mousecat.bridge", "mousecat.session:snapshot", "mousecat.widget:available"],
    canInvokeUpstreams: false,
    requiresOperatorPresence: false,
  },
  {
    id: "operator-interaction",
    label: "Operator Interaction",
    grants: ["mousecat.widget", "mousecat.ask", "mousecat.queue", "mousecat.session"],
    canInvokeUpstreams: false,
    requiresOperatorPresence: true,
  },
  {
    id: "tool-invocation",
    label: "Tool Invocation",
    grants: ["mousecat.invoke", "mousecat.route"],
    canInvokeUpstreams: true,
    requiresOperatorPresence: true,
    requiresAdapter: true,
  },
  {
    id: "credential-steward",
    label: "Credential Steward",
    grants: ["mousecat.credentials", "mousecat.status"],
    canInvokeUpstreams: false,
    requiresOperatorPresence: true,
    secretValuesAllowed: false,
  },
]);

export const TOOL_BOUNDARIES = Object.freeze([
  {
    tool: "mousecat.widget",
    defaultPermit: "operator-interaction",
    sideEffects: ["in-memory-interaction", "in-memory-response", "audit-event"],
    upstreamAccess: "none",
  },
  {
    tool: "mousecat.ask",
    defaultPermit: "operator-interaction",
    sideEffects: ["in-memory-question"],
    upstreamAccess: "none",
  },
  {
    tool: "mousecat.session",
    defaultPermit: "operator-interaction",
    sideEffects: ["in-memory-session"],
    upstreamAccess: "none",
  },
  {
    tool: "mousecat.queue",
    defaultPermit: "operator-interaction",
    sideEffects: ["in-memory-queue"],
    upstreamAccess: "none",
  },
  {
    tool: "mousecat.visualize",
    defaultPermit: "observer",
    sideEffects: ["audit-event"],
    upstreamAccess: "none",
  },
  {
    tool: "mousecat.route",
    defaultPermit: "observer",
    sideEffects: ["audit-event"],
    upstreamAccess: "descriptor-only",
  },
  {
    tool: "mousecat.bridge",
    defaultPermit: "observer",
    sideEffects: ["audit-event"],
    upstreamAccess: "resource-read",
  },
  {
    tool: "mousecat.invoke",
    defaultPermit: "tool-invocation",
    sideEffects: ["audit-event", "upstream-call-when-adapter-exists"],
    upstreamAccess: "permit-gated",
  },
  {
    tool: "mousecat.status",
    defaultPermit: "observer",
    sideEffects: [],
    upstreamAccess: "none",
  },
  {
    tool: "mousecat.credentials",
    defaultPermit: "credential-steward",
    sideEffects: ["credential-reference-only"],
    upstreamAccess: "none",
  },
]);

export function listToolNames() {
  return MOUSECAT_TOOLS.map((tool) => tool.name);
}

export function getUpstream(id) {
  return UPSTREAMS.find((upstream) => upstream.id === id) || null;
}

export function getPermitProfile(id) {
  return WORK_PERMIT_PROFILES.find((permit) => permit.id === id) || null;
}

export function skillButtons() {
  return ATOMIC_SKILLS.flatMap((skill) =>
    skill.buttons.map((buttonSpec) => ({
      ...buttonSpec,
      skillRef: skill.id,
      skill: skill.skill,
      frameworkRefs: [...skill.frameworkRefs],
    })),
  );
}

export function widgetControls() {
  return Object.freeze([
    {
      id: "widget.ask",
      label: "Ask",
      tool: "mousecat.widget",
      payload: { action: "ask" },
      requiresPermit: "operator-interaction",
      shape: "decision",
    },
    {
      id: "widget.queue",
      label: "Queue",
      tool: "mousecat.widget",
      payload: { action: "snapshot" },
      requiresPermit: "operator-interaction",
      shape: "queue",
    },
    {
      id: "widget.respond",
      label: "Respond",
      tool: "mousecat.widget",
      payload: { action: "respond" },
      requiresPermit: "operator-interaction",
      shape: "review",
    },
    {
      id: "widget.hold",
      label: "Hold",
      tool: "mousecat.widget",
      payload: { action: "hold" },
      requiresPermit: "operator-interaction",
      shape: "ratification",
    },
  ]);
}

export function catalogSnapshot() {
  return {
    schema: "mousecat.catalog/1",
    interactionShapes: INTERACTION_SHAPES,
    interactionStatuses: INTERACTION_STATUSES,
    widgetContract: OPERATOR_WIDGET_CONTRACT,
    tools: MOUSECAT_TOOLS,
    upstreams: UPSTREAMS,
    atomicSkills: ATOMIC_SKILLS,
    skillFrameworks: SKILL_FRAMEWORKS,
    workPermitProfiles: WORK_PERMIT_PROFILES,
    toolBoundaries: TOOL_BOUNDARIES,
    buttons: skillButtons(),
    widgetControls: widgetControls(),
  };
}
