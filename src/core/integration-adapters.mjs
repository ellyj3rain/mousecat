import {
  createIntegrationAdapterRegistry,
  defineIntegrationAdapter,
  publicIntegrationManifest,
} from "./integration-contracts.mjs";
import { isAbsolute, relative, resolve } from "node:path";

function inputSchema(properties, required = []) {
  return Object.freeze({
    type: "object",
    properties: Object.freeze(properties),
    ...(required.length > 0 ? { required: Object.freeze(required) } : {}),
    additionalProperties: false,
  });
}

const PROJECT = { type: "string", description: "GitLab numeric project id or namespace/project path. Uses the configured default when omitted." };
const POSITIVE_INTEGER = { type: "integer", minimum: 1 };
const NONNEGATIVE_INTEGER = { type: "integer", minimum: 0 };
const CONFIRM = { type: "boolean", description: "Explicit confirmation for a consequential write." };

const GITLAB_CAPABILITIES = Object.freeze([
  {
    id: "gitlab.user.get",
    label: "Current GitLab User",
    description: "Read the identity currently authenticated by glab.",
    access: "read",
    inputSchema: inputSchema({}),
    compile: () => ({ method: "GET", path: "user", fields: {} }),
  },
  {
    id: "gitlab.project.get",
    label: "GitLab Project",
    description: "Read one GitLab project by id or path.",
    access: "read",
    inputSchema: inputSchema({ project: PROJECT }),
    compile: (payload, connector) => ({ method: "GET", path: `projects/${projectRef(payload, connector)}`, fields: {} }),
  },
  {
    id: "gitlab.merge-requests.list",
    label: "GitLab Merge Requests",
    description: "List merge requests for one project.",
    access: "read",
    inputSchema: inputSchema({
      project: PROJECT,
      state: { type: "string", enum: ["opened", "closed", "locked", "merged", "all"] },
      sourceBranch: { type: "string" },
      targetBranch: { type: "string" },
      page: POSITIVE_INTEGER,
      perPage: { type: "integer", minimum: 1, maximum: 100 },
    }),
    compile: (payload, connector) => ({
      method: "GET",
      path: `projects/${projectRef(payload, connector)}/merge_requests`,
      fields: compactFields({
        state: payload.state,
        source_branch: payload.sourceBranch,
        target_branch: payload.targetBranch,
        page: payload.page,
        per_page: payload.perPage,
      }),
    }),
  },
  {
    id: "gitlab.merge-requests.get",
    label: "GitLab Merge Request",
    description: "Read one merge request.",
    access: "read",
    inputSchema: inputSchema({ project: PROJECT, iid: POSITIVE_INTEGER }, ["iid"]),
    compile: (payload, connector) => ({
      method: "GET",
      path: `projects/${projectRef(payload, connector)}/merge_requests/${positiveInteger(payload.iid, "iid")}`,
      fields: {},
    }),
  },
  {
    id: "gitlab.pipelines.list",
    label: "GitLab Pipelines",
    description: "List pipelines for one project.",
    access: "read",
    inputSchema: inputSchema({
      project: PROJECT,
      ref: { type: "string" },
      status: { type: "string", enum: ["created", "waiting_for_resource", "preparing", "pending", "running", "success", "failed", "canceled", "skipped", "manual", "scheduled"] },
      page: POSITIVE_INTEGER,
      perPage: { type: "integer", minimum: 1, maximum: 100 },
    }),
    compile: (payload, connector) => ({
      method: "GET",
      path: `projects/${projectRef(payload, connector)}/pipelines`,
      fields: compactFields({ ref: payload.ref, status: payload.status, page: payload.page, per_page: payload.perPage }),
    }),
  },
  {
    id: "gitlab.pipelines.get",
    label: "GitLab Pipeline",
    description: "Read one pipeline.",
    access: "read",
    inputSchema: inputSchema({ project: PROJECT, pipelineId: POSITIVE_INTEGER }, ["pipelineId"]),
    compile: (payload, connector) => ({
      method: "GET",
      path: `projects/${projectRef(payload, connector)}/pipelines/${positiveInteger(payload.pipelineId, "pipelineId")}`,
      fields: {},
    }),
  },
  {
    id: "gitlab.pipeline-jobs.list",
    label: "GitLab Pipeline Jobs",
    description: "List jobs for one pipeline.",
    access: "read",
    inputSchema: inputSchema({ project: PROJECT, pipelineId: POSITIVE_INTEGER, includeRetried: { type: "boolean" } }, ["pipelineId"]),
    compile: (payload, connector) => ({
      method: "GET",
      path: `projects/${projectRef(payload, connector)}/pipelines/${positiveInteger(payload.pipelineId, "pipelineId")}/jobs`,
      fields: compactFields({ include_retried: payload.includeRetried }),
    }),
  },
  {
    id: "gitlab.merge-requests.create",
    label: "Create GitLab Merge Request",
    description: "Create one merge request from explicit source, target, title, and description fields.",
    access: "write",
    inputSchema: inputSchema({
      project: PROJECT,
      sourceBranch: { type: "string" },
      targetBranch: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      squash: { type: "boolean" },
      removeSourceBranch: { type: "boolean" },
      confirm: CONFIRM,
    }, ["sourceBranch", "targetBranch", "title", "confirm"]),
    compile: (payload, connector) => {
      requireConfirmation(payload);
      return {
        method: "POST",
        path: `projects/${projectRef(payload, connector)}/merge_requests`,
        fields: compactFields({
          source_branch: requiredText(payload.sourceBranch, "sourceBranch"),
          target_branch: requiredText(payload.targetBranch, "targetBranch"),
          title: requiredText(payload.title, "title"),
          description: payload.description,
          squash: payload.squash,
          remove_source_branch: payload.removeSourceBranch,
        }),
      };
    },
  },
  {
    id: "gitlab.merge-requests.merge",
    label: "Merge GitLab Merge Request",
    description: "Merge one merge request after explicit confirmation.",
    access: "consequential-write",
    inputSchema: inputSchema({
      project: PROJECT,
      iid: POSITIVE_INTEGER,
      sha: { type: "string" },
      squash: { type: "boolean" },
      removeSourceBranch: { type: "boolean" },
      confirm: CONFIRM,
    }, ["iid", "confirm"]),
    compile: (payload, connector) => {
      requireConfirmation(payload);
      return {
        method: "PUT",
        path: `projects/${projectRef(payload, connector)}/merge_requests/${positiveInteger(payload.iid, "iid")}/merge`,
        fields: compactFields({
          sha: payload.sha,
          squash: payload.squash,
          should_remove_source_branch: payload.removeSourceBranch,
        }),
      };
    },
  },
  {
    id: "gitlab.pipelines.retry",
    label: "Retry GitLab Pipeline",
    description: "Retry one pipeline after explicit confirmation.",
    access: "consequential-write",
    inputSchema: inputSchema({ project: PROJECT, pipelineId: POSITIVE_INTEGER, confirm: CONFIRM }, ["pipelineId", "confirm"]),
    compile: (payload, connector) => {
      requireConfirmation(payload);
      return {
        method: "POST",
        path: `projects/${projectRef(payload, connector)}/pipelines/${positiveInteger(payload.pipelineId, "pipelineId")}/retry`,
        fields: {},
      };
    },
  },
]);

