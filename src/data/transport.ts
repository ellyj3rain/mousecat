/* ============================================================================
   Data transport — the swappable egress to pb-core (DR-006).

   Two implementations, one interface:
     - electronTransport: used when running inside the packaged Electron shell.
       The renderer never touches the loopback port directly; it asks the main
       process (window.mmc, exposed by electron/preload.cjs) which performs the
       privileged fetch/SSE. Chromium webSecurity stays ON.
     - webTransport: used on the dev browser origin. Fetches RELATIVE /v1/* paths
       so the Vite dev-server proxy reaches pb-core same-origin (no file:// CORS),
       which also makes the surface browser-drivable for verification.

   The connection state machine (connection.ts) sits ABOVE this and owns the
   SAMPLE/LIVE + conn honesty state, identically in both modes.
   ============================================================================ */
import type { StatusDoc } from "../types/status";
import type { EngineBridge } from "./engineApi";

export interface StreamHandlers {
  onDoc: (doc: StatusDoc) => void;
  onOpen: () => void;
  onError: (err: Error) => void;
}

export interface Transport {
  readonly kind: "electron" | "web";
  /** One-shot fetch of /v1/status. Rejects on timeout / non-2xx / network error. */
  fetchStatus(timeoutMs: number): Promise<StatusDoc>;
  /** Open the SSE stream. Returns a disposer that closes it. */
  openStream(handlers: StreamHandlers): () => void;
}

/* ---- The Electron main-process bridge (preload-exposed). ---- */
export interface MMCBridge {
  workspace?(): Promise<import("./workspace").WorkspaceDoc>;
  fetchStatus(): Promise<{ ok: boolean; doc?: StatusDoc; error?: string }>;
  /** Subscribe to pushed status docs from main. Returns an unsubscribe fn. */
  subscribeStatus(cb: (doc: StatusDoc) => void): () => void;
  /** Subscribe to connection-open / error signals from main. */
  subscribeConn(cb: (ev: { open: boolean; error?: string }) => void): () => void;
  readonly platform: string;
  /** The gated engine (acting half + deep reads), main-process hosted. */
  engine?: EngineBridge;
}

declare global {
  interface Window {
    mmc?: MMCBridge;
  }
}

const electronTransport = (bridge: MMCBridge): Transport => ({
  kind: "electron",
  async fetchStatus(_timeoutMs: number): Promise<StatusDoc> {
    const r = await bridge.fetchStatus();
    if (!r.ok || !r.doc) throw new Error(r.error || "main-process fetch failed");
    return r.doc;
  },
  openStream(handlers: StreamHandlers): () => void {
    const offDoc = bridge.subscribeStatus((doc) => handlers.onDoc(doc));
    const offConn = bridge.subscribeConn((ev) => {
      if (ev.open) handlers.onOpen();
      else handlers.onError(new Error(ev.error || "stream closed"));
    });
    return () => {
      offDoc();
      offConn();
    };
  },
});

const webTransport = (): Transport => ({
  kind: "web",
  async fetchStatus(timeoutMs: number): Promise<StatusDoc> {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch("/v1/status", {
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (!res.ok) throw new Error("status " + res.status);
      return (await res.json()) as StatusDoc;
    } finally {
      clearTimeout(to);
    }
  },
  openStream(handlers: StreamHandlers): () => void {
    if (typeof EventSource === "undefined") {
      handlers.onError(new Error("EventSource unavailable"));
      return () => {};
    }
    const es = new EventSource("/v1/stream");
    es.onopen = () => handlers.onOpen();
    es.onmessage = (ev) => {
      try {
        handlers.onDoc(JSON.parse(ev.data) as StatusDoc);
      } catch {
        /* ignore malformed frame; the doc-level guard handles partials */
      }
    };
    es.onerror = () => handlers.onError(new Error("stream error"));
    return () => es.close();
  },
});

/** Pick the transport for the current runtime. */
export function pickTransport(): Transport {
  if (typeof window !== "undefined" && window.mmc) {
    return electronTransport(window.mmc);
  }
  return webTransport();
}
