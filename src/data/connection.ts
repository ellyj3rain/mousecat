/* ============================================================================
   Fleet connection — the SAMPLE/LIVE + conn state machine (framework-agnostic).

   Faithful port of the prototype's data layer (bootData / fetchStatusOnce /
   openStream / scheduleReconnect / startPoll / setConn / ingest), lifted above the
   swappable transport. Stream is primary, poll is the heartbeat/fallback. On a cold
   failure it falls back to the embedded sample and keeps trying, auto-upgrading to
   LIVE the moment pb-core answers.

   HONESTY INVARIANT: source (live|sample) and conn (live|connecting|reconnecting|
   offline) are always truthful and surfaced; reconnect/offline are never hidden.

   RESILIENCE INVARIANT: a malformed or partial document never blanks the board.
   normalizeDoc() shape-guards and defaults optional arrays; an ingest that fails the
   guard is dropped, retaining the last good snapshot.
   ============================================================================ */
import type {
  StatusDoc,
  FleetSnapshot,
  DataSource,
  ConnState,
  ProjectEntry,
  ProjectDrift,
  LossRisk,
} from "../types/status";
import { pickTransport, type Transport } from "./transport";

const POLL_MS = 20000;
const RECONNECT_MS = 4000;
const FETCH_TIMEOUT_MS = 5000;

const LOSS_RISKS = new Set<LossRisk>(["none", "no-remote", "dirty-heavy", "zero-commit", "not-git", "unknown"]);

/** Coerce ONE project entry into a shape the model can read without throwing, or
    drop it (return null). The model reads p.remotes.length / p.remotes.join /
    LOSS[p.lossRisk] unguarded, so a partial project must be made safe here. */
function coerceProject(p: unknown): ProjectEntry | null {
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  const isRepo = !!o.isRepo;
  return {
    ...o,
    id: o.id,
    path: typeof o.path === "string" ? o.path : "",
    isRepo,
    branch: typeof o.branch === "string" ? o.branch : null,
    dirty: typeof o.dirty === "number" ? o.dirty : null,
    ahead: typeof o.ahead === "number" ? o.ahead : null,
    behind: typeof o.behind === "number" ? o.behind : null,
    lastCommit: typeof o.lastCommit === "string" ? o.lastCommit : null,
    remotes: Array.isArray(o.remotes) && o.remotes.every(value => typeof value === "string") ? (o.remotes as string[]) : null,
    lossRisk: LOSS_RISKS.has(o.lossRisk as LossRisk) ? (o.lossRisk as LossRisk) : isRepo ? "unknown" : "not-git",
    drift: o.drift && typeof o.drift === "object" ? (o.drift as ProjectDrift) : null,
  } as ProjectEntry;
}

/** Shape-guard + default optional fields, INCLUDING each project entry (so one
    malformed project never reaches a throwing render path). Returns null only if
    the whole doc is unusable, retaining the last-good snapshot. */
export function normalizeDoc(doc: unknown): StatusDoc | null {
  if (!doc || typeof doc !== "object") return null;
  const d = doc as Record<string, unknown>;
  if (!Array.isArray(d.projects)) return null;
  d.projects = (d.projects as unknown[]).map(coerceProject).filter(Boolean) as ProjectEntry[];
  d.layout = Array.isArray(d.layout) ? d.layout : [];
  d.services = Array.isArray(d.services) ? d.services : [];
  d.toolchains = Array.isArray(d.toolchains) ? d.toolchains : [];
  d.envOverrides = Array.isArray(d.envOverrides) ? d.envOverrides : [];
  d.secrets = Array.isArray(d.secrets) ? d.secrets : [];
  d.families = Array.isArray(d.families) ? d.families : [];
  d.warnings = Array.isArray(d.warnings) ? d.warnings : [];
  d.governance = d.governance && typeof d.governance === "object" ? d.governance : { latestBatch: null, latestDR: null, worktrees: [] };
  return d as unknown as StatusDoc;
}

type Listener = (snap: FleetSnapshot) => void;

export class FleetConnection {
  private transport: Transport;
  private sample: StatusDoc;
  private listeners = new Set<Listener>();

  private doc: StatusDoc;
  private source: DataSource = "sample";
  private conn: ConnState = "connecting";
  private receivedAt = 0;
  private error: string | null = null;

  private disposeStream: (() => void) | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private forcedSample = false;

  // cached snapshot — referentially stable between emits (useSyncExternalStore)
  private snap: FleetSnapshot;

  constructor(sample: StatusDoc, transport: Transport = pickTransport()) {
    this.transport = transport;
    this.sample = sample;
    this.doc = sample;
    this.snap = {
      doc: this.doc,
      source: this.source,
      conn: this.conn,
      receivedAt: this.receivedAt,
      error: this.error,
    };
  }

  // -- subscription (for useSyncExternalStore) --------------------------------
  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = (): FleetSnapshot => this.snap;

  private emit() {
    this.snap = {
      doc: this.doc,
      source: this.source,
      conn: this.conn,
      receivedAt: this.receivedAt,
      error: this.error,
    };
    for (const l of this.listeners) l(this.snap);
  }

  private ingest(raw: unknown, source: DataSource) {
    const doc = normalizeDoc(raw);
    if (!doc) return; // keep last good snapshot — never blank the board
    this.doc = doc;
    this.source = source;
    this.receivedAt = Date.now();
    if (source === "live") this.error = null;
    this.emit();
  }

  private setConn(state: ConnState) {
    if (this.conn !== state) {
      this.conn = state;
      this.emit();
    }
  }

  // -- lifecycle --------------------------------------------------------------
  async start(forcedSample = false) {
    if (this.started) return;
    this.started = true;
    this.forcedSample = forcedSample;

    if (forcedSample) {
      this.ingest(structuredClone(this.sample), "sample");
      this.setConn("offline");
      return;
    }

    const ok = await this.fetchOnce();
    if (ok) {
      this.setConn("live");
      this.openStream();
      this.startPoll();
    } else {
      this.ingest(structuredClone(this.sample), "sample");
      this.setConn("offline");
      this.startPoll();
      this.scheduleReconnect();
    }
  }

  stop() {
    this.started = false;
    this.disposeStream?.();
    this.disposeStream = null;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pollTimer = null;
    this.reconnectTimer = null;
  }

  /** Toggle the operator's explicit sample/live preference at runtime. */
  async setForcedSample(forced: boolean) {
    if (forced === this.forcedSample && this.started) return;
    this.stop();
    this.started = false;
    await this.start(forced);
  }

  private async fetchOnce(): Promise<boolean> {
    try {
      const doc = await this.transport.fetchStatus(FETCH_TIMEOUT_MS);
      this.ingest(doc, "live");
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  private openStream() {
    this.disposeStream?.();
    this.disposeStream = this.transport.openStream({
      onOpen: () => this.setConn("live"),
      onDoc: (doc) => {
        this.ingest(doc, "live");
        this.setConn("live");
      },
      onError: (err) => {
        this.error = err.message;
        this.disposeStream?.();
        this.disposeStream = null;
        this.setConn(this.source === "live" ? "reconnecting" : "offline");
        this.scheduleReconnect();
      },
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.setConn("reconnecting");
      const ok = await this.fetchOnce();
      if (ok) {
        this.setConn("live");
        this.openStream();
      } else {
        this.setConn("offline");
        this.scheduleReconnect();
      }
    }, RECONNECT_MS);
  }

  private startPoll() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(async () => {
      const ok = await this.fetchOnce();
      if (ok && !this.disposeStream) this.openStream();
      if (!ok && this.source === "live") this.setConn("reconnecting");
    }, POLL_MS);
  }
}
