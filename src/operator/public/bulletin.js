import { projectModel } from "/project-model.js";

function el(tag, text, parent, cls) {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls; parent?.append(node); return node;
}
function svg(tag, attrs, parent, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text; parent?.append(node); return node;
}
const clip = (text, max) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
const date = value => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export function installBulletin(root) {
  const header = el("header", undefined, root, "bulletin-header");
  const identity = el("div", undefined, header); el("span", "Project memory", identity, "skill-label");
  const heading = el("h2", "Bulletin", identity); heading.tabIndex = -1;
  el("p", "Ideas and propositions, with the conversation that brought them here.", identity);
  const add = el("button", "Capture idea", header, "button secondary-button"); add.type = "button";
  const tools = el("div", undefined, root, "bulletin-toolbar");
  const projectLabel = el("label", "Project", tools); const project = el("select", undefined, projectLabel); project.setAttribute("aria-label", "Bulletin project");
  const statusLabel = el("label", "Standing", tools); const standing = el("select", undefined, statusLabel); standing.setAttribute("aria-label", "Idea standing");
  for (const [value, label] of [["active", "Open & parked"], ["all", "All retained"], ["open", "Open"], ["parked", "Parked"], ["addressed", "Addressed"], ["archived", "Archived"], ["pruned", "Pruned"]]) { const option = el("option", label, standing); option.value = value; }
  const searchLabel = el("label", "Find an idea", tools); const search = el("input", undefined, searchLabel); search.type = "search"; search.placeholder = "Idea, author or source";
  const fit = el("button", "Fit", tools, "button secondary-button"), plus = el("button", "+", tools, "button secondary-button"), minus = el("button", "−", tools, "button secondary-button");
  plus.setAttribute("aria-label", "Zoom in bulletin"); minus.setAttribute("aria-label", "Zoom out bulletin");
  const count = el("p", "", root, "bulletin-count"); count.setAttribute("role", "status");
  const workspace = el("div", undefined, root, "bulletin-workspace");
  const canvas = svg("svg", { class: "bulletin-canvas", role: "group", "aria-label": "Spatial idea board", tabindex: 0 }, workspace);
  const definitions = svg("defs", {}, canvas); const arrow = svg("marker", { id: "bulletin-arrow", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: "auto-start-reverse" }, definitions); svg("path", { d: "M0,0 L10,5 L0,10Z", fill: "currentColor" }, arrow);
  const world = svg("g", {}, canvas); const empty = el("p", "", workspace, "bulletin-empty");
  const overview = svg("svg", { class: "bulletin-overview", role: "button", "aria-label": "Bulletin overview: click to navigate, Enter to fit", tabindex: 0 }, workspace);
  const details = el("section", undefined, workspace, "bulletin-details"); details.hidden = true;
  const dialog = el("dialog", undefined, root, "bulletin-editor");
  const form = el("form", undefined, dialog); const editorTitle = el("h3", "Capture idea", form);
  function field(label, tag = "input") { const wrap = el("label", label, form); const input = el(tag, undefined, wrap); input.name = label.toLowerCase(); return input; }
  const projectInput = field("Project"); projectInput.required = true; projectInput.maxLength = 512;
  const titleInput = field("Title"); titleInput.required = true; titleInput.maxLength = 240;
  const propositionInput = field("Proposition", "textarea"); propositionInput.required = true; propositionInput.maxLength = 6000; propositionInput.rows = 6;
  const horizon = field("Horizon", "select"); for (const [value, label] of [["short", "Short term"], ["mid", "Mid term"]]) { const option = el("option", label, horizon); option.value = value; }
  const review = field("Review on"); review.type = "date";
  const error = el("p", "", form, "bulletin-error"); error.setAttribute("role", "alert");
  const actions = el("div", undefined, form, "bulletin-actions"); const save = el("button", "Save idea", actions, "button secondary-button"); save.type = "submit";
  const cancel = el("button", "Cancel", actions, "button secondary-button"); cancel.type = "button"; cancel.onclick = () => dialog.close();
  let records = [], projects = [], selected = null, active = false, signature = "", detailsSignature = "", positions = new Map(), scene = { width: 1300, height: 500 }, camera = { x: 0, y: 0, k: 1 }, initialized = false, drag = null, editorRecord = null, mutation = false, queryEpoch = 0, requestedProject = null;
  let draftId = null, captureSubmission = null;
  dialog.addEventListener("cancel", event => { if (mutation) event.preventDefault(); });
  function transform() {
    world.setAttribute("transform", `translate(${camera.x} ${camera.y}) scale(${camera.k})`);
    const viewport = overview.querySelector(".bulletin-overview-camera");
    if (viewport) { viewport.setAttribute("x", -camera.x / camera.k); viewport.setAttribute("y", -camera.y / camera.k); viewport.setAttribute("width", canvas.clientWidth / camera.k); viewport.setAttribute("height", canvas.clientHeight / camera.k); }
  }
  function initialFrame() {
    if (canvas.clientWidth > 600 || !positions.size) return fitScene();
    const first = positions.values().next().value; camera.k = Math.min(1, (canvas.clientWidth - 36) / 300); camera.x = 18 - first.x * camera.k; camera.y = 56 - first.y * camera.k; transform();
  }
  function fitScene() {
    const bounds = canvas.getBoundingClientRect(); camera.k = Math.min(1, Math.max(.08, Math.min((bounds.width - 30) / scene.width, (bounds.height - 30) / scene.height)));
    camera.x = (bounds.width - scene.width * camera.k) / 2; camera.y = (bounds.height - scene.height * camera.k) / 2; transform();
  }
  function zoom(factor, x = canvas.clientWidth / 2, y = canvas.clientHeight / 2) {
    const next = Math.min(2.5, Math.max(.08, camera.k * factor)); camera.x = x - (x - camera.x) * next / camera.k; camera.y = y - (y - camera.y) * next / camera.k; camera.k = next; transform();
  }
  fit.onclick = fitScene; plus.onclick = () => zoom(1.3); minus.onclick = () => zoom(1 / 1.3);
  overview.onclick = event => { const box = overview.getBoundingClientRect(), scale = Math.min(box.width / scene.width, box.height / scene.height), ox = (box.width - scene.width * scale) / 2, oy = (box.height - scene.height * scale) / 2; camera.x = canvas.clientWidth / 2 - (event.clientX - box.left - ox) / scale * camera.k; camera.y = canvas.clientHeight / 2 - (event.clientY - box.top - oy) / scale * camera.k; transform(); };
  overview.onkeydown = event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); fitScene(); } };
  canvas.addEventListener("wheel", event => { event.preventDefault(); const box = canvas.getBoundingClientRect(); zoom(Math.exp(-event.deltaY * .0015), event.clientX - box.left, event.clientY - box.top); }, { passive: false });
  canvas.addEventListener("pointerdown", event => { if (event.target.closest(".bulletin-node")) return; drag = { x: event.clientX, y: event.clientY, cx: camera.x, cy: camera.y }; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener("pointermove", event => { if (drag) { camera.x = drag.cx + event.clientX - drag.x; camera.y = drag.cy + event.clientY - drag.y; transform(); } });
  canvas.addEventListener("pointerup", () => { drag = null; }); canvas.addEventListener("pointercancel", () => { drag = null; });
  canvas.addEventListener("keydown", event => {
    if (event.target !== canvas) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); camera.x += event.key === "ArrowLeft" ? 60 : event.key === "ArrowRight" ? -60 : 0; camera.y += event.key === "ArrowUp" ? 60 : event.key === "ArrowDown" ? -60 : 0; transform(); }
    if (event.key.toLowerCase() === "f") fitScene(); if (event.key === "+" || event.key === "=") zoom(1.3); if (event.key === "-") zoom(1 / 1.3);
  });
  function visibleRecords() {
    const words = search.value.toLocaleLowerCase().split(/\s+/u).filter(Boolean);
    return records.filter(record => (!project.value || record.projectRef === project.value) && (standing.value === "all" || (standing.value === "active" ? ["open", "parked"].includes(record.status) : record.status === standing.value)) && words.every(word => `${record.title} ${record.proposition || ""} ${record.projectRef} ${record.source.author} ${record.source.host}`.toLocaleLowerCase().includes(word)));
  }
  function projectName(ref) { return projects.find(value => value.ref === ref)?.label || ref; }
  async function command(action, values) {
    if (mutation) return false; mutation = true; root.setAttribute("aria-busy", "true");
    let rejected = false;
    try {
      const response = await fetch("/api/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commandId: `bulletin-${action}`, values }) });
      const result = await response.json(); if (!response.ok || !result.ok) { rejected = response.status < 500 && result.ok === false; throw new Error(result.code || "Could not save idea"); }
      records = result.snapshot.bulletin.records; signature = ""; render(); return true;
    } catch (failure) { count.textContent = `${rejected ? "Change not saved" : "Save outcome unknown"}: ${failure.message}`; error.textContent = rejected ? failure.message : "Save outcome unknown. Retry the same submission to check its result."; return rejected ? false : null; }
    finally { mutation = false; root.setAttribute("aria-busy", "false"); }
  }
  function target(record) { return { ideaId: record.ideaId, projectRef: record.projectRef, expectedRevision: record.revision }; }
  function openEditor(record = null) {
    editorRecord = record ? structuredClone(record) : null; editorTitle.textContent = record ? "Amend idea" : "Capture idea";
    draftId = record ? null : `idea-${crypto.randomUUID()}`; captureSubmission = null;
    for (const control of [projectInput, titleInput, propositionInput, horizon, review, save, cancel]) control.disabled = false;
    save.textContent = "Save idea";
    projectInput.value = record?.projectRef || project.value || ""; projectInput.readOnly = Boolean(record);
    titleInput.value = record?.title || ""; propositionInput.value = record?.proposition || ""; horizon.value = record?.horizon || "short"; review.value = record?.reviewAt?.slice(0, 10) || ""; error.textContent = "";
    dialog.showModal(); (record ? titleInput : projectInput).focus();
  }
  add.onclick = () => openEditor();
  form.addEventListener("submit", async event => {
    event.preventDefault(); if (mutation) return;
    const values = { title: titleInput.value, proposition: propositionInput.value, horizon: horizon.value, reviewAt: review.value ? `${review.value}T00:00:00.000Z` : null };
    if (!editorRecord) captureSubmission ||= { record: { ...values, ideaId: draftId, projectRef: projectInput.value } };
    for (const control of [projectInput, titleInput, propositionInput, horizon, review, save, cancel]) control.disabled = true;
    const ok = editorRecord ? await command("amend", { ...target(editorRecord), patch: values }) : await command("capture", captureSubmission);
    if (ok) dialog.close();
    if (ok === false) captureSubmission = null;
    for (const control of [projectInput, titleInput, propositionInput, horizon, review]) control.disabled = !editorRecord && ok === null;
    save.disabled = false; cancel.disabled = false;
    save.textContent = !editorRecord && ok === null ? "Retry save" : "Save idea";
  });
  function refreshConnections(record) {
    const select = details.querySelector('[aria-label="Connect to idea"]');
    if (!select) return;
    const candidates = records.filter(value => value.projectRef === record.projectRef && value.ideaId !== record.ideaId && value.status !== "pruned");
    const next = JSON.stringify(candidates.map(value => [value.ideaId, value.title]));
    if (select.dataset.candidates !== next) {
      const previous = select.value;
      select.replaceChildren();
      for (const candidate of candidates) { const option = el("option", candidate.title, select); option.value = candidate.ideaId; }
      if (candidates.some(value => value.ideaId === previous)) select.value = previous;
      select.dataset.candidates = next;
      details.querySelector('[data-bulletin-add]').disabled = !select.options.length;
    }
    for (const label of details.querySelectorAll('[data-connection-target]')) {
      label.textContent = `${label.dataset.connectionRelation}: ${records.find(value => value.ideaId === label.dataset.connectionTarget)?.title || label.dataset.connectionTarget}`;
    }
  }
  function showDetails(record) {
    details.hidden = false;
    const nextSignature = JSON.stringify(record); if (detailsSignature === nextSignature) { refreshConnections(record); return; }
    detailsSignature = nextSignature; details.replaceChildren();
    const close = el("button", "Close details", details, "button text-button"); close.onclick = () => { selected = null; details.hidden = true; render(); canvas.focus(); };
    el("span", `${record.status} · ${record.horizon === "mid" ? "mid term" : "short term"}`, details, "bulletin-standing");
    const title = el("h3", record.title, details); title.tabIndex = -1;
    el("p", record.proposition || "Content was pruned; identity and revision receipts remain.", details, "bulletin-proposition");
    el("p", projectName(record.projectRef), details, "bulletin-project-name");
    if (record.surfaceId) el("p", `Surface: ${record.surfaceId}`, details);
    const provenance = el("dl", undefined, details);
    for (const [label, value] of [["Author", record.source.author], ["Host", record.source.host], ["Session", record.source.sessionId], ["Message", record.source.messageId], ["Source time", record.source.at], ["Captured", record.createdAt], ["Updated", record.updatedAt], ["Revision", String(record.revision)]]) { el("dt", label, provenance); el("dd", value, provenance); }
    if (record.reviewAt) el("p", `Review ${date(record.reviewAt)} · retained until an explicit change`, details);
    if (record.status !== "pruned") {
      const controls = el("div", undefined, details, "bulletin-actions");
      if (!record.sensitive) { const edit = el("button", "Amend", controls, "button secondary-button"); edit.onclick = () => openEditor(record); }
      const disposition = el("select", undefined, controls); disposition.setAttribute("aria-label", "Change idea standing");
      for (const value of ["open", "parked", "addressed", "archived"]) { const option = el("option", value, disposition); option.value = value; } disposition.value = record.status;
      const change = el("button", "Apply standing", controls, "button secondary-button"); change.onclick = () => command("disposition", { ...target(record), status: disposition.value });
      if (!record.sensitive) {
      const linkWrap = el("fieldset", undefined, details); el("legend", "Explicit connection", linkWrap);
      const linkTarget = el("select", undefined, linkWrap); linkTarget.setAttribute("aria-label", "Connect to idea");
      for (const candidate of records.filter(value => value.projectRef === record.projectRef && value.ideaId !== record.ideaId && value.status !== "pruned")) { const option = el("option", candidate.title, linkTarget); option.value = candidate.ideaId; }
      const relation = el("select", undefined, linkWrap); relation.setAttribute("aria-label", "Connection relation");
      for (const value of ["relates", "extends", "depends-on"]) { const option = el("option", value, relation); option.value = value; }
      const link = el("button", "Add connection", linkWrap, "button secondary-button"); link.disabled = !linkTarget.options.length;
      link.dataset.bulletinAdd = "true";
      link.onclick = () => command("amend", { ...target(record), patch: { links: [...record.links, { ideaId: linkTarget.value, relation: relation.value }] } });
      for (const existing of record.links) { const row = el("div", undefined, linkWrap, "bulletin-link-row"); const label = el("span", undefined, row); label.dataset.connectionTarget = existing.ideaId; label.dataset.connectionRelation = existing.relation; const remove = el("button", "Remove connection", row, "button text-button"); remove.onclick = () => command("amend", { ...target(record), patch: { links: record.links.filter(value => value !== existing) } }); }
      }
    }
    if (record.status !== "pruned") {
      const confirmation = el("details", undefined, details, "bulletin-prune"); el("summary", "Prune content", confirmation);
      el("p", "This removes the idea's text and prior text revisions. Its identity, source anchors and content hashes remain as a tombstone.", confirmation);
      const prune = el("button", "Prune this idea", confirmation, "button secondary-button"); prune.onclick = () => command("prune", target(record));
    }
    const history = el("details", undefined, details); el("summary", `${record.history.length} revision receipts`, history);
    for (const entry of record.history) { const receipt = el("article", undefined, history, "bulletin-revision"); el("strong", `r${entry.revision} · ${entry.action} · ${entry.source.author}`, receipt); el("p", entry.at, receipt); if (entry.proposition) el("p", entry.proposition, receipt); el("code", entry.contentHash, receipt); }
    refreshConnections(record);
  }
  function select(record, focus = false) { selected = record.ideaId; render(); if (focus) details.querySelector("h3")?.focus({ preventScroll: true }); }
  function render() {
    const visible = visibleRecords(), current = records.find(record => record.ideaId === selected);
    world.replaceChildren(); positions = new Map(); let y = 34; const groups = [...new Set(visible.map(record => record.projectRef))];
    for (const ref of groups) {
      const entries = visible.filter(record => record.projectRef === ref), height = Math.ceil(entries.length / 4) * 202 + 80;
      svg("rect", { x: 20, y, width: 1308, height, rx: 24, class: "bulletin-island" }, world);
      svg("text", { x: 45, y: y + 36, class: "bulletin-island-title" }, world, clip(projectName(ref), 90));
      entries.forEach((record, index) => positions.set(record.ideaId, { x: 44 + index % 4 * 321, y: y + 62 + Math.floor(index / 4) * 202 })); y += height + 40;
    }
    scene = { width: 1350, height: Math.max(350, y) };
    for (const record of visible) for (const link of record.links) {
      const a = positions.get(record.ideaId), b = positions.get(link.ideaId); if (!a || !b) continue;
      const ax = a.x + 150, ay = a.y + 168, bx = b.x + 150, by = b.y;
      svg("path", { d: `M${ax},${ay} C${ax},${ay + 52} ${bx},${by - 52} ${bx},${by}`, class: "bulletin-connection", "data-relation": link.relation, "marker-end": "url(#bulletin-arrow)" }, world);
      svg("text", { x: (ax + bx) / 2, y: (ay + by) / 2, class: "bulletin-connection-label" }, world, link.relation);
    }
    overview.replaceChildren(); overview.setAttribute("viewBox", `0 0 ${scene.width} ${scene.height}`);
    for (const p of positions.values()) svg("rect", { x: p.x, y: p.y, width: 300, height: 168, rx: 10, class: "bulletin-overview-node" }, overview);
    svg("rect", { class: "bulletin-overview-camera", fill: "none" }, overview);
    for (const record of visible) {
      const p = positions.get(record.ideaId), group = svg("g", { transform: `translate(${p.x} ${p.y})`, class: `bulletin-node ${record.status}${selected === record.ideaId ? " selected" : ""}`, tabindex: 0, role: "button", "aria-label": `${record.title}, ${record.status}, ${record.source.author}`, "aria-pressed": String(selected === record.ideaId), "data-idea-id": record.ideaId }, world);
      svg("rect", { width: 300, height: 168, rx: 14 }, group);
      svg("circle", { cx: 20, cy: 21, r: 4, class: "bulletin-node-dot" }, group);
      svg("text", { x: 34, y: 25, class: "bulletin-node-meta" }, group, `${record.status.toUpperCase()} · ${record.horizon === "mid" ? "MID TERM" : "SHORT TERM"}`);
      const words = record.title.split(/\s+/u); let lines = [""];
      for (const word of words) { if ((lines.at(-1) + word).length > 28 && lines.at(-1)) lines.push(""); lines[lines.length - 1] += `${word} `; }
      lines.slice(0, 2).forEach((line, index) => svg("text", { x: 18, y: 56 + index * 23, class: "bulletin-node-title" }, group, clip(line.trim(), 31)));
      svg("text", { x: 18, y: 108, class: "bulletin-node-copy" }, group, clip(record.proposition || "Retained tombstone", 43));
      svg("text", { x: 18, y: 136, class: "bulletin-node-meta" }, group, clip(`${record.source.author} · ${record.source.host}`, 42));
      svg("text", { x: 18, y: 155, class: "bulletin-node-meta" }, group, `${date(record.source.at)} · r${record.revision}`);
      group.onclick = () => select(record, true); group.onkeydown = event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); select(record, true); } };
    }
    count.textContent = `${visible.length} idea${visible.length === 1 ? "" : "s"} · ${groups.length} project${groups.length === 1 ? "" : "s"} · connections are source supplied${records.length ? "" : " · capture an idea to begin"}`;
    empty.hidden = visible.length > 0; empty.textContent = records.length ? "No ideas match this view." : "A place for ideas worth keeping. Capture a proposition, or let your connected host bring one here.";
    if (current) showDetails(current); else details.hidden = true;
    transform(); if (!initialized && active) { initialFrame(); initialized = true; }
  }
  async function filter() {
    initialized = false; render(); const epoch = ++queryEpoch, params = new URLSearchParams();
    if (project.value) params.set("projectRef", project.value); if (!["all", "active"].includes(standing.value)) params.set("status", standing.value); if (search.value) params.set("query", search.value);
    try { const response = await fetch(`/api/bulletin?${params}`); const result = await response.json(); if (epoch !== queryEpoch) return; if (!response.ok || !result.ok) throw new Error(result.code); count.dataset.queryVerified = "true"; }
    catch { if (epoch === queryEpoch) count.textContent += " · source query unavailable"; }
  }
  project.onchange = filter; standing.onchange = filter; search.oninput = filter;
  const resize = new ResizeObserver(() => { if (active && !initialized) fitScene(); }); resize.observe(canvas);
  return {
    open(projectRef) { requestedProject = projectRef || ""; initialized = false; },
    update(snapshot, visible) {
      const entering = visible && !active; active = visible; if (!visible) return;
      const refs = [...new Set([...(snapshot.projects || []).map(value => value.surface.projectRef), ...(snapshot.bulletin?.records || []).map(value => value.projectRef)])];
      const model = projectModel(snapshot);
      projects = refs.map(ref => ({ ref, label: snapshot.projects?.find(value => value.surface.projectRef === ref)?.surface.label || model.projects.get(ref)?.label || ref.replace(/^project:/u, "").replaceAll("-", " ") }));
      const next = JSON.stringify([snapshot.bulletin, projects]);
      if (next !== signature || requestedProject !== null) {
        const focusId = document.activeElement?.closest?.(".bulletin-node")?.dataset.ideaId;
        signature = next; records = snapshot.bulletin?.records || [];
        const currentProject = requestedProject ?? project.value; requestedProject = null; project.replaceChildren(); const all = el("option", "All projects", project); all.value = "";
        for (const value of projects) { const option = el("option", value.label, project); option.value = value.ref; }
        project.value = refs.includes(currentProject) ? currentProject : ""; render();
        if (focusId) [...world.querySelectorAll(".bulletin-node")].find(node => node.dataset.ideaId === focusId)?.focus({ preventScroll: true });
      }
      if (entering) { if (!initialized) fitScene(); heading.focus({ preventScroll: true }); }
    },
  };
}