const CA_WORLD_AUTHORING_CAPABILITIES = Object.freeze([
  {
    id: "cao.world-atlases.catalog",
    label: "CA Saved Worlds",
    description: "List the exact saved-world atlases available to the CA offline creator.",
    access: "read",
    inputSchema: inputSchema({}),
    compile: (_payload, connector) => ({
      method: "READ",
      path: "world-atlases",
      fields: {},
      arguments: ["catalog", "--root", caRoot(connector, "atlasRoot")],
    }),
  },
  {
    id: "cao.area.inspect",
    label: "CA Saved Area",
    description: "Read one exact saved-world area and its current CA geography facts.",
    access: "read",
    inputSchema: inputSchema({
      atlasId: { type: "string" },
      tileId: NONNEGATIVE_INTEGER,
    }, ["atlasId", "tileId"]),
    compile: (payload, connector) => ({
      method: "READ",
      path: "area",
      fields: { atlasId: payload.atlasId, tileId: payload.tileId },
      arguments: [
        "inspect",
        "--atlas", caAtlasDirectory(connector, payload.atlasId),
        "--tile", String(payload.tileId),
      ],
    }),
  },
  {
    id: "cao.region.find",
    label: "CA Region Candidates",
    description: "Search one saved-world atlas using a bounded CA intent record.",
    access: "read",
    inputSchema: inputSchema({
      atlasId: { type: "string" },
      intentId: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 16 },
    }, ["atlasId", "intentId"]),
    compile: (payload, connector) => ({
      method: "READ",
      path: "region-candidates",
      fields: {
        atlasId: payload.atlasId,
        intentId: payload.intentId,
        limit: payload.limit ?? 8,
      },
      arguments: [
        "search",
        "--atlas", caAtlasDirectory(connector, payload.atlasId),
        "--intent", caIntentPath(connector, payload.intentId),
        "--limit", String(payload.limit ?? 8),
      ],
    }),
  },
  {
    id: "cao.region.compose",
    label: "CA Regional Composition",
    description: "Compose one connected CA region as an unapplied project draft.",
    access: "read",
    inputSchema: inputSchema({
      atlasId: { type: "string" },
      rootTileId: NONNEGATIVE_INTEGER,
      extent: { type: "integer", enum: [4, 6, 8, 10, 12] },
      orientation: { type: "integer", minimum: 0, maximum: 5 },
      arrivalTileId: NONNEGATIVE_INTEGER,
      localMapSize: POSITIVE_INTEGER,
    }, ["atlasId", "rootTileId", "extent"]),
    compile: (payload, connector) => ({
      method: "DRAFT",
      path: "regional-composition",
      fields: compactFields({
        atlasId: payload.atlasId,
        rootTileId: payload.rootTileId,
        extent: payload.extent,
        orientation: payload.orientation ?? 0,
        arrivalTileId: payload.arrivalTileId,
        localMapSize: payload.localMapSize,
      }),
      arguments: compactArguments([
        "compose",
        "--atlas", caAtlasDirectory(connector, payload.atlasId),
        "--root", String(payload.rootTileId),
        "--extent", String(payload.extent),
        "--orientation", String(payload.orientation ?? 0),
        payload.arrivalTileId === undefined ? null : "--arrival",
        payload.arrivalTileId === undefined ? null : String(payload.arrivalTileId),
        payload.localMapSize === undefined ? null : "--map-size",
        payload.localMapSize === undefined ? null : String(payload.localMapSize),
      ]),
    }),
  },
]);

