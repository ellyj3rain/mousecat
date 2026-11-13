// Private receiving candidate. No live authority, transport or background poll is supplied.
// An owning host must establish the selected binding and verify each exact event.
const DATA_FIELDS = new Set(['projectRef','interactionId','itemId','workbenchId','adapterRef','operationId','receiptId','representationRef','ref','revision','role','outcome','code','status','actorRef','action']);
const LABELS = Object.freeze({
  assignment: 'Assignment recorded.', handoff: 'Handoff recorded.',
  dispatch: 'Dispatch reported.', execution: 'Execution reported.',
  acceptance: 'Acceptance reported.', status: 'Status reported.',
});
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const text = value => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 1024;
// Match the owning reader's accepted opaque cursor envelope; its parser remains
// the authority for the cursor's decoded version, project and event identity.
const cursorText = value => typeof value === 'string' && value.length > 0 && value.length <= 2048 && /^[A-Za-z0-9_-]+$/u.test(value);
const held = (reason, details = {}) => ({ status: 'held', reason, ...details });

function selected(authority) {
  const s = authority?.selection;
  if (!plain(s) || !['sourceId','sourceRevision','projectRef','recipientRef'].every(k => text(s[k]))) return null;
  return Object.freeze({ sourceId: s.sourceId, sourceRevision: s.sourceRevision, projectRef: s.projectRef, recipientRef: s.recipientRef });
}

function normalizeEvent(event, projectRef) {
  if (!plain(event) || !text(event.id) || !text(event.type) || !text(event.at) ||
      !Number.isFinite(Date.parse(event.at)) || event.projectRef !== projectRef || !plain(event.data)) return null;
  const data = {};
  for (const key of Object.keys(event.data).sort()) {
    if (!DATA_FIELDS.has(key) || typeof event.data[key] !== 'string' || event.data[key].length > 1024) return null;
    data[key] = event.data[key];
  }
  if (data.projectRef !== undefined && data.projectRef !== projectRef) return null;
  return Object.freeze({ id: event.id, type: event.type, at: event.at, projectRef, data: Object.freeze(data) });
}

function isCurrent(authority, selection) {
  try { return typeof authority?.current === 'function' && authority.current(selection) === true; }
  catch { return false; }
}

// An existing history remains the only notification store. Cursor/coverage are
// returned to the owner but are not persisted or represented as delivered here.
export function receiveProjectActivity({ page, authority, history, commit }) {
  const selection = selected(authority);
  if (!selection || typeof authority.verify !== 'function' || !isCurrent(authority, selection)) return held('authority-unavailable');
  if (!plain(page) || page.schema !== 'mousecat.project-activity/1' || page.ok !== true ||
      page.projectRef !== selection.projectRef || !Array.isArray(page.events) || page.events.length > 100 ||
      !cursorText(page.cursor) || typeof page.reset !== 'boolean' || typeof page.hasMore !== 'boolean' ||
      !plain(page.coverage?.events) || !plain(page.persistence) || typeof page.persistence.pagePersisted !== 'boolean' ||
      typeof page.persistence.statePersisted !== 'boolean' || !Array.isArray(history) || typeof commit !== 'function') return held('page-invalid');
  const pageFacts = { cursor: page.cursor, reset: page.reset, resetReason: page.resetReason ?? null,
    hasMore: page.hasMore, coverage: { ...page.coverage.events },
    pagePersisted: page.persistence.pagePersisted, statePersisted: page.persistence.statePersisted };
  if (page.reset) return held('cursor-reconciliation-required', { page: pageFacts });
  const existing = new Map();
  for (const record of history) {
    if (!plain(record) || typeof record.id !== 'string' || existing.has(record.id)) return held('history-ambiguous');
    existing.set(record.id, record);
  }
  const addition = [], seen = new Map();
  for (const raw of page.events) {
    const event = normalizeEvent(raw, selection.projectRef);
    if (!event) return held('event-invalid');
    let decision;
    try { decision = authority.verify(selection, event); } catch { return held('event-verification-unavailable'); }
    if (!plain(decision) || decision.allowed !== true || decision.selection !== selection || decision.event !== event ||
        !(decision.meaning === 'ignore' || Object.hasOwn(LABELS, decision.meaning))) return held('event-not-authorized');
    const id = 'project-activity:' + JSON.stringify([selection.sourceId, selection.projectRef, selection.recipientRef, event.id]);
    const eventEvidence = JSON.stringify(event);
    const duplicate = seen.get(id);
    if (duplicate) {
      if (duplicate.eventEvidence !== eventEvidence || duplicate.meaning !== decision.meaning) return held('event-identity-conflict');
      continue;
    }
    seen.set(id, { eventEvidence, meaning: decision.meaning });
    const prior = existing.get(id);
    if (decision.meaning === 'ignore') {
      if (prior) return held('event-identity-conflict');
      continue;
    }
    if (prior) {
      if (prior.projectActivity?.eventEvidence !== eventEvidence || prior.projectActivity?.meaning !== decision.meaning) return held('event-identity-conflict');
      continue;
    }
    const record = { id, name: 'Project activity', text: LABELS[decision.meaning], health: 'info', kind: 'project', at: event.at, read: false,
      projectActivity: { sourceId: selection.sourceId, sourceRevision: selection.sourceRevision, projectRef: selection.projectRef,
        recipientRef: selection.recipientRef, eventId: event.id, meaning: decision.meaning, eventEvidence } };
    existing.set(id, record);
    addition.push(record);
  }
  if (!isCurrent(authority, selection)) return held('authority-changed');
  if (addition.length) {
    try { if (commit([...addition.reverse(), ...history]) !== true) return held('history-write-unconfirmed'); }
    catch { return held('history-write-unconfirmed'); }
  }
  return { status: 'received-into-history', added: addition.length, page: pageFacts };
}

// Rendering must also be scoped. The production owner still has to provide a
// revocation subscription which forces a fresh render when the binding changes.
export function visibleProjectHistory(history, authority) {
  const selection = selected(authority);
  const available = selection && isCurrent(authority, selection);
  return history.filter(record => !record.projectActivity || Boolean(available &&
    record.projectActivity.sourceId === selection.sourceId &&
    record.projectActivity.projectRef === selection.projectRef &&
    record.projectActivity.recipientRef === selection.recipientRef));
}
