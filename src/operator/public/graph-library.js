import { registeredGraphs } from "/project-model.js";
import { graphProjection, graphLayout, graphEdgePath, graphKindHue, NODE_WIDTH, NODE_HEIGHT } from "/development-graph-model.js";

function element(tag, text, parent, className) {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  if (className) value.className = className;
  parent?.append(value); return value;
}
function svg(tag, attrs, parent) {
  const value = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, content] of Object.entries(attrs)) value.setAttribute(key, content);
  parent.append(value); return value;
}
function preview(parent, graph) {
  const projection = graphProjection(graph, { view: graph.views[0]?.id || "" });
  const nodes = projection.nodes.slice(0, 160), layout = graphLayout(nodes, 1.9);
  const image = svg("svg", { viewBox: `0 0 ${layout.width} ${layout.height}`, "aria-hidden": "true", focusable: "false" }, parent);
  for (const edge of projection.edges) {
    const a = layout.positions.get(edge.from), b = layout.positions.get(edge.to);
    if (a && b) svg("path", { d: graphEdgePath(a, b), class: "graph-library-edge" }, image);
  }
  for (const node of nodes) {
    const p = layout.positions.get(node.id);
    svg("rect", { x: p.x, y: p.y, width: NODE_WIDTH, height: NODE_HEIGHT, rx: 12,
      fill: `hsl(${graphKindHue(node.kind)} 48% 40%)`, stroke: `hsl(${graphKindHue(node.kind)} 65% 72%)`, "stroke-width": 4 }, image);
  }
  if (!nodes.length) element("span", "No nodes in the opening view", parent);
  else if (projection.nodes.length > nodes.length) element("span", `Preview: ${nodes.length} of ${projection.nodes.length} nodes in this view`, parent, "graph-library-preview-note");
}

export function installGraphLibrary(root) {
  const header = element("header", undefined, root, "graph-library-header");
  const heading = element("h2", "Graphs", header); heading.tabIndex = -1;
  const refresh = element("button", "Refresh graphs", header, "button secondary-button"); refresh.type = "button";
  const searchLabel = element("label", "Find a graph", header, "graph-library-search");
  const search = element("input", undefined, searchLabel); search.type = "search"; search.placeholder = "Graph or project";
  const count = element("p", "", header, "graph-library-count"); count.setAttribute("role", "status");
  const grid = element("div", undefined, root, "graph-library-grid");
  const empty = element("p", "", root, "graph-library-empty"); empty.hidden = true;
  let active = false, signature = "", generation = 0, observer = null, cards = [], latestSnapshot = null;
  let queue = [], running = 0;
  const requests = new Set();

  function stop() {
    generation++; observer?.disconnect(); observer = null;
    for (const request of requests) request.abort();
    requests.clear(); queue = []; running = 0;
  }
  function pump(epoch) {
    while (active && epoch === generation && running < 3 && queue.length) {
      const card = queue.shift(); running++;
      const request = new AbortController(); requests.add(request);
      const timer = setTimeout(() => request.abort(), 10000);
      const { entry, picture, detail } = card;
      fetch(`/api/project-graphs/${encodeURIComponent(entry.surfaceId)}/${encodeURIComponent(entry.source)}`, { signal: request.signal })
        .then(async response => {
          if (!response.ok) throw new Error("unavailable");
          const result = await response.json();
          if (!result.ok || result.graph?.projectRef !== entry.projectRef) throw new Error("unavailable");
          if (!active || epoch !== generation) return;
          picture.replaceChildren(); preview(picture, result.graph);
          detail.textContent = `${result.graph.nodes.length.toLocaleString()} nodes · ${result.graph.edges.length.toLocaleString()} connections`;
        }).catch(() => {
          if (!active || epoch !== generation) return;
          picture.replaceChildren(); element("span", "Preview unavailable", picture);
          detail.textContent = "Open graph for source status";
        }).finally(() => {
          clearTimeout(timer); requests.delete(request);
          if (epoch === generation) { running--; pump(epoch); }
        });
    }
  }
  function filter() {
    const words = search.value.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
    let shown = 0;
    for (const card of cards) {
      card.link.hidden = !words.every(word => `${card.entry.label} ${card.entry.projectLabel} ${card.entry.surfaceId} ${card.entry.source}`.toLocaleLowerCase().includes(word));
      if (!card.link.hidden) shown++;
    }
    count.textContent = `${shown} graph${shown === 1 ? "" : "s"}`;
    empty.hidden = shown > 0;
    empty.textContent = cards.length ? "No graphs match your search." : "No registered graphs yet.";
  }
  search.addEventListener("input", filter);
  refresh.addEventListener("click", () => {
    if (active && latestSnapshot) { signature = ""; controller.update(latestSnapshot, true); }
  });
  const controller = {
    update(snapshot, visible) {
      latestSnapshot = snapshot;
      if (!visible) { if (active) { active = false; stop(); signature = ""; } return; }
      const entering = !active; active = true;
      const entries = registeredGraphs(snapshot), next = JSON.stringify(entries);
      if (next === signature) return;
      signature = next;
      const focusedId = document.activeElement?.closest(".graph-library-card")?.dataset.graphId;
      stop(); const epoch = generation;
      grid.replaceChildren(); cards = [];
      observer = new IntersectionObserver(items => {
        if (epoch !== generation || !active) return;
        for (const item of items) if (item.isIntersecting) {
          observer.unobserve(item.target);
          const card = cards.find(value => value.link === item.target);
          if (card?.entry.exists) queue.push(card);
        }
        pump(epoch);
      }, { root, rootMargin: "100px" });
      const duplicates = new Map();
      for (const entry of entries) {
        const key = JSON.stringify([entry.projectRef, entry.label]);
        duplicates.set(key, (duplicates.get(key) || 0) + 1);
      }
      for (const entry of entries) {
        const link = element("a", undefined, grid, "graph-library-card"); link.href = entry.href; link.dataset.graphId = entry.id;
        const picture = element("div", undefined, link, "graph-library-preview");
        element("span", entry.exists ? "Loading preview…" : "Source unavailable", picture);
        const description = element("div", undefined, link, "graph-library-description");
        element("span", entry.projectLabel, description, "graph-library-project");
        element("h3", entry.label, description);
        if (duplicates.get(JSON.stringify([entry.projectRef, entry.label])) > 1) element("span", `${entry.surfaceId} · ${entry.source}`, description, "graph-library-source");
        const detail = element("span", entry.exists ? "" : "Open graph for source status", description, "graph-library-meta");
        cards.push({ entry, link, picture, detail });
      }
      filter();
      for (const card of cards) observer.observe(card.link);
      if (entering) heading.focus({ preventScroll: true });
      else if (focusedId) (cards.find(card => card.entry.id === focusedId)?.link || heading).focus({ preventScroll: true });
    },
  };
  return controller;
}