export const GITLAB_V4_ADAPTER = defineIntegrationAdapter({
  id: "gitlab-v4",
  label: "GitLab API v4",
  upstream: "gitlab",
  transport: "cli-json",
  auth: "host-managed",
  executable: {
    name: "glab",
    acceptedNames: ["glab", "glab.exe", "glab-real", "glab-real.exe"],
  },
  allowedEnvKeys: [
    "APPDATA",
    "HOME",
    "LANG",
    "LC_ALL",
    "LOCALAPPDATA",
    "SystemRoot",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "WINDIR",
    "XDG_CONFIG_HOME",
  ],
  buildArguments: commandArguments,
  capabilities: GITLAB_CAPABILITIES,
  provenance: { source: "mousecat", version: "1" },
});

export const COLONIST_AWARENESS_WORLD_AUTHORING_ADAPTER = defineIntegrationAdapter({
  id: "colonist-awareness-world-authoring-v1",
  label: "Colonist Awareness Offline World Authoring",
  upstream: "colonist-awareness",
  transport: "cli-json",
  auth: "none",
  executable: {
    name: "CAOfflineWorldAuthoring",
    acceptedNames: [
      "caofflineworldauthoring",
      "caofflineworldauthoring.exe",
    ],
  },
  allowedEnvKeys: [
    "DOTNET_ROOT",
    "SystemRoot",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "WINDIR",
  ],
  buildArguments: (_connector, request) => request.arguments,
  capabilities: CA_WORLD_AUTHORING_CAPABILITIES,
  provenance: { source: "colonist-awareness", version: "b14" },
});

