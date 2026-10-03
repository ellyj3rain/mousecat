const SVG = "http://www.w3.org/2000/svg";
const KINDS = { person: "Person", belief: "Belief", hypothesis: "Proposed prediction", decision: "Decision", action: "Action", outcome: "Outcome", event: "Event", need: "Need", unknown: "Unknown evidence", externality: "Externality evidence" };
const PERSPECTIVES = { observed: "Observed", private: "Person's private account", predicted: "Proposed prediction", unknown: "Unknown" };
const LANES = [
  { label: "People & context", kinds: ["person", "event", "need"] },
  { label: "Beliefs", kinds: ["belief"] },
  { label: "Predictions", kinds: ["hypothesis"] },
  { label: "Decisions & actions", kinds: ["decision", "action"] },
  { label: "Outcomes", kinds: ["outcome"] },
  { label: "External effects & unknowns", kinds: ["unknown", "externality"] },
];
let instanceSequence = 0;

function element(tag, className, text) {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}
function svg(tag, attributes = {}) {
  const value = document.createElementNS(SVG, tag);
  for (const [key, content] of Object.entries(attributes)) value.setAttribute(key, String(content));
  return value;
}
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
function confidence(value) {
  if (value === 0 || value === 1) return `${value * 100}%`;
  const percent = Number((value * 100).toFixed(2));
  return percent === 100 ? "<100%" : percent === 0 ? "<0.01%" : `${percent}%`;
}
function clock(value) {
  if (!finite(value) || value <= 0) return "Acquisition time unknown";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "Acquisition time unknown";
}
function hours(value) { return finite(value) ? `${value.toFixed(2)} world hours` : "Unknown world clock"; }
function sourceName(value) { return value === "native-body" ? "Native body" : value === "durable-record" ? "Durable record" : typeof value === "string" ? value : value?.name || "Unknown position source"; }
function shortLabel(label, length = 29) {
  const text = String(label || "Unknown");
  return text.length > length ? text.slice(0, length - 1) + "…" : text;
}

