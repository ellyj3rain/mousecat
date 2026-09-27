import { integrationAdapterManifests } from "./integration-adapters.mjs";
import { ML_REVIEW_JSON_SCHEMA } from "./ml-review.mjs";
import { PROJECT_SURFACE_CONTRACT } from "./project-surfaces.mjs";

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
  "deferred",
  "ratified",
  "unavailable",
  "withdrawn",
]);

export const WIDGET_ACTIONS = Object.freeze([
  "available",
  "ask",
  "await",
  "close",
  "respond",
  "hold",
  "defer",
  "snapshot",
]);

export const OPERATOR_WIDGET_CONTRACT = Object.freeze({
  schema: "mousecat.operator-widget.contract/1",
  api: Object.freeze({
    available: "operator_widget.available()",
    ask: "operator_widget.ask(payload)",
    await: "operator_widget.await(interactionId)",
    close: "operator_widget.close(interactionId, reason)",
    respond: "operator_widget.respond(interactionId, responses)",
    hold: "operator_widget.hold(interactionId, responses)",
    defer: "operator_widget.defer(interactionId, responses)",
    snapshot: "operator_widget.snapshot()",
  }),
  requestSchema: "mousecat.operator-widget.request/1",
  resultSchema: "mousecat.operator-widget.result/1",
  shapes: INTERACTION_SHAPES,
  statuses: ["pending", "answered", "held", "withdrawn", "unavailable"],
  ownership: Object.freeze({
    mousecat: ["presentation", "navigation", "accessibility", "response-capture"],
    host: ["summon", "result-consumption"],
    caller: ["question-shaping", "interpretation", "recursion", "next-action", "failure-handling"],
  }),
});

export const SKILL_INVOCATION_CONTRACT = Object.freeze({
  schema: "mousecat.skill-invocation.contract/2",
  tool: "mousecat.skill",
  actions: Object.freeze(["invoke", "await", "handoff"]),
  skillRefs: Object.freeze(["crucible", "total-recall", "mass-assault"]),
  intakeSchema: "mousecat.skill-intake/2",
  resultSchema: "mousecat.skill-invocation/2",
  ownership: Object.freeze({
    mousecat: ["intake-normalization", "chronology", "lineage", "recall-snapshot", "widget-routing", "structured-return"],
    caller: ["context-supply", "seam-mapping", "option-compilation", "interpretation", "recursion"],
  }),
});

export const DELEGATION_CONTRACT = Object.freeze({
  schema: "mousecat.delegation.contract/2",
  tool: "mousecat.delegation",
  actions: Object.freeze(["start", "await", "rejoin"]),
  resultSchema: "mousecat.delegation/2",
  summarySchema: "mousecat.delegation.summary/2",
  statuses: Object.freeze(["running", "completed", "failed", "interrupted", "cancelled"]),
  upstreamOutcomes: Object.freeze(["pending", "succeeded", "failed", "unknown", "cancelled"]),
  cancellation: Object.freeze({
    request: "notifications/cancelled",
    scope: "http-mcp-negotiated-extension",
    extension: "mousecat/cancellation-ack",
    acknowledgement: "mousecat/cancellation/status",
    notificationAcceptanceIsAcknowledgement: false,
    acknowledgedSideEffects: "none",
    graceMs: Object.freeze({ minimum: 100, maximum: 5000, default: 1000 }),
  }),
  ownership: Object.freeze({
    mousecat: ["held-seam-custody", "async-invocation", "capability-gating", "safe-provenance", "cancellation-handshake", "widget-rejoin"],
    caller: ["upstream-payload", "result-interpretation", "rejoin-seam", "retry-acknowledgement"],
    upstream: ["execution", "idempotency-semantics"],
  }),
});

export const PROJECT_WORKBENCH_CONTRACT = Object.freeze({
  schema: "mousecat.project-workbench.contract/1",
  tool: "mousecat.workbench",
  actions: Object.freeze(["open", "snapshot", "operate", "close"]),
  adapterSchema: "mousecat.project-adapter/1",
  workbenchSchema: "mousecat.project-workbench/1",
  representationSchema: "mousecat.development-representation/1",
  operationReceiptSchema: "mousecat.project-operation-receipt/1",
  effects: Object.freeze(["observe", "draft", "stage-write", "source-write"]),
  executableEffects: Object.freeze(["observe", "draft"]),
  ownership: Object.freeze({
    mousecat: ["session-continuity", "source-freshness", "permits", "representations", "receipts"],
    project: ["schemas", "source-authority", "operations", "validation", "generation"],
    caller: ["intent-interpretation", "adapter-operation-selection", "result-consumption"],
  }),
});