const SOURCE_INTEGRATION_REGISTRY = createIntegrationAdapterRegistry([
  GITLAB_V4_ADAPTER,
  COLONIST_AWARENESS_WORLD_AUTHORING_ADAPTER,
]);

function compactFields(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function compactArguments(args) {
  return args.filter((value) => value !== null && value !== undefined);
}

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw integrationError("integration-argument-required", field);
  return value.trim();
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) throw integrationError("integration-positive-integer-required", field);
  return value;
}

function projectRef(payload, connector) {
  const value = payload.project ?? connector.defaultProject;
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) {
    throw integrationError("integration-project-required", "project");
  }
  return encodeURIComponent(String(value).trim());
}

function requireConfirmation(payload) {
  if (payload.confirm !== true) throw integrationError("integration-confirmation-required", "confirm");
}

function caIdentifier(value, field) {
  const normalized = requiredText(value, field).toLowerCase();
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u.test(normalized)) {
    throw integrationError("integration-project-identifier-invalid", field);
  }
  return normalized;
}

function caRoot(connector, field) {
  const root = requiredText(connector?.[field], field);
  if (!isAbsolute(root)) {
    throw integrationError("integration-project-root-absolute-required", field);
  }
  return resolve(root);
}

function caChildPath(root, id, suffix, field) {
  const child = resolve(root, `${caIdentifier(id, field)}${suffix}`);
  const pathFromRoot = relative(root, child);
  if (!pathFromRoot || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw integrationError("integration-project-path-rejected", field);
  }
  return child;
}

function caAtlasDirectory(connector, atlasId) {
  return caChildPath(caRoot(connector, "atlasRoot"), atlasId, "", "atlasId");
}

function caIntentPath(connector, intentId) {
  return caChildPath(caRoot(connector, "intentRoot"), intentId, ".json", "intentId");
}

function integrationError(code, field = null) {
  const error = new Error(code);
  error.code = code;
  error.field = field;
  return error;
}

export function integrationAdapter(adapterRef, registry = SOURCE_INTEGRATION_REGISTRY) {
  return registry.get(adapterRef);
}

export function integrationAdapterManifest(adapterRef, registry = SOURCE_INTEGRATION_REGISTRY) {
  const adapter = integrationAdapter(adapterRef, registry);
  return adapter ? publicIntegrationManifest(adapter) : null;
}

export function integrationAdapterManifests(registry = SOURCE_INTEGRATION_REGISTRY) {
  return registry.manifests();
}

export function integrationAdapterTools(adapterRef, registry = SOURCE_INTEGRATION_REGISTRY) {
  return registry.tools(adapterRef);
}

export function sourceIntegrationAdapterRegistry() {
  return SOURCE_INTEGRATION_REGISTRY;
}

function commandArguments(connector, request) {
  const args = ["api"];
  if (connector.hostname) args.push("--hostname", String(connector.hostname));
  args.push(request.path, "--method", request.method);
  for (const [key, value] of Object.entries(request.fields)) {
    args.push("--raw-field", `${key}=${typeof value === "boolean" ? String(value) : value}`);
  }
  return args;
}
