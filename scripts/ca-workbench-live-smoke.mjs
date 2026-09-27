#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { defaultConfig } from "../src/core/config.mjs";
import { createMousecatRuntime } from "../src/core/runtime.mjs";

function fail(message) {
  throw new Error(message);
}

function argumentsMap(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key.startsWith("--") || index + 1 >= values.length) {
      fail(`Expected --name value, received ${key}`);
    }
    result.set(key.slice(2), values[index += 1]);
  }
  return result;
}

function required(args, key) {
  const value = args.get(key);
  if (!value) fail(`Missing --${key}`);
  return value;
}

function integer(args, key, fallback = null) {
  const raw = args.get(key);
  if (raw === undefined && fallback !== null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) fail(`--${key} must be an integer`);
  return value;
}

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function requireResult(value, operation) {
  if (!value?.ok) fail(`${operation} failed: ${value?.code || "unknown"}`);
  return value;
}

function connectorValue(value) {
  let current = value;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== "object") break;
    if ([
      "mousecat.invoke/1",
      "mousecat.connector.invoke/1",
      "mousecat.integration-result/1",
    ].includes(current.schema)) {
      current = current.result;
      continue;
    }
    break;
  }
  return current;
}

const args = argumentsMap(process.argv.slice(2));
const executablePath = resolve(required(args, "executable"));
const atlasRoot = resolve(required(args, "atlas-root"));
const atlasId = required(args, "atlas-id").trim().toLowerCase();
const rootTileId = integer(args, "root-tile");
const extent = integer(args, "extent", 12);
const orientation = integer(args, "orientation", 0);
const arrivalTileId = integer(args, "arrival", rootTileId);
const localMapSize = integer(args, "map-size", 350);
const manifestPath = join(atlasRoot, atlasId, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const sourceDigest = String(manifest.sourceSaveSha256 || "").toLowerCase();
if (!/^[a-f0-9]{64}$/u.test(sourceDigest)) {
  fail(`Atlas ${atlasId} has no valid source save digest`);
}

const temporary = mkdtempSync(join(tmpdir(), "mousecat-ca-workbench-"));
try {
  const intentRoot = join(temporary, "intents");
  const statePath = join(temporary, "state.json");
  const intentId = "live-smoke";
  await import("node:fs/promises").then(({ mkdir }) => mkdir(intentRoot, {
    recursive: true,
  }));
  writeFileSync(join(intentRoot, `${intentId}.json`), JSON.stringify({
    rootTileIds: [rootTileId],
    extent,
    orientation,
    localMapSize,
  }, null, 2));

  const base = defaultConfig();
  const config = {
    ...base,
    upstreams: {
      ...(base.upstreams || {}),
      "colonist-awareness": { enabled: true },
    },
    state: {
      enabled: true,
      path: statePath,
      maxEvents: 100,
      maxRoutePlans: 20,
    },
    connectors: {
      ...(base.connectors || {}),
      "colonist-awareness": {
        enabled: true,
        kind: "integration-adapter",
        transport: "cli-json",
        adapter: "colonist-awareness-world-authoring-v1",
        executablePath,
        executableSha256: digest(executablePath),
        atlasRoot,
        intentRoot,
        timeoutMs: 30_000,
      },
    },
  };
  const runtime = createMousecatRuntime({ config });
  const catalogInvocation = requireResult(await runtime.handleTool(
    "mousecat.invoke",
    {
      upstream: "colonist-awareness",
      capability: "cao.world-atlases.catalog",
      payload: {},
      permit: { profileId: "tool-invocation" },
    },
  ), "catalog");
  const catalog = connectorValue(catalogInvocation);
  const opened = requireResult(await runtime.handleTool("mousecat.workbench", {
    action: "open",
    workbenchId: "ca-live-smoke",
    adapterRef: "colonist-awareness.world-authoring",
    hostSessionRef: "mousecat:ca-live-smoke",
    operatorRef: "operator:local",
    intent: "Verify the real CA saved-world creator through Mousecat.",
    sourceVector: [{
      authority: "rimworld-save",
      sourceRevision: `sha256:${sourceDigest}`,
      observedAt: new Date().toISOString(),
      status: "current",
    }],
    subjectRefs: [`world:${manifest.worldIdentity}`],
    permit: { profileId: "operator-interaction" },
  }), "open");

  const operation = async (operationId, input, profileId) => requireResult(
    await runtime.handleTool("mousecat.workbench", {
      action: "operate",
      workbenchId: opened.workbench.workbenchId,
      workbenchToken: opened.workbenchToken,
      operationId,
      input,
      permit: { profileId },
    }),
    operationId,
  );

  const inspected = await operation("cao.area.inspect", {
    atlasId,
    tileId: rootTileId,
  }, "observer");
  const found = await operation("cao.region.find", {
    atlasId,
    intentId,
    limit: 4,
  }, "observer");
  const composed = await operation("cao.region.compose", {
    atlasId,
    rootTileId,
    extent,
    orientation,
    arrivalTileId,
    localMapSize,
  }, "operator-interaction");

  const recoveredRuntime = createMousecatRuntime({ config });
  const recovered = requireResult(await recoveredRuntime.handleTool(
    "mousecat.workbench",
    {
      action: "snapshot",
      workbenchId: opened.workbench.workbenchId,
      workbenchToken: opened.workbenchToken,
    },
  ), "restart snapshot");
  if (recovered.receipts.length !== 3) {
    fail(`Expected 3 world-bound receipts, received ${recovered.receipts.length}`);
  }

  process.stdout.write(`${JSON.stringify({
    schema: "mousecat.ca-workbench-live-smoke/1",
    ok: true,
    executable: {
      name: basename(executablePath),
      sha256: digest(executablePath),
    },
    source: {
      atlasId,
      worldIdentity: manifest.worldIdentity,
      sourceSaveSha256: sourceDigest,
    },
    operations: {
      catalogEntries: Array.isArray(catalog) ? catalog.length : 0,
      inspectedTileId: inspected.result?.tileId,
      candidates: Array.isArray(found.result) ? found.result.length : 0,
      composition: {
        rootTileId: composed.result?.rootTileId,
        requestedExtent: composed.result?.requestedExtent,
        realizedExtent: composed.result?.realizedExtent,
        arrivalTileId: composed.result?.arrivalTileId,
        evidenceSignature: composed.result?.atlasEvidenceSignature,
        evidenceComplete: composed.result?.compositionEvidenceComplete,
        stageReady: composed.result?.stageReady,
        blockers: composed.result?.stageBlockers || [],
      },
    },
    continuity: {
      recoveredAfterRestart: recovered.ok,
      receipts: recovered.receipts.length,
      currentRepresentationRef: recovered.workbench.currentRepresentationRef,
      capabilityStoredInPlaintext: readFileSync(statePath, "utf8")
        .includes(opened.workbenchToken),
    },
  }, null, 2)}\n`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
