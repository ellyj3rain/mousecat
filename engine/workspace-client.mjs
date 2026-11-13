// One passive subscription shared by the renderer. Freshness has its own clock;
// a stalled producer cannot extend the useful life of its last observation.
export function createWorkspaceStore({ read, offline = () => false, now = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout, ttlMs = 45000, timeoutMs = 12000 }) {
  let current = { data: null, status: "loading" };
  const listeners = new Set();
  let pending = null, expiry = null, generation = 0;
  const fresh = data => {
    const age = now() - Date.parse(data?.observedAt);
    return Number.isFinite(age) && age >= -5000 && age < ttlMs;
  };
  function emit(next) { current = next; for (const listener of listeners) listener(); }
  function cancelExpiry() { if (expiry != null) clearTimer(expiry); expiry = null; }
  function expire() {
    if (current.status === "live" && !fresh(current.data)) emit({ data: current.data, status: "unavailable" });
  }
  function armExpiry() {
    cancelExpiry();
    expiry = setTimer(() => { expiry = null; expire(); }, Math.max(1, ttlMs - (now() - Date.parse(current.data.observedAt))));
  }
  function refresh() {
    expire();
    if (offline()) { generation++; cancelExpiry(); emit({ data: null, status: "offline" }); return Promise.resolve(); }
    if (pending) return pending;
    const request = ++generation;
    let deadline;
    const timeout = new Promise((_, reject) => { deadline = setTimer(() => reject(new Error("workspace deadline")), timeoutMs); });
    const task = Promise.race([Promise.resolve().then(read), timeout]).then(data => {
      if (request !== generation || offline()) return;
      if (data?.schema !== "mc.workspace/1" || !Array.isArray(data.objects) || !fresh(data)) throw new Error("invalid or stale workspace");
      emit({ data, status: "live" }); armExpiry();
    }).catch(() => {
      if (request === generation && !offline()) emit({ data: current.data, status: "unavailable" });
    }).finally(() => { clearTimer(deadline); if (pending === task) pending = null; });
    pending = task;
    return task;
  }
  return { refresh, getSnapshot: () => current,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
}
