import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";

import { sourceIntegrationAdapterRegistry } from "./integration-adapters.mjs";

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const TERMINATION_GRACE_MS = 1000;
const SECRET_KEY_PATTERN = /(?:password|secret|token|api[_-]?key|authorization)/iu;
const SECRET_VALUE_PATTERN = /(?:glpat-|Bearer\s+)[A-Za-z0-9._-]+/iu;

function integrationError(code, field = null) {
  const error = new Error(code);
  error.code = code;
  error.field = field;
  return error;
}

function hasSecretMaterial(value) {
  if (typeof value === "string") return SECRET_VALUE_PATTERN.test(value);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => SECRET_KEY_PATTERN.test(key) || hasSecretMaterial(child));
}

function redactSecretMaterial(value) {
  if (typeof value === "string") {
    return value.replace(new RegExp(SECRET_VALUE_PATTERN.source, "giu"), "[credential-redacted]");
  }
  if (Array.isArray(value)) return value.map(redactSecretMaterial);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    SECRET_KEY_PATTERN.test(key) ? "[credential-redacted]" : redactSecretMaterial(child),
  ]));
}

function validateSchema(value, schema, path = "payload") {
  if (!schema || typeof schema !== "object") return;
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    throw integrationError("integration-payload-invalid", path);
  }
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw integrationError("integration-payload-invalid", path);
    const properties = schema.properties || {};
    for (const required of schema.required || []) {
      if (value[required] === undefined) throw integrationError("integration-payload-invalid", `${path}.${required}`);
    }
    if (schema.additionalProperties === false) {
      const unknown = Object.keys(value).find((key) => !Object.hasOwn(properties, key));
      if (unknown) throw integrationError("integration-payload-invalid", `${path}.${unknown}`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (properties[key]) validateSchema(child, properties[key], `${path}.${key}`);
    }
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) throw integrationError("integration-payload-invalid", path);
    value.forEach((child, index) => validateSchema(child, schema.items, `${path}.${index}`));
    return;
  }
  if (schema.type === "integer" && !Number.isInteger(value)) throw integrationError("integration-payload-invalid", path);
  if (schema.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) throw integrationError("integration-payload-invalid", path);
  if (schema.type === "string" && typeof value !== "string") throw integrationError("integration-payload-invalid", path);
  if (schema.type === "boolean" && typeof value !== "boolean") throw integrationError("integration-payload-invalid", path);
  if (typeof value === "number" && (schema.minimum !== undefined && value < schema.minimum || schema.maximum !== undefined && value > schema.maximum)) {
    throw integrationError("integration-payload-invalid", path);
  }
}

function failureOutcome(capability, dispatched = true) {
  if (!dispatched) return "not-dispatched";
  return capability.access === "read" ? "not-observed" : "unknown";
}

function safeMessage(value) {
  return String(value || "")
    .replace(/(?:glpat-|Bearer\s+)[A-Za-z0-9._-]+/giu, "[credential-redacted]")
    .replace(/(["']?(?:password|secret|token|api[_-]?key|authorization)["']?\s*[:=]\s*)["']?[^,\s"'}]+/giu, "$1[credential-redacted]")
    .slice(0, 1000)
    .trim() || null;
}

async function pinnedExecutable(adapter, connector) {
  const executablePath = String(connector.executablePath || "");
  const expectedDigest = String(connector.executableSha256 || "").toLowerCase();
  if (!isAbsolute(executablePath)) throw integrationError("integration-executable-absolute-path-required", "executablePath");
  if (!adapter.executable.acceptedNames.includes(basename(executablePath).toLowerCase())) {
    throw integrationError("integration-executable-invalid", "executablePath");
  }
  if (!/^[a-f0-9]{64}$/u.test(expectedDigest)) {
    throw integrationError("integration-executable-digest-required", "executableSha256");
  }
  let actualDigest;
  try {
    actualDigest = createHash("sha256").update(await readFile(executablePath)).digest("hex");
  } catch {
    throw integrationError("integration-executable-unreadable", "executablePath");
  }
  if (actualDigest !== expectedDigest) throw integrationError("integration-executable-digest-mismatch", "executableSha256");
  return executablePath;
}

function executionEnvironment(adapter, connector) {
  const allowed = new Set(adapter.allowedEnvKeys);
  const env = {};
  for (const key of allowed) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(connector.env || {})) {
    if (!allowed.has(key)) throw integrationError("integration-environment-key-rejected", key);
    if (typeof value !== "string") throw integrationError("integration-environment-value-invalid", key);
    env[key] = value;
  }
  return env;
}

function defaultCommandRunner(executable, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      env: options.env || {},
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let exceeded = false;
    let timedOut = false;
    let spawned = false;
    let settled = false;
    let timer = null;
    let forceTimer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      resolve(result);
    };
    const result = (code = null, error = null) => ({
      code,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: error?.message || Buffer.concat(stderr).toString("utf8"),
      error,
      exceeded,
      timedOut,
      dispatched: spawned,
    });
    const terminate = () => {
      if (settled) return;
      child.kill();
      forceTimer = setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
        finish(result());
      }, TERMINATION_GRACE_MS);
    };
    const collect = (target) => (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        exceeded = true;
        terminate();
        return;
      }
      target.push(chunk);
    };
    child.once("spawn", () => {
      spawned = true;
    });
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.on("error", (error) => finish(result(null, error)));
    timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, options.timeoutMs || 10000);
    child.on("close", (code) => finish(result(code)));
  });
}