export const HOST_ADAPTER_PROFILES = Object.freeze([
  {
    id: "generic-mcp",
    label: "Generic MCP Host",
    provider: null,
    hostKind: "mcp-consumer",
    primarySurface: "summoned-widget",
    eventStrategy: "poll-widget",
    renderTargets: ["active-interaction", "sequence-progress", "structured-response"],
    persistence: "mousecat-runtime",
  },
  {
    id: "codex",
    label: "Codex",
    provider: "openai",
    hostKind: "agent-host",
    primarySurface: "summoned-widget",
    eventStrategy: "poll-widget",
    renderTargets: ["active-interaction", "sequence-progress", "structured-response"],
    persistence: "mousecat-runtime",
  },
  {
    id: "claude",
    label: "Claude Code",
    provider: "anthropic",
    hostKind: "agent-host",
    primarySurface: "summoned-widget",
    eventStrategy: "poll-widget",
    renderTargets: ["active-interaction", "sequence-progress", "structured-response"],
    persistence: "mousecat-runtime",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    provider: "openai",
    hostKind: "agent-host",
    primarySurface: "summoned-widget",
    eventStrategy: "poll-widget",
    renderTargets: ["active-interaction", "sequence-progress", "structured-response"],
    persistence: "mousecat-runtime",
  },
  {
    id: "openai-sdk",
    label: "OpenAI SDK",
    provider: "openai",
    hostKind: "sdk",
    primarySurface: "summoned-widget",
    eventStrategy: "poll-widget",
    renderTargets: ["active-interaction", "sequence-progress", "structured-response"],
    persistence: "mousecat-runtime",
  },
  {
    id: "anthropic-sdk",
    label: "Anthropic SDK",
    provider: "anthropic",
    hostKind: "sdk",
    primarySurface: "summoned-widget",
    eventStrategy: "poll-widget",
    renderTargets: ["active-interaction", "sequence-progress", "structured-response"],
    persistence: "mousecat-runtime",
  },
  {
    id: "google-genai",
    label: "Google Gen AI SDK",
    provider: "google",
    hostKind: "sdk",
    primarySurface: "summoned-widget",
    eventStrategy: "poll-widget",
    renderTargets: ["active-interaction", "sequence-progress", "structured-response"],
    persistence: "mousecat-runtime",
  },
  {
    id: "antigravity",
    label: "Google Antigravity",
    provider: "google",
    hostKind: "agent-host",
    primarySurface: "summoned-widget",
    eventStrategy: "poll-widget",
    renderTargets: ["active-interaction", "sequence-progress", "structured-response"],
    persistence: "mousecat-runtime",
  },
  {
    id: "xai-sdk",
    label: "xAI SDK",
    provider: "xai",
    hostKind: "sdk",
    primarySurface: "summoned-widget",
    eventStrategy: "poll-widget",
    renderTargets: ["active-interaction", "sequence-progress", "structured-response"],
    persistence: "mousecat-runtime",
  },
  {
    id: "grok-build",
    label: "Grok Build",
    provider: "xai",
    hostKind: "agent-host",
    primarySurface: "summoned-widget",
    eventStrategy: "poll-widget",
    renderTargets: ["active-interaction", "sequence-progress", "structured-response"],
    persistence: "mousecat-runtime",
  },
  {
    id: "ollama",
    label: "Ollama Client",
    provider: "ollama",
    hostKind: "local-model-host",
    primarySurface: "summoned-widget",
    eventStrategy: "poll-widget",
    renderTargets: ["active-interaction", "sequence-progress", "structured-response"],
    persistence: "mousecat-runtime",
  },
  {
    id: "jetbrains",
    label: "JetBrains",
    provider: null,
    hostKind: "ide",
    primarySurface: "summoned-widget",
    eventStrategy: "poll-widget",
    renderTargets: ["active-interaction", "sequence-progress", "structured-response"],
    persistence: "mousecat-runtime",
  },
  {
    id: "cursor",
    label: "Cursor",
    provider: null,
    hostKind: "ide",
    primarySurface: "summoned-widget",
    eventStrategy: "poll-widget",
    renderTargets: ["active-interaction", "sequence-progress", "structured-response"],
    persistence: "mousecat-runtime",
  },
  {
    id: "cli",
    label: "CLI",
    provider: null,
    hostKind: "terminal",
    primarySurface: "summoned-widget",
    eventStrategy: "poll-widget",
    renderTargets: ["active-interaction", "sequence-progress", "structured-response"],
    persistence: "mousecat-runtime",
  },
]);

const HOST_STATE_SCOPES = Object.freeze({
  "generic-mcp": "host",
  codex: "thread",
  claude: "session",
  chatgpt: "conversation",
  "openai-sdk": "process",
  "anthropic-sdk": "process",
  "google-genai": "process",
  antigravity: "workspace",
  "xai-sdk": "process",
  "grok-build": "workspace",
  ollama: "process",
  jetbrains: "project",
  cursor: "workspace",
  cli: "process",
});

const HOST_STATE_RECORDS = Object.freeze([
  "sessions",
  "interactions",
  "delegations",
  "queue",
  "routePlans",
  "events",
  "credentialRefs",
  "projectWorkbenches",
  "projectRepresentations",
  "projectOperationReceipts",
]);

const SKILL_OPTION_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    label: { type: "string" },
    value: {},
    description: { type: "string" },
    recommended: { type: "boolean" },
  },
  required: ["label"],
  additionalProperties: false,
});

const SKILL_SEAM_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    id: { type: "string", description: "Stable source thread identity." },
    prompt: { type: "string" },
    title: { type: "string" },
    shape: { type: "string", enum: [...INTERACTION_SHAPES, "point", "architecture", "tree", "batch", "continuum"] },
    options: { type: "array", items: SKILL_OPTION_SCHEMA },
    occurredAt: { type: "string", description: "Chronology timestamp. Every seam in a multi-seam intake must supply this or every seam must supply order." },
    order: { type: "integer", description: "Unique chronology ordinal used only when every seam supplies order." },
    parentThreadId: { type: "string" },
    evidenceRef: { type: "string" },
    description: { type: "string" },
    mlReview: ML_REVIEW_JSON_SCHEMA,
    required: { type: "boolean" },
    sensitive: { type: "boolean" },
    selectionMode: { type: "string", enum: ["single", "multiple"] },
    allowFreeform: { type: "boolean" },
    recommendedDefault: {},
    parameter: {
      type: "object",
      properties: { min: {}, max: {}, step: {}, default: {}, unit: {} },
      additionalProperties: false,
    },
  },
  required: ["id", "prompt"],
  additionalProperties: false,
});

