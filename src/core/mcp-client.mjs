import { spawn } from "node:child_process";

import { packageVersion } from "./governance/version.mjs";
import readline from "node:readline";

function safeError(error) {
  return {
    name: error?.name || "Error",
    message: error?.message || String(error),
  };
}

function normalizeJsonRpcError(error, stderr) {
  const message = String(error?.message || "");
  const dataCode = typeof error?.data?.code === "string" ? error.data.code : null;
  const staleCode = dataCode === "MCP_RUNTIME_STALE" || message.includes("MCP_RUNTIME_STALE")
    ? "MCP_RUNTIME_STALE"
    : null;

  if (staleCode) {
    return {
      ok: false,
      code: "connector-runtime-stale",
      staleCode,
      restartRequired: true,
      message: "The upstream MCP runtime reported stale source. Restart that connector before retrying.",
      upstreamMessage: message || null,
      jsonrpcCode: error?.code ?? null,
      stderr: stderr.trim() || null,
    };
  }

  return {
    ok: false,
    code: "connector-jsonrpc-error",
    error,
    stderr: stderr.trim() || null,
  };
}

export async function callMcpStdio(connector, method, params = {}, options = {}) {
  if (!connector?.command) {
    return {
      ok: false,
      code: "connector-command-missing",
      message: "The connector has no stdio command configured.",
    };
  }

  const timeoutMs = Number(connector.timeoutMs || options.timeoutMs || 10000);
  const child = spawn(connector.command, connector.args || [], {
    cwd: connector.cwd || process.cwd(),
    env: { ...process.env, ...(connector.env || {}) },
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  let stderr = "";
  let settled = false;
  let nextId = 1;
  const initializeId = nextId++;
  const callId = nextId++;

  const cleanup = () => {
    settled = true;
    try {
      child.stdin.end();
    } catch {
      // best-effort shutdown
    }
    if (!child.killed) child.kill();
  };

  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (settled) return;
      cleanup();
      resolve({
        ok: false,
        code: "connector-timeout",
        message: `Timed out waiting for MCP response after ${timeoutMs}ms.`,
        stderr: stderr.trim() || null,
      });
    }, timeoutMs);

    const finish = (value) => {
      if (settled) return;
      clearTimeout(timer);
      cleanup();
      resolve(value);
    };

    child.on("error", (error) => {
      finish({
        ok: false,
        code: "connector-spawn-failed",
        error: safeError(error),
      });
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("exit", (code) => {
      if (settled) return;
      finish({
        ok: false,
        code: "connector-exited",
        exitCode: code,
        stderr: stderr.trim() || null,
      });
    });

    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.id !== callId) return;
      if (message.error) {
        finish(normalizeJsonRpcError(message.error, stderr));
        return;
      }
      finish({
        ok: true,
        result: message.result,
        stderr: stderr.trim() || null,
      });
    });

    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: initializeId,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", clientInfo: { name: "mousecat", version: packageVersion() } },
    })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: callId, method, params })}\n`);
  });
}

export function listMcpTools(connector) {
  return callMcpStdio(connector, "tools/list", {});
}

export function callMcpTool(connector, name, args = {}) {
  return callMcpStdio(connector, "tools/call", { name, arguments: args });
}

export function listMcpResources(connector) {
  return callMcpStdio(connector, "resources/list", {});
}

export function readMcpResource(connector, resource = {}) {
  return callMcpStdio(connector, "resources/read", resource);
}
