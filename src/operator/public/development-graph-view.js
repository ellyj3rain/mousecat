import { graphProjection, graphLayout, graphEdgePath, graphKindHue, wrapGraphLabel, NODE_WIDTH, NODE_HEIGHT, reconcileGraphFilters } from "/development-graph-model.js";

const SVG = "http://www.w3.org/2000/svg";
let sequence = 0;
function element(tag, text, parent, className) {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  if (className) value.className = className;
  parent?.append(value); return value;
}
function svg(tag, attrs, parent) {
  const value = document.createElementNS(SVG, tag);
  for (const [key, content] of Object.entries(attrs || {})) {
    if (key === "hue") value.style.setProperty("--kind-hue", content);
    else value.setAttribute(key, content);
  }
  parent?.append(value); return value;
}
function button(label, parent, action, className) {
  const value = element("button", label, parent, className); value.type = "button"; value.addEventListener("click", action); return value;
}
function field(parent, label, value) { element("dt", label, parent); element("dd", value, parent); }
function provenance(parent, sources) {
  const list = element("ul", undefined, parent, "development-graph-sources");
  for (const source of sources) element("li", [source.path || source.sourceRef, source.revision, source.locator].filter(Boolean).join(" · "), list);
}

// Sources are inert text. Camera, selection and layout never change the source graph.
export function createDevelopmentGraphView(container, { surfaceId, source, state = {}, projectLabel, backHref }) {
  const instance = ++sequence;
  const root = element("section", undefined, container, "development-graph");
  root.setAttribute("aria-label", "Development continuity");
  const header = element("header", undefined, root, "development-graph-header");
  const identity = element("div", undefined, header, "development-graph-identity");
  if (backHref) { const back = element("a", "← " + projectLabel, identity); back.href = backHref; }
  const title = element("h3", "Development continuity", identity);
  title.tabIndex = -1;
  const toolbar = element("div", undefined, header, "development-graph-toolbar");
  const refresh = button("Refresh graph", toolbar, () => load());
  const download = button("Download graph", toolbar, () => {
    if (!graph) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(graph, null, 2) + "\n"], { type: "application/json" }));
    const a = element("a"); a.href = url; a.download = "development-continuity.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
  download.disabled = true;
  const status = element("p", "Reading registered graph…", root, "development-graph-status"); status.setAttribute("role", "status");
  const body = element("div", undefined, root, "development-graph-body"); body.hidden = true;
  const filters = element("div", undefined, body, "development-graph-filters");
  function control(label, tag, parent = filters) {
    const wrapper = element("label", undefined, parent); element("span", label, wrapper);
    return element(tag, undefined, wrapper);
  }
  const viewSelect = control("View", "select");
  const search = control("Search continuity", "input"); search.type = "search"; search.value = state.query || ""; search.placeholder = "Find an idea, boundary or record…";
  const advanced = element("details", undefined, filters, "development-graph-advanced");
  const advancedSummary = element("summary", "Filters", advanced);
  const advancedBody = element("div", undefined, advanced, "development-graph-filter-options");
  const kindSelect = control("Node kind", "select", advancedBody), relationSelect = control("Relation", "select", advancedBody);
  const stage = element("div", undefined, body, "development-graph-stage");
  const viewport = element("div", undefined, stage, "development-graph-viewport"); viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", "Continuity canvas. Drag to pan, scroll or pinch to zoom. Arrow keys pan; Home fits the graph. Select a node to explore its connections.");
  const diagram = svg("svg", { role: "group", "aria-label": "Development continuity diagram" }, viewport);
  const empty = element("p", "No records match these filters.", viewport, "development-graph-empty"); empty.hidden = true;
  const lens = element("div", undefined, stage, "development-graph-lens");
  const counts = element("span", undefined, lens, "development-graph-counts");
  const clearFocus = button("Show full view", lens, () => {
    Object.assign(state, state.focusFilters || {}); state.focus = null; state.focusFilters = null;
    Object.assign(state, reconcileGraphFilters(graph, state)); syncControls(); render();
  }); clearFocus.hidden = true;
  const controls = element("div", undefined, stage, "development-graph-camera");
  const zoomOut = button("−", controls, () => zoom(.8)); zoomOut.setAttribute("aria-label", "Zoom out");
  const zoomText = element("output", "100%", controls); zoomText.setAttribute("aria-label", "Canvas zoom");
  const zoomIn = button("+", controls, () => zoom(1.25)); zoomIn.setAttribute("aria-label", "Zoom in");
  button("Fit", controls, () => fit()).setAttribute("aria-label", "Fit graph");
  const minimap = svg("svg", { class: "development-graph-minimap", role: "img", "aria-label": "Graph overview. Highlighted rectangle shows the current canvas area." }, stage);
  const detail = element("section", undefined, stage, "development-graph-detail"); detail.hidden = true;
  detail.setAttribute("aria-label", "Selected continuity record");
  const footer = element("footer", undefined, body, "development-graph-footer");
  const legend = element("div", undefined, footer, "development-graph-legend");
  const sourceDisclosure = element("details", undefined, footer, "development-graph-source");
  element("summary", "Source & revision", sourceDisclosure);
  const summaryBody = element("div", undefined, sourceDisclosure, "development-graph-source-body");
  const listDisclosure = element("details", undefined, footer, "development-graph-record-list");
  element("summary", "Record index", listDisclosure);
  const nodeList = element("ul", undefined, listDisclosure, "development-graph-records");
  let graph = null, abort = null, disposed = false, world = null, mapWindow = null, placement = null, projection = null;
  let camera = state.camera || { x: 0, y: 0, scale: 1 }, fitted = !state.camera, size = { width: 1, height: 1 };
  let nodeById = new Map(), nodeElements = new Map(), edgeElements = new Map(), request = 0;
  const pointers = new Map(); let gesture = null, dragged = false;

  function options(select, values, label, current) {
    select.replaceChildren();
    element("option", label, select).value = "";
    for (const value of values) element("option", value.label || value, select).value = value.id || value;
    select.value = current || "";
  }
  function syncControls() {
    search.value = state.query || ""; viewSelect.value = state.view || "";
    kindSelect.value = state.kind || ""; relationSelect.value = state.relation || "";
  }
  function applyCamera() {
    if (!world) return;
    world.setAttribute("transform", `translate(${camera.x} ${camera.y}) scale(${camera.scale})`);
    zoomText.value = Math.round(camera.scale * 100) + "%";
    diagram.dataset.zoom = camera.scale < .35 ? "overview" : "detail";
    state.camera = { ...camera };
    if (mapWindow) for (const [key, value] of Object.entries({ x: -camera.x / camera.scale, y: -camera.y / camera.scale, width: size.width / camera.scale, height: size.height / camera.scale })) mapWindow.setAttribute(key, value);
  }
  function fit() {
    if (!placement) return;
    const scale = Math.min(1.2, Math.max(.025, Math.min((size.width - 48) / placement.width, (size.height - 80) / placement.height)));
    camera = { scale, x: (size.width - placement.width * scale) / 2, y: (size.height - placement.height * scale) / 2 };
    fitted = true; applyCamera();
  }
  function zoom(factor, x = size.width / 2, y = size.height / 2) {
    const scale = Math.max(.025, Math.min(3, camera.scale * factor)), ratio = scale / camera.scale;
    camera = { scale, x: x - (x - camera.x) * ratio, y: y - (y - camera.y) * ratio };
    fitted = false; applyCamera();
  }
  function reveal(id) {
    const point = placement.positions.get(id); if (!point) return;
    const scale = Math.max(.85, camera.scale);
    const narrow = size.width <= 600;
    const available = detail.hidden || narrow ? size.width : size.width - detail.offsetWidth - 24;
    const height = !detail.hidden && narrow ? size.height - detail.offsetHeight - 24 : size.height;
    camera = { scale, x: available / 2 - (point.x + NODE_WIDTH / 2) * scale, y: height / 2 - (point.y + NODE_HEIGHT / 2) * scale };
    fitted = false; applyCamera();
  }
  function highlight() {
    const selectedValue = state.selected || (state.focus ? { kind: "node", id: state.focus } : null);
    const related = new Set();
    for (const edge of projection?.edges || []) {
      const active = selectedValue?.kind === "node" ? edge.from === selectedValue.id || edge.to === selectedValue.id : selectedValue?.id === edge.id;
      if (active) { related.add(edge.from); related.add(edge.to); }
      const item = edgeElements.get(edge.id);
      item.classList.toggle("is-connected", active);
      item.classList.toggle("is-selected", selectedValue?.kind === "edge" && selectedValue.id === edge.id);
      item.classList.toggle("is-muted", Boolean(selectedValue) && !active);
    }
    if (selectedValue?.kind === "node") related.add(selectedValue.id);
    for (const [id, item] of nodeElements) {
      const active = selectedValue?.kind === "node" && selectedValue.id === id;
      item.setAttribute("aria-pressed", String(active));
      item.setAttribute("tabindex", active || (!selectedValue && id === projection.nodes[0]?.id) ? "0" : "-1");
      item.classList.toggle("is-connected", related.has(id));
      item.classList.toggle("is-muted", Boolean(selectedValue) && !related.has(id));
    }
  }
  function closeDetail() {
    const last = state.selected;
    state.selected = null; detail.hidden = true; highlight();
    (nodeElements.get(last?.id) || viewport).focus({ preventScroll: true });
  }
  function selected(kind, id, focus = true) {
    state.selected = { kind, id }; renderDetail(focus); highlight();
    if (kind === "node") reveal(id);
  }
  function navigate(id) {
    if (!projection.nodes.some(node => node.id === id)) {
      state.query = ""; state.kind = ""; state.relation = ""; state.view = ""; state.focus = null;
      search.value = ""; kindSelect.value = ""; relationSelect.value = ""; viewSelect.value = "";
      render();
    }
    selected("node", id);
  }
  function renderDetail(focus = false) {
    detail.replaceChildren();
    const selectedValue = state.selected;
    const value = selectedValue?.kind === "node" ? nodeById.get(selectedValue.id)
      : selectedValue?.kind === "edge" ? graph.edges.find(item => item.id === selectedValue.id) : null;
    detail.hidden = !value;
    if (!value) { state.selected = null; return; }
    const heading = element("h4", value.label || value.relation, detail); heading.tabIndex = -1;
    button("Close details", detail, closeDetail, "development-graph-close");
    const facts = element("dl", undefined, detail);
    field(facts, "Identity", value.id);
    if (selectedValue.kind === "node") {
      field(facts, "Kind", value.kind);
      for (const [key, statusValue] of Object.entries(value.status)) field(facts, key, statusValue);
      element("p", value.summary, detail);
      button("Explore connections", detail, () => {
        state.focusFilters ||= { view: state.view, kind: state.kind, relation: state.relation, query: state.query };
        state.focus = value.id; state.selected = null; state.query = ""; state.view = ""; state.kind = ""; state.relation = "";
        syncControls();
        render(); viewport.focus({ preventScroll: true });
      }, "development-graph-explore");
      if (value.tags.length) field(facts, "Tags", value.tags.join(", "));
      for (const [key, label] of [["recordedStatus", "Recorded status"], ["measuredStatusNote", "Measured status note"],
        ["ownerPath", "Owner reference"], ["archiveRef", "Archive reference"], ["archivePath", "Archive path"],
        ["blobRevision", "Blob revision"], ["recordedAt", "Recorded at"], ["inputs", "Inputs"],
        ["outputs", "Outputs"], ["state", "Durable state"], ["remaining", "Remaining work"]]) {
        if (value[key] !== undefined) field(facts, label, Array.isArray(value[key]) ? value[key].join("\n") : value[key]);
      }
      if (value.proofApplicability) {
        field(facts, "Production pins match", String(value.proofApplicability.productionPinsMatch));
        field(facts, "Pin count", String(value.proofApplicability.pinCount));
      }
      provenance(detail, value.sources);
      for (const media of value.mediaRefs || []) element("p", [media.kind, media.label, media.href, media.mimeType].filter(Boolean).join(" · "), detail, "development-graph-media-ref");
      const relationships = graph.edges.filter(edge => edge.from === value.id || edge.to === value.id);
      element("h5", "Relationships", detail);
      element("p", relationships.length + " recorded relationships", detail);
      for (const edge of relationships.slice(0, 200)) {
        const row = element("div", undefined, detail, "development-graph-relationship");
        button(edge.relation, row, () => selected("edge", edge.id));
        const other = edge.from === value.id ? edge.to : edge.from;
        button((edge.from === value.id ? "→ " : "← ") + (nodeById.get(other)?.label || other), row, () => navigate(other));
      }
      if (relationships.length > 200) element("p", "First 200 shown; download the graph for all relationships.", detail);
    } else {
      field(facts, "Evidence class", value.evidenceClass);
      button("From: " + value.from, detail, () => navigate(value.from));
      button("To: " + value.to, detail, () => navigate(value.to));
      element("p", value.rationale, detail); provenance(detail, value.provenance);
    }
    detail.scrollTop = 0;
    if (focus) heading.focus({ preventScroll: true });
  }
  function render(preserveCamera = false) {
    if (!graph || disposed) return;
    projection = graphProjection(graph, state);
    advancedSummary.textContent = "Filters" + (state.kind || state.relation ? " · " + [state.kind, state.relation].filter(Boolean).length : "");
    if (state.selected && !(state.selected.kind === "node" ? projection.nodes : projection.edges).some(item => item.id === state.selected.id)) state.selected = null;
    counts.textContent = projection.nodes.length + " nodes · " + projection.edges.length + " connections";
    counts.title = "Source: " + graph.nodes.length + " nodes, " + graph.edges.length + " connections";
    clearFocus.hidden = !state.focus;
    clearFocus.textContent = "← Full view";
    clearFocus.title = state.focus ? "Connections of " + (nodeById.get(state.focus)?.label || state.focus) : "";
    empty.hidden = projection.nodes.length > 0;
    diagram.replaceChildren(); nodeList.replaceChildren(); legend.replaceChildren(); minimap.replaceChildren();
    nodeElements = new Map(); edgeElements = new Map();
    // A stable landscape survives camera movement and selection.
    placement = graphLayout(projection.nodes, Math.max(1, size.width / size.height));
    const defs = svg("defs", {}, diagram), marker = svg("marker", { id: "continuity-arrow-" + instance, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "5", markerHeight: "5", orient: "auto-start-reverse" }, defs);
    svg("path", { d: "M0 0 L10 5 L0 10 z", fill: "context-stroke" }, marker);
    world = svg("g", { class: "development-graph-world" }, diagram);
    minimap.setAttribute("viewBox", `0 0 ${placement.width} ${placement.height}`);
    for (const region of placement.groups) {
      const group = svg("g", { class: "development-graph-region", hue: graphKindHue(region.kind) }, world);
      svg("rect", { x: region.x, y: region.y, width: region.width, height: region.height, rx: 20 }, group);
      svg("text", { x: region.x + 24, y: region.y + 31 }, group).textContent = region.kind.toUpperCase() + "  /  " + region.count;
      const key = element("span", region.kind + " · " + region.count, legend); key.style.setProperty("--kind-hue", graphKindHue(region.kind));
    }
    for (const edge of projection.edges) {
      const a = placement.positions.get(edge.from), b = placement.positions.get(edge.to);
      const group = svg("g", { role: "button", tabindex: "-1", "aria-label": edge.relation + ": " + edge.from + " to " + edge.to, class: "development-graph-edge", "data-edge-id": edge.id }, world);
      const path = graphEdgePath(a, b), pathId = "continuity-path-" + instance + "-" + edgeElements.size;
      svg("path", { d: path, class: "development-graph-edge-hit" }, group);
      svg("path", { id: pathId, d: path, class: "development-graph-edge-line", "marker-end": "url(#continuity-arrow-" + instance + ")" }, group);
      const label = svg("text", { class: "development-graph-edge-label", dy: "-6" }, group);
      svg("textPath", { href: "#" + pathId, startOffset: "50%", "text-anchor": "middle" }, label).textContent = edge.relation;
      svg("title", {}, group).textContent = edge.relation + " · " + edge.evidenceClass;
      group.addEventListener("click", () => { if (!dragged) selected("edge", edge.id); });
      group.addEventListener("keydown", event => {
        if (["Enter", " "].includes(event.key)) { event.preventDefault(); event.stopPropagation(); selected("edge", edge.id); }
      });
      edgeElements.set(edge.id, group);
    }
    for (const node of projection.nodes) {
      const p = placement.positions.get(node.id), hue = graphKindHue(node.kind);
      const group = svg("g", { transform: `translate(${p.x} ${p.y})`, role: "button", "aria-label": node.label + " · " + node.kind,
        class: "development-graph-node", "data-node-id": node.id, hue }, world);
      svg("rect", { width: NODE_WIDTH, height: NODE_HEIGHT, rx: 10, class: "development-graph-node-card" }, group);
      svg("rect", { x: 0, y: 15, width: 4, height: NODE_HEIGHT - 30, rx: 2, class: "development-graph-node-accent" }, group);
      for (const [i, line] of wrapGraphLabel(node.label).entries()) svg("text", { x: 16, y: 24 + i * 18, class: "development-graph-node-label" }, group).textContent = line;
      svg("circle", { cx: 20, cy: 64, r: 3, class: "development-graph-node-accent" }, group);
      svg("text", { x: 29, y: 68, class: "development-graph-node-status" }, group).textContent = node.status.implementation.slice(0, 34);
      svg("title", {}, group).textContent = node.label + "\n" + node.summary;
      group.addEventListener("click", () => { if (!dragged) selected("node", node.id); });
      group.addEventListener("keydown", event => {
        if (["Enter", " "].includes(event.key)) { event.preventDefault(); event.stopPropagation(); selected("node", node.id); }
        if (event.key.startsWith("Arrow")) {
          event.preventDefault(); event.stopPropagation();
          const direction = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[event.key];
          const next = projection.nodes.filter(item => item.id !== node.id).map(item => {
            const q = placement.positions.get(item.id), dx = q.x - p.x, dy = q.y - p.y;
            return { id: item.id, forward: dx * direction[0] + dy * direction[1], distance: Math.hypot(dx, dy) + Math.abs(dx * direction[1] - dy * direction[0]) * 3 };
          }).filter(item => item.forward > 0).sort((a, b) => a.distance - b.distance)[0];
          if (next) { reveal(next.id); nodeElements.get(next.id).focus({ preventScroll: true }); }
        }
      });
      nodeElements.set(node.id, group);
      svg("rect", { x: p.x, y: p.y, width: NODE_WIDTH, height: NODE_HEIGHT, hue }, minimap);
      button(node.label + " · " + node.kind, element("li", undefined, nodeList), () => navigate(node.id));
    }
    mapWindow = svg("rect", { class: "development-graph-map-window" }, minimap);
    renderDetail(); highlight();
    if (preserveCamera) applyCamera(); else fit();
  }
  const observer = new ResizeObserver(() => {
    size = { width: viewport.clientWidth, height: viewport.clientHeight };
    diagram.setAttribute("viewBox", `0 0 ${Math.max(1, size.width)} ${Math.max(1, size.height)}`);
    if (fitted) fit(); else applyCamera();
  });
  observer.observe(viewport);
  viewport.addEventListener("wheel", event => {
    event.preventDefault(); const box = viewport.getBoundingClientRect();
    zoom(Math.exp(-Math.max(-200, Math.min(200, event.deltaY)) * .003), event.clientX - box.left, event.clientY - box.top);
  }, { passive: false });
  viewport.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) { dragged = false; gesture = { start: { x: event.clientX, y: event.clientY }, x: camera.x, y: camera.y }; }
    if (pointers.size === 2) gesture = null;
    // Capture on the hit target so a tap still reaches the node's click handler.
    event.target.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId)) return;
    const before = [...pointers.values()];
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = [...pointers.values()];
    if (pointers.size === 2) {
      const distance = points => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const box = viewport.getBoundingClientRect();
      zoom(distance(after) / Math.max(1, distance(before)), (before[0].x + before[1].x) / 2 - box.left, (before[0].y + before[1].y) / 2 - box.top);
      camera.x += (after[0].x + after[1].x - before[0].x - before[1].x) / 2;
      camera.y += (after[0].y + after[1].y - before[0].y - before[1].y) / 2;
      dragged = true; applyCamera();
    } else if (gesture) {
      const dx = event.clientX - gesture.start.x, dy = event.clientY - gesture.start.y;
      if (Math.hypot(dx, dy) > 4) dragged = true;
      if (dragged) { camera.x = gesture.x + dx; camera.y = gesture.y + dy; fitted = false; applyCamera(); }
    }
  });
  function release(event) {
    pointers.delete(event.pointerId);
    const point = [...pointers.values()][0];
    gesture = point ? { start: point, x: camera.x, y: camera.y } : null;
  }
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) viewport.addEventListener(type, release);
  viewport.addEventListener("click", event => { if (!dragged && !event.target.closest(".development-graph-node, .development-graph-edge")) closeDetail(); });
  root.addEventListener("keydown", event => {
    if (event.key === "Escape" && !detail.hidden && !event.target.closest("input, select, textarea")) { event.preventDefault(); closeDetail(); }
  });
  viewport.addEventListener("keydown", event => {
    if (event.key === "Home") { event.preventDefault(); fit(); }
    if (["+", "=", "-"].includes(event.key)) { event.preventDefault(); zoom(event.key === "-" ? .8 : 1.25); }
    const offset = { ArrowRight: [-60, 0], ArrowLeft: [60, 0], ArrowDown: [0, -60], ArrowUp: [0, 60] }[event.key];
    if (offset) { event.preventDefault(); camera.x += offset[0]; camera.y += offset[1]; fitted = false; applyCamera(); }
  });
  minimap.addEventListener("click", event => {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(minimap.getScreenCTM().inverse());
    camera.x = size.width / 2 - point.x * camera.scale; camera.y = size.height / 2 - point.y * camera.scale;
    fitted = false; applyCamera();
  });
  async function load() {
    abort?.abort(); abort = new AbortController(); const generation = ++request;
    refresh.disabled = true; status.textContent = "Reading registered graph…"; root.dataset.loaded = "false";
    try {
      const response = await fetch("/api/project-graphs/" + encodeURIComponent(surfaceId) + "/" + encodeURIComponent(source), { signal: abort.signal });
      const result = await response.json();
      if (disposed || generation !== request) return;
      if (!response.ok || !result.ok) throw new Error(result.code || "development-graph-source-unavailable");
      const first = !graph; graph = result.graph; body.hidden = false; download.disabled = false;
      root.dataset.loaded = "true"; title.textContent = graph.label || "Development continuity";
      nodeById = new Map(graph.nodes.map(node => [node.id, node]));
      if (!Object.hasOwn(state, "view")) state.view = graph.views[0]?.id || "";
      Object.assign(state, reconcileGraphFilters(graph, state));
      if (!nodeById.has(state.focus)) state.focus = null;
      status.textContent = "Source revision: " + graph.revision;
      options(viewSelect, graph.views, "All views", state.view);
      options(kindSelect, [...new Set(graph.nodes.map(node => node.kind))].sort(), "All node kinds", state.kind);
      options(relationSelect, [...new Set(graph.edges.map(edge => edge.relation))].sort(), "All relations", state.relation);
      summaryBody.replaceChildren(); element("p", graph.revision, summaryBody); provenance(summaryBody, graph.sourceVector);
      size = { width: viewport.clientWidth, height: viewport.clientHeight };
      render(first && Boolean(state.camera));
    } catch (error) {
      if (disposed || generation !== request || error.name === "AbortError") return;
      graph = null; body.hidden = true; download.disabled = true;
      status.textContent = "Graph unavailable. " + (String(error.message).startsWith("development-graph-") || error.message === "invalid-development-graph" ? error.message : "Refresh to retry.");
    } finally { if (!disposed && generation === request) refresh.disabled = false; }
  }
  for (const [control, key] of [[search, "query"], [viewSelect, "view"], [kindSelect, "kind"], [relationSelect, "relation"]]) {
    control.addEventListener(control === search ? "input" : "change", () => { state[key] = control.value; state.focus = null; state.focusFilters = null; render(); });
  }
  load();
  return { state, destroy() { disposed = true; abort?.abort(); observer.disconnect(); root.remove(); } };
}