const SKILL_SESSION_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    sessionId: { type: "string" },
    host: { type: "string" },
    startedAt: { type: "string", description: "Session provenance. Multi-seam chronology still requires occurredAt or order on every seam." },
    seams: { type: "array", minItems: 1, items: SKILL_SEAM_SCHEMA },
  },
  required: ["sessionId", "seams"],
  additionalProperties: false,
});

export const MOUSECAT_TOOLS = Object.freeze([
  {
    name: "mousecat.widget",
    description: "Open, await, answer, hold, or inspect a compact cross-harness operator interaction. Use this instead of a host-native question UI when Mousecat is available.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: WIDGET_ACTIONS },
        request: { type: "object" },
        interactionId: { type: "string" },
        itemIds: { type: "array", items: { type: "string" }, description: "Unanswered items to withdraw; omitting the list withdraws every still-open item." },
        waitMs: { type: "integer", minimum: 0, maximum: 30000 },
        itemId: { type: "string" },
        responses: { type: "array" },
        response: { type: "object" },
        reason: { type: "string" },
      },
      additionalProperties: true,
    },
  },
  {
    name: "mousecat.skill",
    description: "Invoke Crucible, Total Recall, or Mass Assault through the Recursive Deliberation Framework. Mousecat normalizes shared context and returns a contextual framework handoff without imposing a fixed skill sequence.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: SKILL_INVOCATION_CONTRACT.actions, description: "invoke requires skillRef and source; await requires interactionId and the returned continuationToken; handoff also requires previousSkillRef and route provenance." },
        skillRef: { type: "string", description: "Built-in or runtime-registered skill identifier." },
        projectRef: { type: "string", maxLength: 512, description: "Owning project for this work, when known. Evidence from another project does not change ownership." },
        previousSkillRef: { type: "string", description: "Built-in or runtime-registered skill identifier that produced the prior result." },
        previousResultRef: { type: "string", description: "Result reference returned by the previous terminal skill result." },
        previousResultToken: { type: "string", description: "Opaque routing capability returned by the previous terminal skill result." },
        frameworkRef: { type: "string", description: "Required when the target belongs to more than one compatible framework." },
        route: {
          type: "object",
          properties: {
            selectedBy: { type: "string", description: "Router identity, such as a calling model, SDK, harness, Neo, or configured upstream." },
            reason: { type: "string" },
            contextRef: { type: "string" },
          },
          required: ["selectedBy", "reason"],
          additionalProperties: false,
        },
        source: {
          type: "object",
          description: "Originating host identity. invocationId makes retries idempotent.",
          properties: {
            host: { type: "string" },
            sessionId: { type: "string" },
            invocationId: { type: "string" },
          },
          required: ["host", "invocationId"],
          additionalProperties: false,
        },
        intake: {
          type: "object",
          description: "One mapped seam for Crucible, mapped seams/sessions for Mass Assault, or omitted for Total Recall over registered Mousecat state. Raw transcript and messages fields are rejected.",
          properties: {
            seams: { type: "array", minItems: 1, items: SKILL_SEAM_SCHEMA },
            sessions: { type: "array", minItems: 1, items: SKILL_SESSION_SCHEMA },
          },
          minProperties: 1,
          additionalProperties: false,
        },
        interactionId: { type: "string" },
        continuationToken: { type: "string", description: "Opaque capability returned by invoke and required by await or replay." },
        parentInteractionId: { type: "string" },
        title: { type: "string" },
        waitMs: { type: "integer", minimum: 0, maximum: 30000 },
        constraints: { type: "object" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "mousecat.history",
    description: "Query durable decision and plan history, index a declared project source, or register an explicitly proposed method or reported result.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["query", "index", "register"] },
        permit: { type: "object", additionalProperties: true },
        ref: { type: "string" }, revision: { type: "string" }, query: { type: "string" },
        kind: { type: "string" }, project: { type: "string" }, standing: { type: "string" },
        from: { type: "string" }, to: { type: "string" }, offset: { type: "integer" }, limit: { type: "integer" },
        surfaceId: { type: "string" }, path: { type: "string" }, record: { type: "object", additionalProperties: true }
      }, additionalProperties: false
    }
  },
  {
    name: "mousecat.projects",
    description: "List governed project surfaces, draft a surface from an unfamiliar repository, register a ratified surface, read each project's governing documents and open threads, and summarize declared data sources. Mousecat reads project state and never writes it.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: PROJECT_SURFACE_CONTRACT.actions },
        surfaceId: { type: "string", description: "Registered project surface identifier." },
        groupId: { type: "string", description: "Registered project group identifier." },
        projectRef: { type: "string", description: "Project reference for thread queries without a surface id." },
        root: { type: "string", description: "Repository root to draft a surface from." },
        note: { type: "string", description: "Optional caller note recorded with a draft." },
        source: { type: "string", description: "Declared data source name to summarize." },
        surface: { type: "object", description: "Ratified project surface descriptor to register." },
        group: { type: "object", description: "Project group descriptor: groupId, label, optional projectRef, memberSurfaceIds." },
        permit: { type: "object", description: "Work permit presented by the caller." },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "mousecat.registry",
    description: "List or register declarative operator-interaction skill-framework descriptors without executable presentation code.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "register", "register-project-adapter"] },
        namespace: { type: "string" },
        namespaceToken: { type: "string", description: "Opaque capability returned when a namespace is first claimed." },
        revision: { type: "integer", minimum: 1 },
        permit: { type: "object" },
        framework: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            purpose: { type: "string" },
            boundaryRefs: { type: "array", items: { type: "string" } },
            router: { type: "string" },
          },
          required: ["id"],
          additionalProperties: false,
        },
        skills: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              role: { type: "string" },
              accepts: { type: "string" },
              returns: { type: "string" },
              intakeMode: { type: "string", enum: ["single-seam", "mapped-seams"] },
              frameworkRefs: { type: "array", items: { type: "string" } },
              moduleRefs: { type: "array", items: { type: "string" } },
              presentation: {
                type: "object",
                properties: {
                  grammar: { type: "string" },
                  icon: { type: "string" },
                  accent: { type: "string", enum: ["neutral", "blue", "green", "rose", "amber", "cyan", "violet"] },
                  primitives: { type: "array", items: { type: "string" } },
                  motion: { type: "string" },
                },
                additionalProperties: false,
              },
            },
            required: ["id"],
            additionalProperties: false,
          },
        },
        projectAdapter: {
          type: "object",
          properties: {
            adapterId: { type: "string" },
            namespace: { type: "string" },
            revision: { type: "integer", minimum: 1 },
            projectRef: { type: "string" },
            projectKind: { type: "string" },
            sourceAuthorities: { type: "array", minItems: 1, items: { type: "string" } },
            operationDescriptors: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                properties: {
                  operationId: { type: "string" },
                  effect: { type: "string", enum: ["observe", "draft", "stage-write", "source-write"] },
                  inputSchemaRef: { type: "string" },
                  outputSchemaRef: { type: "string" },
                  permitRef: { type: "string" },
                  projectAuthorizationRef: { type: "string" },
                },
                required: ["operationId", "effect", "inputSchemaRef", "outputSchemaRef", "permitRef"],
                additionalProperties: false,
              },
            },
            representationSchemaRefs: { type: "array", minItems: 1, items: { type: "string" } },
            validationCapabilityRef: { type: "string" },
            checkpointCapabilityRef: { type: "string" },
            connectorRef: { type: "string" },
          },
          required: [
            "adapterId",
            "namespace",
            "revision",
            "projectRef",
            "projectKind",
            "sourceAuthorities",
            "operationDescriptors",
            "representationSchemaRefs",
            "connectorRef",
          ],
          additionalProperties: false,
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "mousecat.workbench",
    description: "Open and operate a source-bound read-only project workbench through a registered project adapter.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: PROJECT_WORKBENCH_CONTRACT.actions },
        workbenchId: { type: "string" },
        workbenchToken: { type: "string", description: "Opaque capability returned by open and required by later session actions." },
        adapterRef: { type: "string" },
        hostSessionRef: { type: "string" },
        operatorRef: { type: "string" },
        intent: { type: "string" },
        sourceVector: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              authority: { type: "string" },
              sourceRevision: { type: "string" },
              observedAt: { type: "string" },
              status: { type: "string" },
            },
            required: ["authority", "sourceRevision", "observedAt", "status"],
            additionalProperties: false,
          },
        },
        subjectRefs: { type: "array", items: { type: "string" } },
        operationId: { type: "string" },
        input: { type: "object" },
        permit: { type: "object" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "mousecat.delegation",
    description: "Delegate one capability-owned held skill seam to a permitted upstream without blocking independent work, then rejoin a caller-interpreted result through the existing widget.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: DELEGATION_CONTRACT.actions,
          description: "start requires source, origin, target, payload, originContinuationToken, and a tool-invocation permit; await requires delegationId and delegationToken; rejoin also requires a mapped seam and operator-interaction permit.",
        },
        delegationId: { type: "string" },
        delegationToken: { type: "string", description: "Opaque capability returned once by start and required by replay, await, or rejoin." },
        source: {
          type: "object",
          properties: {
            host: { type: "string" },
            sessionId: { type: "string" },
            invocationId: { type: "string" },
          },
          required: ["host", "invocationId"],
          additionalProperties: false,
        },
        origin: {
          type: "object",
          properties: {
            interactionId: { type: "string" },
            itemId: { type: "string" },
          },
          required: ["interactionId", "itemId"],
          additionalProperties: false,
        },
        originContinuationToken: { type: "string", description: "Capability returned by the originating mousecat.skill invocation." },
        target: {
          type: "object",
          properties: {
            upstream: { type: "string" },
            capability: { type: "string" },
          },
          required: ["upstream", "capability"],
          additionalProperties: false,
        },
        payload: { type: "object", description: "Mapped upstream arguments only; transcript, messages, and secret-shaped fields are rejected." },
        permit: { type: "object" },
        timeoutMs: { type: "integer", minimum: 1000, maximum: 300000 },
        duplicateSideEffectAcknowledged: { type: "boolean" },
        retry: { type: "boolean" },
        waitMs: { type: "integer", minimum: 0, maximum: 30000 },
        seam: SKILL_SEAM_SCHEMA,
        title: { type: "string" },
      },
      required: ["action"],
      additionalProperties: false,
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
        action: { type: "string", enum: ["start", "heartbeat", "close", "snapshot", "total-recall"] },
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
    name: "mousecat.host-state",
    description: "Return a host-profile state binding packet with adapter metadata and redacted public state records.",
    inputSchema: {
      type: "object",
      properties: {
        profileId: { type: "string", description: "Known profile id or any custom MCP/SDK host id. Unknown ids inherit the generic provider-neutral adapter contract." },
        limit: { type: "integer" },
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
    id: "gitlab",
    label: "GitLab",
    kind: "source-host",
    adapter: "integration-adapter",
    defaultEnabled: false,
    capabilities: ["projects", "merge-requests", "pipelines", "jobs"],
    policy: "tool-invocation permit; host-managed authentication; explicit confirmation for consequential writes",
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

export const NAMED_SKILLS = Object.freeze([
  {
    id: "crucible",
    label: "Crucible",
    frameworkRefs: ["recursive-deliberation"],
    role: "decision-compiler",
    accepts: "one-mapped-decision-seam",
    returns: "typed-operator-resolution",
    moduleRefs: ["crucible.point", "crucible.architecture", "crucible.tree", "crucible.continuum"],
    presentation: {
      grammar: "branch-field",
      icon: "git-branch",
      accent: "blue",
      primitives: ["option-node", "freeform", "parameter", "dependency-edge"],
      motion: "staggered-entry",
    },
    invocation: "operator-interaction",
    handoff: "contextual-framework-routing",
  },
  {
    id: "total-recall",
    label: "Total Recall",
    frameworkRefs: ["recursive-deliberation"],
    role: "context-reconstructor",
    accepts: "registered-session-state",
    returns: "chronological-open-seam-map",
    moduleRefs: ["total-recall.docket"],
    presentation: {
      grammar: "session-timeline",
      icon: "history",
      accent: "green",
      primitives: ["session-node", "timeline", "open-seam", "evidence-link"],
      motion: "chronology-flow",
    },
    invocation: "read-shaped-reconstruction",
    handoff: "contextual-framework-routing",
  },
  {
    id: "mass-assault",
    label: "Mass Assault",
    frameworkRefs: ["recursive-deliberation"],
    role: "mapped-seam-dispatcher",
    accepts: "chronological-mapped-seam-set",
    returns: "lineage-ordered-resolutions",
    moduleRefs: ["mass-assault.queue"],
    presentation: {
      grammar: "decision-wall",
      icon: "layout-grid",
      accent: "rose",
      primitives: ["decision-card", "decision-atlas", "semantic-section", "recommendation-preview", "draft-readiness", "progress-state", "review-drawer", "batch-response", "lineage-link"],
      motion: "state-change-only",
    },
    invocation: "operator-interaction",
    handoff: "contextual-framework-routing",
  },
]);

export const ATOMIC_SKILLS = Object.freeze([
  {
    id: "crucible.point",
    skill: "crucible",
    label: "Ask Point",
    summary: "Surface one operator decision with recommended options.",
    frameworkRefs: ["recursive-deliberation"],
    defaultTool: "mousecat.skill",
    buttons: [
      button("btn.crucible.point", "Ask", "mousecat.skill", { action: "invoke", skillRef: "crucible" }),
    ],
  },
  {
    id: "crucible.architecture",
    skill: "crucible",
    label: "Architecture Fork",
    summary: "Surface distinct system shapes for an unresolved architecture decision.",
    frameworkRefs: ["recursive-deliberation"],
    defaultTool: "mousecat.skill",
    buttons: [
      button("btn.crucible.architecture", "Shape", "mousecat.skill", { action: "invoke", skillRef: "crucible" }),
    ],
  },
  {
    id: "crucible.tree",
    skill: "crucible",
    label: "Decision Tree",
    summary: "Walk an interdependent plan decision tree.",
    frameworkRefs: ["recursive-deliberation"],
    defaultTool: "mousecat.skill",
    buttons: [
      button("btn.crucible.tree", "Tree", "mousecat.skill", { action: "invoke", skillRef: "crucible" }),
    ],
  },
  {
    id: "crucible.continuum",
    skill: "crucible",
    label: "Continuum",
    summary: "Resolve a bounded parameter with a principled default instead of manufacturing discrete options.",
    frameworkRefs: ["recursive-deliberation"],
    defaultTool: "mousecat.skill",
    buttons: [
      button("btn.crucible.continuum", "Set", "mousecat.skill", { action: "invoke", skillRef: "crucible" }),
    ],
  },
  {
    id: "mass-assault.queue",
    skill: "mass-assault",
    label: "Run Queue",
    summary: "Present a mapped decision queue for rapid UI discharge.",
    frameworkRefs: ["recursive-deliberation"],
    defaultTool: "mousecat.skill",
    buttons: [
      button("btn.mass-assault.invoke", "Run", "mousecat.skill", { action: "invoke", skillRef: "mass-assault" }),
    ],
  },
  {
    id: "total-recall.docket",
    skill: "total-recall",
    label: "Recall",
    summary: "Reconstruct session state, loose threads, decisions, and next actions.",
    frameworkRefs: ["recursive-deliberation"],
    defaultTool: "mousecat.skill",
    buttons: [
      button("btn.total-recall.docket", "Recall", "mousecat.skill", { action: "invoke", skillRef: "total-recall" }),
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
    id: "recursive-deliberation",
    label: "Recursive Deliberation Framework",
    skillRefs: ["crucible", "total-recall", "mass-assault"],
    atomicSkillRefs: ["crucible.point", "crucible.architecture", "crucible.tree", "crucible.continuum", "total-recall.docket", "mass-assault.queue"],
    boundaryRefs: ["observer", "operator-interaction"],
    purpose: "Contextually compose recall, decision compilation, and mapped-seam discharge without a fixed skill sequence.",
    routing: {
      strategy: "contextual-capability-routing",
      router: "registered-host-model-or-configured-upstream",
      defaultRouter: null,
      neoRequired: false,
      availableSkillRefs: ["crucible", "total-recall", "mass-assault"],
      fixedTransitions: false,
      recursion: "re-evaluate-framework-after-every-skill-result",
    },
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
    grants: ["mousecat.history:query", "mousecat.status", "mousecat.visualize", "mousecat.host-state", "mousecat.route", "mousecat.bridge", "mousecat.workbench:operate", "mousecat.session:snapshot", "mousecat.widget:available", "mousecat.projects:list", "mousecat.projects:discover", "mousecat.projects:draft", "mousecat.projects:describe", "mousecat.projects:threads", "mousecat.projects:data"],
    canInvokeUpstreams: false,
    requiresOperatorPresence: false,
  },
  {
    id: "operator-interaction",
    label: "Operator Interaction",
    grants: ["mousecat.history", "mousecat.widget", "mousecat.skill", "mousecat.registry", "mousecat.workbench:open", "mousecat.workbench:operate", "mousecat.delegation:rejoin", "mousecat.ask", "mousecat.queue", "mousecat.session", "mousecat.projects"],
    canInvokeUpstreams: false,
    requiresOperatorPresence: true,
  },
  {
    id: "tool-invocation",
    label: "Tool Invocation",
    grants: ["mousecat.invoke", "mousecat.delegation:start", "mousecat.route"],
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
    tool: "mousecat.history", defaultPermit: "action-specific",
    actionPermits: { query: "observer", index: "operator-interaction", register: "operator-interaction" },
    sideEffects: ["local-history-index", "read-only-registered-project-source"], upstreamAccess: "none"
  },
  {
    tool: "mousecat.widget",
    defaultPermit: "operator-interaction",
    sideEffects: ["in-memory-interaction", "in-memory-response", "audit-event"],
    upstreamAccess: "none",
  },
  {
    tool: "mousecat.skill",
    defaultPermit: "operator-interaction",
    sideEffects: ["normalized-session-intake", "in-memory-interaction", "structured-return", "audit-event"],
    upstreamAccess: "none",
  },
  {
    tool: "mousecat.registry",
    defaultPermit: "operator-interaction",
    sideEffects: ["local-framework-registry", "local-skill-registry", "audit-event"],
    upstreamAccess: "none",
  },
  {
    tool: "mousecat.workbench",
    defaultPermit: "action-specific",
    actionPermits: {
      open: "operator-interaction",
      snapshot: "caller-capability",
      operate: "adapter-operation-permit",
      close: "caller-capability",
    },
    sideEffects: ["local-workbench-session", "read-only-project-operation", "source-bound-representation", "operation-receipt"],
    upstreamAccess: "registered-project-adapter-read-only",
  },
  {
    tool: "mousecat.projects",
    defaultPermit: "action-specific",
    actionPermits: {
      list: "observer",
      discover: "observer",
      draft: "observer",
      register: "operator-interaction",
      describe: "observer",
      threads: "observer",
      data: "observer",
    },
    sideEffects: ["local-surface-registry", "read-only-project-documents", "read-only-project-data", "audit-event"],
    upstreamAccess: "none",
  },
  {
    tool: "mousecat.delegation",
    defaultPermit: "action-specific",
    actionPermits: {
      start: "tool-invocation",
      await: "caller-capability",
      rejoin: "operator-interaction",
    },
    sideEffects: ["safe-delegation-record", "async-upstream-call", "audit-event", "existing-widget-rejoin"],
    upstreamAccess: "permit-gated-start-only",
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
    tool: "mousecat.host-state",
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
    {
      id: "widget.defer",
      label: "Later",
      tool: "mousecat.widget",
      payload: { action: "defer" },
      requiresPermit: "operator-interaction",
      shape: "queue",
    },
  ]);
}

export function adapterProfiles() {
  return HOST_ADAPTER_PROFILES.map((profile) => ({
    ...profile,
    renderTargets: [...profile.renderTargets],
  }));
}

function resolveHostProfile(profileId) {
  const known = HOST_ADAPTER_PROFILES.find((candidate) => candidate.id === profileId);
  if (known) return known;
  const generic = HOST_ADAPTER_PROFILES[0];
  const customId = String(profileId || generic.id).trim() || generic.id;
  return {
    ...generic,
    id: customId,
    label: customId === generic.id ? generic.label : customId,
    hostKind: customId === generic.id ? generic.hostKind : "custom-mcp-host",
  };
}

function toolCall(tool, args = {}) {
  return {
    transport: "mcp-tool",
    tool,
    arguments: { ...args },
  };
}

function cliCommand(...args) {
  return {
    transport: "cli",
    executable: "mousecat",
    arguments: args,
    command: ["mousecat", ...args].join(" "),
  };
}

export function hostCommandPack(profileId) {
  const profile = resolveHostProfile(profileId);
  return {
    schema: "mousecat.host-command-pack/1",
    profileId: profile.id,
    binding: {
      mcp: toolCall("mousecat.host-state", { profileId: profile.id }),
      cli: cliCommand("host-state", profile.id),
    },
    sessionHeartbeat: {
      mcp: toolCall("mousecat.session", {
        action: "heartbeat",
        sessionId: "<sessionId>",
        facts: { host: profile.id, threadId: "<threadId>", objective: "<objective>" },
      }),
      cli: cliCommand("session", "heartbeat", "<sessionId>"),
    },
    snapshot: {
      mcp: toolCall("mousecat.session", { action: "snapshot" }),
      cli: cliCommand("session", "snapshot"),
    },
    recall: {
      mcp: toolCall("mousecat.session", { action: "total-recall" }),
      cli: cliCommand("session", "total-recall"),
    },
    routePreview: {
      mcp: toolCall("mousecat.route", { upstream: "<upstream>", capability: "<capability>", intent: "<intent>" }),
      cli: cliCommand("route", "<upstream>", "<capability>"),
    },
    skillInvoke: {
      mcp: toolCall("mousecat.skill", {
        action: "invoke",
        skillRef: "<crucible|total-recall|mass-assault>",
        source: { host: "<host>", sessionId: "<sessionId>", invocationId: "<invocationId>" },
        intake: "<mapped-seams>",
      }),
    },
    skillAwait: {
      mcp: toolCall("mousecat.skill", {
        action: "await",
        interactionId: "<interactionId>",
        continuationToken: "<cap>",
        waitMs: 30000,
      }),
    },
    delegationStart: {
      mcp: toolCall("mousecat.delegation", {
        action: "start",
        source: { host: "<host>", sessionId: "<sessionId>", invocationId: "<invocationId>" },
        origin: { interactionId: "<heldInteractionId>", itemId: "<heldItemId>" },
        originContinuationToken: "<cap>",
        target: { upstream: "<upstream>", capability: "<capability>" },
        payload: "<mapped-upstream-arguments>",
        permit: { profileId: "tool-invocation" },
      }),
    },
    delegationAwait: {
      mcp: toolCall("mousecat.delegation", {
        action: "await",
        delegationId: "<delegationId>",
        delegationToken: "<cap>",
        waitMs: 30000,
      }),
    },
    delegationRejoin: {
      mcp: toolCall("mousecat.delegation", {
        action: "rejoin",
        delegationId: "<delegationId>",
        delegationToken: "<cap>",
        permit: { profileId: "operator-interaction" },
        seam: "<caller-interpreted-seam>",
      }),
    },
    workbenchOpen: {
      mcp: toolCall("mousecat.workbench", {
        action: "open",
        adapterRef: "<project-adapter>",
        hostSessionRef: "<host-session>",
        operatorRef: "<operator>",
        intent: "<project-intent>",
        sourceVector: "<current-source-vector>",
        subjectRefs: "<project-subjects>",
        permit: { profileId: "operator-interaction" },
      }),
    },
    workbenchSnapshot: {
      mcp: toolCall("mousecat.workbench", {
        action: "snapshot",
        workbenchId: "<workbenchId>",
        workbenchToken: "<cap>",
      }),
    },
    workbenchOperate: {
      mcp: toolCall("mousecat.workbench", {
        action: "operate",
        workbenchId: "<workbenchId>",
        workbenchToken: "<cap>",
        operationId: "<adapter-operation>",
        input: "<project-owned-input>",
        permit: { profileId: "<adapter-operation-permit>" },
      }),
    },
    workbenchClose: {
      mcp: toolCall("mousecat.workbench", {
        action: "close",
        workbenchId: "<workbenchId>",
        workbenchToken: "<cap>",
      }),
    },
    respond: {
      mcp: toolCall("mousecat.widget", {
        action: "respond",
        interactionId: "<interactionId>",
        responses: "<responses>",
      }),
    },
    hold: {
      mcp: toolCall("mousecat.widget", {
        action: "hold",
        interactionId: "<interactionId>",
        responses: "<responses>",
      }),
    },
    defer: {
      mcp: toolCall("mousecat.widget", {
        action: "defer",
        interactionId: "<interactionId>",
        responses: "<responses>",
      }),
    },
    queueAnswer: {
      mcp: toolCall("mousecat.queue", {
        action: "answer",
        itemId: "<itemId>",
        answer: "<answer>",
      }),
    },
    queueHold: {
      mcp: toolCall("mousecat.queue", {
        action: "hold",
        itemId: "<itemId>",
        reason: "<reason>",
      }),
    },
    queueRatify: {
      mcp: toolCall("mousecat.queue", { action: "ratify" }),
    },
    enqueue: {
      mcp: toolCall("mousecat.queue", {
        action: "enqueue",
        item: "<item>",
      }),
    },
    registerCredentialReference: {
      mcp: toolCall("mousecat.credentials", {
        action: "register-reference",
        upstream: "<upstream>",
        ref: "<environment-variable>",
        kind: "environment-variable",
      }),
    },
    boundaries: [
      "command-templates-only",
      "host-fills-placeholders",
      "permits-still-required",
      "credential-values-withheld",
      "private-upstream-payloads-withheld",
    ],
  };
}

export function hostStateAdapter(profileId) {
  const profile = resolveHostProfile(profileId);
  return {
    schema: "mousecat.host-state-adapter/1",
    profileId: profile.id,
    scope: HOST_STATE_SCOPES[profile.id] || "host",
    storage: profile.persistence,
    reads: {
      tools: ["mousecat.status", "mousecat.session", "mousecat.visualize", "mousecat.route", "mousecat.workbench"],
      records: [...HOST_STATE_RECORDS],
    },
    writes: {
      tools: ["mousecat.widget", "mousecat.skill", "mousecat.registry", "mousecat.workbench", "mousecat.delegation", "mousecat.ask", "mousecat.session", "mousecat.queue", "mousecat.credentials"],
      records: ["sessions", "interactions", "delegations", "queue", "frameworkRegistry", "projectWorkbenches", "projectRepresentations", "projectOperationReceipts", "credentialRefs"],
    },
    sync: {
      trigger: profile.eventStrategy,
      snapshot: "mousecat.session(action=snapshot)",
      recall: "mousecat.session(action=total-recall)",
      routePreview: "mousecat.route",
    },
    commands: hostCommandPack(profile.id),
    boundaries: [
      "mousecat-owns-runtime-state",
      "host-consumes-results",
      "mousecat-owns-state-semantics",
      "credential-values-withheld",
      "private-upstream-payloads-withheld",
    ],
  };
}

export function hostStateAdapters() {
  return {
    schema: "mousecat.host-state-adapters/1",
    adapters: HOST_ADAPTER_PROFILES.map((profile) => hostStateAdapter(profile.id)),
  };
}

export function adapterRenderPacket(profileId) {
  const profile = resolveHostProfile(profileId);
  return {
    schema: "mousecat.adapter.render-packet/1",
    version: "1.0.0",
    profileId: profile.id,
    host: {
      id: profile.id,
      label: profile.label,
      kind: profile.hostKind,
    },
    presentation: {
      primarySurface: profile.primarySurface,
      renderTargets: [...profile.renderTargets],
      eventStrategy: profile.eventStrategy,
      persistence: profile.persistence,
    },
    consumes: {
      tools: ["mousecat.widget", "mousecat.skill", "mousecat.registry", "mousecat.workbench", "mousecat.delegation", "mousecat.ask", "mousecat.queue", "mousecat.visualize", "mousecat.route"],
      schemas: [
        OPERATOR_WIDGET_CONTRACT.schema,
        OPERATOR_WIDGET_CONTRACT.requestSchema,
        OPERATOR_WIDGET_CONTRACT.resultSchema,
        SKILL_INVOCATION_CONTRACT.schema,
        SKILL_INVOCATION_CONTRACT.intakeSchema,
        SKILL_INVOCATION_CONTRACT.resultSchema,
        DELEGATION_CONTRACT.schema,
        DELEGATION_CONTRACT.resultSchema,
        PROJECT_WORKBENCH_CONTRACT.schema,
        PROJECT_WORKBENCH_CONTRACT.adapterSchema,
        PROJECT_WORKBENCH_CONTRACT.workbenchSchema,
        PROJECT_WORKBENCH_CONTRACT.representationSchema,
        PROJECT_WORKBENCH_CONTRACT.operationReceiptSchema,
        "mousecat.integration-adapter/1",
        "mousecat.integration-result/1",
        "mousecat.host-state-adapter/1",
        "mousecat.host-command-pack/1",
        "mousecat.visualizer/1",
        "mousecat.visualizer.event/1",
      ],
      streams: {
        snapshot: "mousecat.visualize(stream=snapshot)",
        events: "mousecat.visualize(stream=events)",
      },
    },
    controls: widgetControls().map((control) => ({
      id: control.id,
      tool: control.tool,
      payload: { ...control.payload },
      requiresPermit: control.requiresPermit,
      shape: control.shape,
    })),
    boundaries: [
      "mousecat-renders-widget",
      "host-summons-and-consumes",
      "mousecat-owns-semantics",
      "credential-values-withheld",
      "private-upstream-payloads-withheld",
    ],
    commands: hostCommandPack(profile.id),
    stateAdapter: hostStateAdapter(profile.id),
  };
}

export function adapterRenderPackets() {
  return {
    schema: "mousecat.adapter.render-packets/1",
    profiles: adapterProfiles(),
    stateAdapters: hostStateAdapters(),
    packets: HOST_ADAPTER_PROFILES.map((profile) => adapterRenderPacket(profile.id)),
  };
}

export function catalogSnapshot(options = {}) {
  return {
    schema: "mousecat.catalog/1",
    interactionShapes: INTERACTION_SHAPES,
    interactionStatuses: INTERACTION_STATUSES,
    widgetContract: OPERATOR_WIDGET_CONTRACT,
    skillInvocationContract: SKILL_INVOCATION_CONTRACT,
    delegationContract: DELEGATION_CONTRACT,
    projectWorkbenchContract: PROJECT_WORKBENCH_CONTRACT,
    tools: MOUSECAT_TOOLS,
    upstreams: UPSTREAMS,
    namedSkills: NAMED_SKILLS,
    atomicSkills: ATOMIC_SKILLS,
    skillFrameworks: SKILL_FRAMEWORKS,
    workPermitProfiles: WORK_PERMIT_PROFILES,
    toolBoundaries: TOOL_BOUNDARIES,
    buttons: skillButtons(),
    widgetControls: widgetControls(),
    adapterProfiles: adapterProfiles(),
    hostStateAdapters: hostStateAdapters(),
    adapterRenderPackets: adapterRenderPackets(),
    integrationAdapters: integrationAdapterManifests(options.integrationRegistry),
  };
}