// Both views project this exact graph: spatial markers use supplied positions;
// the evidence diagram draws only supplied references. Layout adds no relation.
export function createNativeObservationMap(container, { selectPerson } = {}) {
  const instance = ++instanceSequence, root = element("section", "native-observation");
  root.setAttribute("aria-label", "Simulation observation");
  const heading = element("div", "native-observation-heading"), headingText = element("div");
  headingText.append(element("h2", "", "Observation"));
  const sourceClock = element("p", "native-observation-clock"); headingText.append(sourceClock); heading.append(headingText);
  const tabs = element("div", "native-observation-tabs"); tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Observation display");
  const positionTab = element("button", "", "Positions"), evidenceTab = element("button", "", "Evidence");
  for (const [button, id] of [[positionTab, "positions"], [evidenceTab, "evidence"]]) {
    button.type = "button"; button.setAttribute("role", "tab"); button.id = `observation-${instance}-${id}`; tabs.append(button);
  }
  heading.append(tabs);
  const toolbar = element("div", "native-observation-toolbar"), description = element("p", "native-observation-description");
  const controls = element("div", "native-observation-controls");
  const zoomOut = element("button", "", "−"), zoomIn = element("button", "", "+"), recenter = element("button", "", "↺");
  for (const [button, label] of [[zoomOut, "Zoom observation out"], [zoomIn, "Zoom observation in"], [recenter, "Recenter observation"]]) {
    button.type = "button"; button.setAttribute("aria-label", label); button.title = label; controls.append(button);
  }
  const zoomLabel = element("span", "native-observation-zoom", "100%"); controls.append(zoomLabel); toolbar.append(description, controls);
  const status = element("p", "native-observation-status"); status.setAttribute("role", "status");
  const viewport = element("div", "native-observation-viewport");
  viewport.setAttribute("role", "tabpanel");
  const drawing = svg("svg", { role: "application", tabindex: "0", "aria-label": "Observation map. Drag to browse, use the wheel to zoom, or use arrow keys to pan.", viewBox: "0 0 1000 480" });
  const defs = svg("defs"), gradient = svg("radialGradient", { id: `observation-glow-${instance}` });
  gradient.append(svg("stop", { offset: "0%", "stop-color": "var(--accent)", "stop-opacity": ".16" }), svg("stop", { offset: "100%", "stop-color": "var(--accent)", "stop-opacity": "0" }));
  const marker = svg("marker", { id: `observation-arrow-${instance}`, viewBox: "0 0 8 8", refX: "7", refY: "4", markerWidth: "6", markerHeight: "6", orient: "auto-start-reverse" });
  marker.append(svg("path", { d: "M0 0 L8 4 L0 8 z", fill: "var(--text-muted)" }));
  const pattern = svg("pattern", { id: `observation-grid-${instance}`, width: "40", height: "40", patternUnits: "userSpaceOnUse" });
  pattern.append(svg("path", { d: "M40 0 H0 V40", fill: "none", stroke: "var(--line)", "stroke-width": "1" }));
  defs.append(gradient, marker, pattern);
  const grid = svg("rect", { width: "100%", height: "100%", fill: `url(#observation-grid-${instance})`, "pointer-events": "none" });
  const plane = svg("g", { class: "native-observation-plane" }), edgeLayer = svg("g", { class: "native-observation-edges" }), nodeLayer = svg("g", { class: "native-observation-nodes" });
  plane.append(edgeLayer, nodeLayer); drawing.append(defs, grid, plane); viewport.append(drawing);
  const legend = element("div", "native-observation-legend"), help = element("p", "native-observation-help", "Drag to browse · wheel to zoom · arrow keys to pan");
  const detail = element("section", "native-observation-detail"); detail.hidden = true; detail.setAttribute("aria-label", "Selected observation");
  root.append(heading, toolbar, status, viewport, legend, help, detail); container.append(root);
  let graph = null, signature = "", nodes = [], edges = [], layout = new Map(), selected = null, display = "positions", destroyed = false;
  let width = 1000, height = 480, transform = { x: 0, y: 0, zoom: 1 }, projection = null, drag = null;
  const listeners = [];
  function listen(target, event, handler, options) { target.addEventListener(event, handler, options); listeners.push(() => target.removeEventListener(event, handler, options)); }
  function applyTransform() {
    plane.setAttribute("transform", `translate(${transform.x} ${transform.y}) scale(${transform.zoom})`);
    zoomLabel.textContent = `${Math.round(transform.zoom * 100)}%`;
    zoomOut.disabled = transform.zoom <= 0.35; zoomIn.disabled = transform.zoom >= 4;
  }
  function zoom(factor, x = width / 2, y = height / 2) {
    const next = Math.max(0.35, Math.min(4, transform.zoom * factor)), ratio = next / transform.zoom;
    transform.x = x - (x - transform.x) * ratio; transform.y = y - (y - transform.y) * ratio; transform.zoom = next; applyTransform();
  }
  function reset() { transform = { x: 0, y: 0, zoom: 1 }; projection = null; applyTransform(); }
  function provenance(parent, source) {
    const row = element("p", "native-observation-provenance");
    row.append(element("strong", "", source?.name || "Unknown source"), element("span", "", source?.recordId || "Unknown record"));
    const time = element("time", "", clock(source?.capturedAtUnixMs));
    if (finite(source?.capturedAtUnixMs) && source.capturedAtUnixMs > 0 && Number.isFinite(new Date(source.capturedAtUnixMs).getTime())) time.dateTime = clock(source.capturedAtUnixMs);
    row.append(element("span", "", hours(source?.worldHours)), time); parent.append(row);
  }
  function field(parent, label, value) {
    const pair = element("div", "native-observation-field"); pair.append(element("dt", "", label), element("dd", "", value)); parent.append(pair);
  }
  function renderDetail() {
    const focusedControl = detail.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
    detail.replaceChildren();
    const node = selected?.type === "node" ? nodes.find(value => value.id === selected.id) : null;
    const edge = selected?.type === "edge" ? edges.find(value => value.id === selected.id) : null;
    const value = node || edge;
    detail.hidden = !value;
    if (!value) { selected = null; return; }
    const detailHeading = element("div", "native-observation-detail-heading");
    const title = element("h3", "", value.label || value.id); title.tabIndex = -1; title.dataset.focusKey = "heading"; detailHeading.append(title);
    const close = element("button", "", "×"); close.type = "button"; close.dataset.focusKey = "close"; close.setAttribute("aria-label", "Close observation details");
    close.addEventListener("click", closeDetail); detailHeading.append(close); detail.append(detailHeading);
    const fields = element("dl", "native-observation-fields");
    field(fields, "Evidence", node ? KINDS[node.kind] || "Unknown evidence" : edge.relation === "precedes" ? "Temporal order only" : edge.relation === "correlates" ? "Correlation" : edge.relation);
    field(fields, "Perspective", PERSPECTIVES[value.perspective] || "Unknown");
    if (node) {
      field(fields, "Source status", node.status || "Unknown");
      if (node.actorId) field(fields, "Person", nodes.find(candidate => candidate.kind === "person" && candidate.actorId === node.actorId)?.label || node.actorId);
      if (node.position && [node.position.x, node.position.y, node.position.z].every(finite)) field(fields, "Position", `${node.position.x}, ${node.position.y}, ${node.position.z} · ${sourceName(node.position.source)}`);
      else field(fields, "Position", "Not supplied by source");
      if (node.summary) detail.append(element("p", "native-observation-summary", node.summary));
    } else {
      field(fields, "From", nodes.find(candidate => candidate.id === edge.from)?.label || edge.from);
      field(fields, "To", nodes.find(candidate => candidate.id === edge.to)?.label || edge.to);
    }
    if (finite(value.confidence)) field(fields, "Source confidence", confidence(value.confidence));
    detail.append(fields); provenance(detail, value.source);
    if (node?.metrics?.length) {
      const metrics = element("dl", "native-observation-metrics");
      for (const metric of node.metrics.slice(0, 16)) {
        const pair = element("div", "native-observation-field"); pair.title = metric.description || "";
        pair.append(element("dt", "", metric.label || metric.key), element("dd", "", `${String(metric.value)}${metric.unit ? " " + metric.unit : ""}`)); metrics.append(pair);
      }
      detail.append(metrics);
    }
    if (node) {
      const related = edges.filter(candidate => candidate.from === node.id || candidate.to === node.id);
      if (related.length) {
        detail.append(element("h4", "", "Source references"));
        const list = element("ul", "native-observation-references");
        for (const reference of related) {
          const item = element("li"), button = element("button", "", `${reference.label || reference.relation}${reference.relation === "precedes" ? " · temporal order only" : ""}`);
          button.type = "button"; button.dataset.focusKey = `reference:${reference.id}`; button.addEventListener("click", () => { selected = { type: "edge", id: reference.id }; renderDetail(); renderSelection(); detail.querySelector("h3")?.focus({ preventScroll: true }); }); item.append(button); list.append(item);
        }
        detail.append(list);
      } else detail.append(element("p", "native-observation-missing", "No downstream reference supplied for this record."));
    }
    if (focusedControl) for (const button of detail.querySelectorAll("[data-focus-key]")) if (button.dataset.focusKey === focusedControl) button.focus({ preventScroll: true });
  }
  function closeDetail() {
    const previous = selected; selected = null; renderDetail(); renderSelection();
    const attribute = previous?.type === "edge" ? "data-edge-id" : "data-node-id";
    const target = [...drawing.querySelectorAll(`[${attribute}]`)].find(candidate => candidate.getAttribute(attribute) === previous?.id);
    (target || drawing).focus({ preventScroll: true });
  }
  function renderSelection() {
    for (const value of nodeLayer.querySelectorAll("[data-node-id]")) value.classList.toggle("is-selected", selected?.type === "node" && selected.id === value.dataset.nodeId);
    for (const value of edgeLayer.querySelectorAll("[data-edge-id]")) value.classList.toggle("is-selected", selected?.type === "edge" && selected.id === value.dataset.edgeId);
  }
  function chooseNode(node) {
    selected = { type: "node", id: node.id }; renderDetail(); renderSelection();
    if (node.kind === "person" && node.actorId) selectPerson?.(node.actorId);
  }
  function activate(target, callback) {
    target.addEventListener("click", event => { if (!drag?.moved) { event.stopPropagation(); callback(); } });
    target.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); callback(); } });
  }
  function renderLegend() {
    legend.replaceChildren();
    const entries = display === "positions" ? [["observed", "Source position"], ["unknown", "Position source shown in details"]]
      : [["observed", "Observed"], ["private", "Private belief / account"], ["predicted", "Proposed prediction"], ["unknown", "Missing / unknown"], ["temporal", "Temporal order only"], ["correlates", "Correlation"]];
    for (const [kind, label] of entries) { const entry = element("span", "native-observation-legend-item"); entry.dataset.perspective = kind; entry.append(element("i"), element("span", "", label)); legend.append(entry); }
  }
  function drawNodes(values) {
    for (const node of values) {
      const point = layout.get(node.id); if (!point) continue;
      const spatial = display === "positions";
      const group = svg("g", { class: `native-observation-node ${spatial ? "is-position" : "is-record"}`, transform: `translate(${point.x} ${point.y})`, role: "button", tabindex: "0",
        "aria-label": `${node.label}. ${KINDS[node.kind] || "Unknown evidence"}. ${PERSPECTIVES[node.perspective] || "Unknown"}.`, "data-node-id": node.id, "data-kind": node.kind, "data-perspective": node.perspective });
      const title = svg("title"); title.textContent = `${node.label}\n${node.summary || ""}\n${node.source?.name || "Unknown source"} · ${node.source?.recordId || "Unknown record"}`; group.append(title);
      if (spatial) {
        group.append(svg("circle", { r: "36", fill: `url(#observation-glow-${instance})`, stroke: "none", "pointer-events": "none" }));
        group.append(svg(node.kind === "person" ? "circle" : "rect", node.kind === "person" ? { r: "8", class: "native-observation-node-shape" } : { x: "-7", y: "-7", width: "14", height: "14", rx: "3", class: "native-observation-node-shape" }));
        const label = svg("text", { x: "14", y: "-3", class: "native-observation-node-label" }); label.textContent = shortLabel(node.label, 23);
        const position = svg("text", { x: "14", y: "15", class: "native-observation-node-caption" }); position.textContent = `${node.position.x}, ${node.position.y}, ${node.position.z}`;
        group.append(label, position);
      } else {
        group.append(svg("rect", { x: "0", y: "0", width: "204", height: "70", rx: "10", class: "native-observation-node-shape" }));
        const kind = svg("text", { x: "13", y: "20", class: "native-observation-node-caption" }); kind.textContent = KINDS[node.kind] || "Unknown evidence";
        const label = svg("text", { x: "13", y: "41", class: "native-observation-node-label" }); label.textContent = shortLabel(node.label, 26);
        const state = svg("text", { x: "13", y: "58", class: "native-observation-node-caption" }); state.textContent = shortLabel(node.status || PERSPECTIVES[node.perspective] || "Unknown", 30);
        group.append(kind, label, state);
      }
      group.addEventListener("focus", () => {
        // A keyboard user can reach records outside the current diagram crop.
        // Bring that record into view without changing any source coordinate.
        const left = point.x * transform.zoom + transform.x, top = point.y * transform.zoom + transform.y;
        const right = left + (spatial ? 145 : 204) * transform.zoom, bottom = top + (spatial ? 24 : 70) * transform.zoom;
        if (left < 15) transform.x += 15 - left;
        else if (right > width - 15) transform.x -= right - width + 15;
        if (top < 25) transform.y += 25 - top;
        else if (bottom > height - 15) transform.y -= bottom - height + 15;
        applyTransform();
      });
      activate(group, () => chooseNode(node)); nodeLayer.append(group);
    }
  }
  function render() {
    if (destroyed) return;
    const active = drawing.ownerDocument.activeElement;
    const focused = active?.getAttribute?.("data-node-id") ? { attribute: "data-node-id", id: active.getAttribute("data-node-id") } : active?.getAttribute?.("data-edge-id") ? { attribute: "data-edge-id", id: active.getAttribute("data-edge-id") } : null;
    nodeLayer.replaceChildren(); edgeLayer.replaceChildren(); layout = new Map();
    positionTab.setAttribute("aria-selected", String(display === "positions")); evidenceTab.setAttribute("aria-selected", String(display === "evidence"));
    positionTab.tabIndex = display === "positions" ? 0 : -1; evidenceTab.tabIndex = display === "evidence" ? 0 : -1;
    viewport.setAttribute("aria-labelledby", (display === "positions" ? positionTab : evidenceTab).id);
    drawing.setAttribute("aria-label", `${display === "positions" ? "Source positions" : "Decision evidence diagram"}. Drag to browse, use the wheel to zoom, or use arrow keys to pan.`);
    const available = graph?.status === "available";
    toolbar.hidden = !available; viewport.hidden = !available; legend.hidden = !available; help.hidden = !available;
    sourceClock.textContent = graph ? `${hours(graph.worldHours)} · ${clock(graph.capturedAtUnixMs)}` : "Waiting for a source observation";
    status.textContent = available ? graph.message || "" : graph?.message || "Observation is unavailable.";
    status.hidden = available && !status.textContent;
    root.dataset.state = graph?.status || "unavailable";
    if (!available) { selected = null; projection = null; renderDetail(); return; }
    if (display === "positions") {
      const positioned = nodes.filter(node => node.position && [node.position.x, node.position.y, node.position.z].every(finite));
      description.textContent = `${positioned.length} source positions · ${nodes.length - positioned.length} records without positions${graph.omittedNodes ? ` · ${graph.omittedNodes} records omitted by source` : ""}`;
      if (positioned.length) {
        if (!projection) {
          const minX = Math.min(...positioned.map(node => node.position.x)), maxX = Math.max(...positioned.map(node => node.position.x));
          const minY = Math.min(...positioned.map(node => node.position.y)), maxY = Math.max(...positioned.map(node => node.position.y));
          const scale = Math.min(Math.max(40, width - 180) / Math.max(1, maxX - minX), Math.max(80, height - 140) / Math.max(1, maxY - minY));
          projection = { scale, x: 60 + (width - 180 - (maxX - minX) * scale) / 2 - minX * scale, y: 70 + (height - 140 - (maxY - minY) * scale) / 2 - minY * scale };
        }
        for (const node of positioned) layout.set(node.id, { x: projection.x + node.position.x * projection.scale, y: projection.y + node.position.y * projection.scale });
        drawNodes(positioned);
      } else {
        const empty = svg("text", { x: "24", y: "54", class: "native-observation-empty" }); empty.textContent = "No spatial positions supplied."; nodeLayer.append(empty);
      }
    } else {
      description.textContent = `${nodes.length} records · ${edges.length} source references · diagram layout${graph.omittedNodes || graph.omittedEdges ? ` · ${graph.omittedNodes || 0} nodes / ${graph.omittedEdges || 0} references omitted by source` : ""}`;
      for (const [index, lane] of LANES.entries()) {
        const headingLabel = svg("text", { x: 24 + index * 246, y: "34", class: "native-observation-lane" }); headingLabel.textContent = lane.label; nodeLayer.append(headingLabel);
        const laneNodes = nodes.filter(node => lane.kinds.includes(node.kind));
        for (const [row, node] of laneNodes.entries()) layout.set(node.id, { x: 24 + index * 246, y: 56 + row * 98 });
      }
      for (const edge of edges) {
        const from = layout.get(edge.from), to = layout.get(edge.to); if (!from || !to) continue;
        const sameLane = from.x === to.x, startX = from.x + (sameLane ? 204 : from.x <= to.x ? 204 : 0), endX = to.x + (sameLane ? 204 : from.x <= to.x ? 0 : 204);
        const startY = from.y + 35, endY = to.y + 35, bend = sameLane ? startX + 25 : (startX + endX) / 2;
        const path = `M${startX} ${startY} C${bend} ${startY} ${bend} ${endY} ${endX} ${endY}`;
        const group = svg("g", { class: "native-observation-edge", "data-edge-id": edge.id, "data-relation": edge.relation, "data-perspective": edge.perspective,
          role: "button", tabindex: "0", "aria-label": `${edge.label || edge.relation}${edge.relation === "precedes" ? ". Temporal order only" : ""}. ${nodes.find(node => node.id === edge.from)?.label || edge.from} to ${nodes.find(node => node.id === edge.to)?.label || edge.to}.` });
        const title = svg("title"); title.textContent = `${edge.label || edge.relation}\n${edge.relation === "precedes" ? "Temporal order only\n" : ""}${edge.source?.name || "Unknown source"} · ${edge.source?.recordId || "Unknown record"}`;
        group.append(title, svg("path", { d: path, class: "native-observation-edge-hit", fill: "none" }), svg("path", { d: path, class: "native-observation-edge-line", fill: "none", "marker-end": `url(#observation-arrow-${instance})` }));
        group.addEventListener("focus", () => {
          const centerX = (startX + endX) / 2 * transform.zoom + transform.x, centerY = (startY + endY) / 2 * transform.zoom + transform.y;
          if (centerX < 20 || centerX > width - 20) transform.x += width / 2 - centerX;
          if (centerY < 20 || centerY > height - 20) transform.y += height / 2 - centerY;
          applyTransform();
        });
        activate(group, () => { selected = { type: "edge", id: edge.id }; renderDetail(); renderSelection(); }); edgeLayer.append(group);
      }
      drawNodes(nodes);
    }
    renderLegend(); renderDetail(); renderSelection(); applyTransform();
    if (focused) for (const candidate of drawing.querySelectorAll(`[${focused.attribute}]`)) if (candidate.getAttribute(focused.attribute) === focused.id) candidate.focus({ preventScroll: true });
  }
  function chooseDisplay(value) { if (display !== value) { display = value; reset(); render(); } }
  listen(positionTab, "click", () => chooseDisplay("positions")); listen(evidenceTab, "click", () => chooseDisplay("evidence"));
  listen(tabs, "keydown", event => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); chooseDisplay(display === "positions" ? "evidence" : "positions"); (display === "positions" ? positionTab : evidenceTab).focus(); } });
  listen(zoomOut, "click", () => zoom(1 / 1.25)); listen(zoomIn, "click", () => zoom(1.25)); listen(recenter, "click", () => { reset(); render(); });
  listen(drawing, "wheel", event => { event.preventDefault(); const bounds = drawing.getBoundingClientRect(); zoom(Math.exp(-Math.max(-120, Math.min(120, event.deltaY)) * 0.002), (event.clientX - bounds.left) * width / bounds.width, (event.clientY - bounds.top) * height / bounds.height); }, { passive: false });
  listen(drawing, "keydown", event => {
    const amount = event.shiftKey ? 90 : 36;
    const changes = { ArrowLeft: [amount, 0], ArrowRight: [-amount, 0], ArrowUp: [0, amount], ArrowDown: [0, -amount] };
    if (changes[event.key]) { event.preventDefault(); transform.x += changes[event.key][0]; transform.y += changes[event.key][1]; applyTransform(); }
    else if (event.key === "+" || event.key === "=") { event.preventDefault(); zoom(1.25); }
    else if (event.key === "-") { event.preventDefault(); zoom(1 / 1.25); }
    else if (event.key === "Home") { event.preventDefault(); reset(); }
    else if (event.key === "Escape") { closeDetail(); }
  });
  listen(detail, "keydown", event => { if (event.key === "Escape") { event.preventDefault(); closeDetail(); } });
  listen(drawing, "pointerdown", event => { if (event.button !== 0) return; drag = { id: event.pointerId, x: event.clientX, y: event.clientY, initialX: transform.x, initialY: transform.y, moved: false }; });
  listen(drawing, "pointermove", event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) { drag.moved = true; drawing.setPointerCapture(event.pointerId); root.classList.add("is-dragging"); }
    if (drag.moved) { const bounds = drawing.getBoundingClientRect(); transform.x = drag.initialX + dx * width / bounds.width; transform.y = drag.initialY + dy * height / bounds.height; applyTransform(); }
  });
  function endDrag(event) { if (drag?.id !== event.pointerId) return; if (drawing.hasPointerCapture(event.pointerId)) drawing.releasePointerCapture(event.pointerId); root.classList.remove("is-dragging"); if (drag.moved) { event.preventDefault(); setTimeout(() => { drag = null; }, 0); } else drag = null; }
  listen(drawing, "pointerup", endDrag); listen(drawing, "pointercancel", endDrag);
  const resize = new ResizeObserver(() => {
    const bounds = drawing.getBoundingClientRect(); if (!bounds.width || !bounds.height) return;
    width = bounds.width; height = bounds.height; projection = null; drawing.setAttribute("viewBox", `0 0 ${width} ${height}`); render();
  }); resize.observe(viewport);
  render();
  return {
    update(value) {
      if (destroyed) return;
      const next = value?.schema === "simulation.observation-graph/1" ? value : { status: "unavailable", message: "Observation is unavailable." };
      const nextSignature = JSON.stringify(next);
      if (nextSignature === signature) return;
      signature = nextSignature; graph = next;
      nodes = graph.status === "available" && Array.isArray(graph.nodes) ? graph.nodes.slice(0, 128) : [];
      const ids = new Set(nodes.map(node => node.id));
      edges = graph.status === "available" && Array.isArray(graph.edges) ? graph.edges.slice(0, 256).filter(edge => ids.has(edge.from) && ids.has(edge.to)) : [];
      render();
    },
    destroy() { if (destroyed) return; destroyed = true; resize.disconnect(); for (const remove of listeners) remove(); root.remove(); },
  };
}
