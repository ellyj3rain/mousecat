export const MOUSECAT_MCP_PROTOCOL_VERSION = "2025-06-18";

export class MousecatTransportError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "MousecatTransportError";
    Object.assign(this, details);
  }
}

export class MousecatRpcError extends Error {
  constructor(error, details = {}) {
    super(error?.message || "Mousecat JSON-RPC request failed");
    this.name = "MousecatRpcError";
    this.code = error?.code ?? null;
    this.data = error?.data;
    Object.assign(this, details);
  }
}

export class MousecatToolError extends Error {
  constructor(result, details = {}) {
    super(result?.code || result?.message || "Mousecat tool call failed");
    this.name = "MousecatToolError";
    this.result = result;
    this.code = result?.code || null;
    Object.assign(this, details);
  }
}

function projectWorkbenchCapability(value) {
  return {
    workbenchId: value?.workbenchId || value?.workbench?.workbenchId,
    workbenchToken: value?.workbenchToken,
  };
}

function normalizeEndpoint(value) {
  const endpoint = new URL(value || "http://127.0.0.1:4317/mcp");
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
    throw new TypeError("Mousecat endpoint must use http or https");
  }
  endpoint.pathname = endpoint.pathname.replace(/\/+$/u, "");
  if (!endpoint.pathname.endsWith("/mcp")) endpoint.pathname = `${endpoint.pathname}/mcp`;
  endpoint.search = "";
  endpoint.hash = "";
  return endpoint.toString();
}

function parseSseEvent(raw) {
  const data = raw
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function readSseResponse(response, expectedId) {
  if (!response.body?.getReader) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = buffer.split(/\r?\n\r?\n/u);
    buffer = events.pop() || "";
    for (const event of events) {
      const message = parseSseEvent(event);
      if (message?.id === expectedId) {
        await reader.cancel();
        return message;
      }
    }
    if (done) {
      const message = parseSseEvent(buffer);
      return message?.id === expectedId ? message : null;
    }
  }
}

async function readResponse(response, expectedId) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/event-stream")) return readSseResponse(response, expectedId);
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new MousecatTransportError("Mousecat returned non-JSON content", {
      status: response.status,
      body: text.slice(0, 512),
    });
  }
}

export class MousecatClient {
  #endpoint;
  #fetch;
  #protocolVersion;
  #clientInfo;
  #sessionId = null;
  #initializePromise = null;
  #requestId = 0;