export async function invokeIntegrationAdapter(connector, capabilityId, payload = {}, options = {}) {
  const registry = options.registry || sourceIntegrationAdapterRegistry();
  const adapter = registry.get(connector?.adapter);
  if (!adapter) return { ok: false, code: "integration-adapter-unknown", adapterRef: connector?.adapter || null };
  const capability = adapter.capabilities.find((candidate) => candidate.id === capabilityId);
  if (!capability) {
    return {
      ok: false,
      code: "integration-capability-unknown",
      adapterRef: adapter.id,
      capability: capabilityId,
      availableCapabilities: adapter.capabilities.map((candidate) => candidate.id),
    };
  }
  if (hasSecretMaterial(connector?.env)) {
    return { ok: false, code: "integration-config-secret-values-rejected", adapterRef: adapter.id, capability: capability.id };
  }
  if (hasSecretMaterial(payload)) {
    return { ok: false, code: "integration-secret-values-rejected", adapterRef: adapter.id, capability: capability.id };
  }
  let request;
  let executable;
  let env;
  let args;
  try {
    if (capability.access !== "read" && payload?.confirm !== true) {
      throw integrationError("integration-confirmation-required", "confirm");
    }
    validateSchema(payload, capability.inputSchema);
    request = capability.compile(payload, connector);
    executable = await pinnedExecutable(adapter, connector);
    env = executionEnvironment(adapter, connector);
    args = adapter.buildArguments(connector, request);
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
      throw integrationError("integration-arguments-invalid", "arguments");
    }
  } catch (error) {
    return { ok: false, code: error.code || "integration-arguments-invalid", field: error.field || null, outcome: "not-dispatched", adapterRef: adapter.id, capability: capability.id };
  }
  const runner = options.commandRunner || defaultCommandRunner;
  let executed;
  try {
    executed = await runner(executable, args, {
      timeoutMs: options.timeoutMs || connector.timeoutMs || 10000,
      env,
      shell: false,
    });
  } catch (error) {
    return {
      ok: false,
      code: "integration-command-failed",
      outcome: failureOutcome(capability),
      exitCode: null,
      message: safeMessage(error?.message),
      adapterRef: adapter.id,
      capability: capability.id,
    };
  }
  if (!executed || typeof executed !== "object") {
    return { ok: false, code: "integration-command-failed", outcome: failureOutcome(capability), exitCode: null, message: null, adapterRef: adapter.id, capability: capability.id };
  }
  if (executed.error) {
    return {
      ok: false,
      code: "integration-command-failed",
      outcome: failureOutcome(capability, executed.dispatched === true),
      exitCode: null,
      message: safeMessage(executed.stderr),
      adapterRef: adapter.id,
      capability: capability.id,
    };
  }
  if (executed.timedOut) {
    return { ok: false, code: "integration-timeout", outcome: failureOutcome(capability), adapterRef: adapter.id, capability: capability.id };
  }
  if (executed.exceeded) {
    return { ok: false, code: "integration-output-limit", outcome: failureOutcome(capability), adapterRef: adapter.id, capability: capability.id };
  }
  if (executed.code !== 0) {
    return {
      ok: false,
      code: "integration-command-failed",
      outcome: failureOutcome(capability),
      exitCode: executed.code,
      message: safeMessage(executed.stderr),
      adapterRef: adapter.id,
      capability: capability.id,
    };
  }
  let result;
  try {
    result = JSON.parse(executed.stdout);
    if (result === null || typeof result !== "object") throw new TypeError("integration result must be an object or array");
  } catch {
    return { ok: false, code: "integration-invalid-json", outcome: failureOutcome(capability), adapterRef: adapter.id, capability: capability.id };
  }
  return {
    ok: true,
    schema: "mousecat.integration-result/1",
    adapterRef: adapter.id,
    upstream: adapter.upstream,
    capability: capability.id,
    access: capability.access,
    request: { method: request.method, path: request.path, fieldNames: Object.keys(request.fields) },
    result: redactSecretMaterial(result),
  };
}