  constructor(options = {}) {
    if (options.fetch !== undefined && typeof options.fetch !== "function") {
      throw new TypeError("options.fetch must be a function");
    }
    this.#endpoint = normalizeEndpoint(options.endpoint);
    this.#fetch = options.fetch || globalThis.fetch;
    if (typeof this.#fetch !== "function") {
      throw new TypeError("MousecatClient requires a fetch implementation");
    }
    this.#protocolVersion = options.protocolVersion || MOUSECAT_MCP_PROTOCOL_VERSION;
    this.#clientInfo = {
      name: options.clientInfo?.name || "mousecat-sdk",
      version: options.clientInfo?.version || "0.1.0",
    };
  }

  get endpoint() {
    return this.#endpoint;
  }

  get sessionId() {
    return this.#sessionId;
  }

  async #post(payload, options = {}) {
    let response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": this.#protocolVersion,
          ...(options.sessionId ? {
            "mcp-session-id": options.sessionId,
            "mcp-protocol-version": this.#protocolVersion,
          } : {}),
        },
        body: JSON.stringify(payload),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (cause) {
      throw new MousecatTransportError("Mousecat request could not reach the service", { cause });
    }
    const body = await readResponse(response, payload.id);
    if (!response.ok) {
      if (response.status === 404 && options.sessionId === this.#sessionId) this.#sessionId = null;
      throw new MousecatTransportError(`Mousecat HTTP request failed with ${response.status}`, {
        status: response.status,
        body,
      });
    }
    if (body?.error) throw new MousecatRpcError(body.error, { requestId: payload.id });
    if (payload.id !== undefined && (body?.jsonrpc !== "2.0" || body?.id !== payload.id)) {
      throw new MousecatTransportError("Mousecat returned an uncorrelated JSON-RPC response", {
        status: response.status,
        expectedId: payload.id,
        actualId: body?.id ?? null,
      });
    }
    return { response, body };
  }

  async initialize(options = {}) {
    if (this.#sessionId) return this.describeSession();
    if (!this.#initializePromise) {
      this.#initializePromise = (async () => {
        const id = ++this.#requestId;
        const { response, body } = await this.#post({
          jsonrpc: "2.0",
          id,
          method: "initialize",
          params: {
            protocolVersion: this.#protocolVersion,
            clientInfo: this.#clientInfo,
            capabilities: {},
          },
        }, options);
        const sessionId = response.headers.get("mcp-session-id");
        if (!sessionId) {
          throw new MousecatTransportError("Mousecat did not issue an MCP session id");
        }
        if (body?.result?.protocolVersion !== this.#protocolVersion) {
          throw new MousecatTransportError("Mousecat negotiated an unexpected protocol version", {
            expected: this.#protocolVersion,
            actual: body?.result?.protocolVersion || null,
          });
        }
        this.#sessionId = sessionId;
        try {
          await this.#post({
            jsonrpc: "2.0",
            method: "notifications/initialized",
          }, { sessionId });
        } catch (error) {
          this.#sessionId = null;
          throw error;
        }
        return this.describeSession(body.result);
      })().finally(() => {
        this.#initializePromise = null;
      });
    }
    return this.#initializePromise;
  }

  describeSession(initializeResult = null) {
    return {
      schema: "mousecat.sdk-session/1",
      endpoint: this.#endpoint,
      sessionId: this.#sessionId,
      protocolVersion: this.#protocolVersion,
      ...(initializeResult ? {
        serverInfo: initializeResult.serverInfo,
        capabilities: initializeResult.capabilities,
      } : {}),
    };
  }

  async callTool(name, args = {}, options = {}) {
    if (typeof name !== "string" || !name.trim()) throw new TypeError("Mousecat tool name is required");
    await this.initialize(options);
    const id = ++this.#requestId;
    const { body } = await this.#post({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    }, { sessionId: this.#sessionId, signal: options.signal });
    const result = body?.result;
    const structuredContent = result?.structuredContent;
    if (result?.isError || structuredContent?.schema === "mousecat.error/1" || structuredContent?.ok === false) {
      throw new MousecatToolError(structuredContent, { tool: name, requestId: id, mcpResult: result });
    }
    if (!structuredContent || typeof structuredContent !== "object") {
      throw new MousecatTransportError("Mousecat tool response omitted structured content", {
        tool: name,
        requestId: id,
        mcpResult: result,
      });
    }
    return structuredContent;
  }

  heartbeat(sessionId, facts = {}, options = {}) {
    return this.callTool("mousecat.session", { action: "heartbeat", sessionId, facts }, options);
  }

  registerFramework(registration, options = {}) {
    return this.callTool("mousecat.registry", { action: "register", ...registration }, options);
  }

  registerProjectAdapter(registration, options = {}) {
    return this.callTool("mousecat.registry", {
      action: "register-project-adapter",
      ...registration,
    }, options);
  }

  openProjectWorkbench(request, options = {}) {
    return this.callTool("mousecat.workbench", {
      ...request,
      action: "open",
    }, options);
  }

  snapshotProjectWorkbench(workbench, options = {}) {
    const capability = projectWorkbenchCapability(workbench);
    return this.callTool("mousecat.workbench", {
      ...capability,
      action: "snapshot",
    }, options);
  }

  operateProjectWorkbench(workbench, operation, options = {}) {
    const capability = projectWorkbenchCapability(workbench);
    return this.callTool("mousecat.workbench", {
      ...operation,
      ...capability,
      action: "operate",
    }, options);
  }

  closeProjectWorkbench(workbench, options = {}) {
    const capability = projectWorkbenchCapability(workbench);
    return this.callTool("mousecat.workbench", {
      ...capability,
      action: "close",
    }, options);
  }

  invokeSkill(invocation, options = {}) {
    return this.callTool("mousecat.skill", { action: "invoke", ...invocation }, options);
  }

  awaitSkill(invocationOrContinuation, options = {}) {
    const invocation = invocationOrContinuation?.schema === "mousecat.framework-handoff/1"
      ? invocationOrContinuation.result
      : invocationOrContinuation;
    const continuation = invocation?.continuation?.arguments || invocation;
    if (!continuation?.interactionId || !continuation?.continuationToken) {
      throw new TypeError("A skill continuation with interactionId and continuationToken is required");
    }
    return this.callTool("mousecat.skill", {
      ...continuation,
      action: "await",
      ...(options.waitMs === undefined ? {} : { waitMs: options.waitMs }),
    }, options);
  }

  handoffSkill(handoff, options = {}) {
    return this.callTool("mousecat.skill", { action: "handoff", ...handoff }, options);
  }

  async close(options = {}) {
    if (!this.#sessionId) return false;
    const sessionId = this.#sessionId;
    this.#sessionId = null;
    let response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: "DELETE",
        headers: {
          "mcp-session-id": sessionId,
          "mcp-protocol-version": this.#protocolVersion,
        },
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (cause) {
      throw new MousecatTransportError("Mousecat session close could not reach the service", { cause });
    }
    if (!response.ok && response.status !== 404) {
      throw new MousecatTransportError(`Mousecat session close failed with ${response.status}`, {
        status: response.status,
        body: await readResponse(response),
      });
    }
    return true;
  }
}

export function createMousecatClient(options = {}) {
  return new MousecatClient(options);
}
