export const NODE_WIDTH = 248;
export const NODE_HEIGHT = 82;
const LABEL_ORDER = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function reconcileGraphFilters(graph, state) {
  const valid = {
    view: new Set(graph.views.map(item => item.id)),
    kind: new Set(graph.nodes.map(item => item.kind)),
    relation: new Set(graph.edges.map(item => item.relation)),
  };
  return Object.fromEntries(Object.entries(valid).map(([key, values]) => [key, values.has(state[key]) ? state[key] : ""]));
}

// Filtering and layout are views over supplied identities, never semantic inference.
export function graphProjection(graph, { query = "", view = "", kind = "", relation = "", focus = null } = {}) {
  const selectedView = graph.views.find(item => item.id === view);
  const kinds = selectedView?.nodeKinds || [], relations = selectedView?.relations || [];
  const words = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  let nodes = graph.nodes.filter(node => (!kind || node.kind === kind)
    && (!kinds.length || kinds.includes(node.kind))
    && words.every(word => [node.id, node.label, node.summary, node.kind, ...node.tags, ...Object.values(node.status)]
      .join(" ").toLocaleLowerCase().includes(word)));
  if (focus) {
    const neighbours = new Set([focus]);
    for (const edge of graph.edges) if ((!relation || edge.relation === relation) && (!relations.length || relations.includes(edge.relation))) {
      if (edge.from === focus) neighbours.add(edge.to);
      if (edge.to === focus) neighbours.add(edge.from);
    }
    nodes = nodes.filter(node => neighbours.has(node.id));
  }
  nodes.sort((a, b) => LABEL_ORDER.compare(a.label, b.label) || LABEL_ORDER.compare(a.id, b.id));
  const ids = new Set(nodes.map(node => node.id));
  const edges = graph.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to)
    && (!relation || edge.relation === relation) && (!relations.length || relations.includes(edge.relation)));
  return { nodes, edges, matchingNodes: nodes.length, matchingEdges: edges.length };
}

// Groups name supplied kinds; placement does not infer hierarchy or importance.
// All matching records occupy one navigable space, without pagination seams.
export function graphLayout(nodes, aspect = 1.8) {
  const preferred = ["era", "raw-record", "batch", "source-record", "contract", "extension", "concept", "owner", "interface", "branch", "commit"];
  const kinds = [...new Set(nodes.map(node => node.kind))].sort((a, b) => {
    const ai = preferred.indexOf(a), bi = preferred.indexOf(b);
    return (ai < 0 ? preferred.length : ai) - (bi < 0 ? preferred.length : bi) || LABEL_ORDER.compare(a, b);
  });
  const positions = new Map(), groups = [];
  const stepX = NODE_WIDTH + 32, stepY = NODE_HEIGHT + 32;
  const target = Math.max(stepX * 2, Math.sqrt(Math.max(1, nodes.length) * stepX * stepY * Math.max(.6, Math.min(3, aspect))));
  let x = 24, y = 48, rowHeight = 0, width = 0;
  for (const kind of kinds) {
    const members = nodes.filter(node => node.kind === kind);
    const columns = Math.max(1, Math.min(members.length, Math.ceil((target - 32) / stepX)));
    const groupWidth = columns * stepX + 16, groupHeight = Math.ceil(members.length / columns) * stepY + 64;
    if (x > 24 && members.length > 2 && x + groupWidth > target + stepX) { x = 24; y += rowHeight + 40; rowHeight = 0; }
    groups.push({ kind, x, y, width: groupWidth, height: groupHeight, count: members.length });
    members.forEach((node, i) => positions.set(node.id, { x: x + 24 + (i % columns) * stepX, y: y + 56 + Math.floor(i / columns) * stepY }));
    width = Math.max(width, x + groupWidth + 24); x += groupWidth + 40; rowHeight = Math.max(rowHeight, groupHeight);
  }
  return { positions, kinds, groups, width: Math.max(520, width), height: Math.max(260, y + rowHeight + 24) };
}

export function graphEdgePath(a, b) {
  const horizontal = Math.abs(b.x - a.x) >= NODE_WIDTH / 2;
  if (horizontal) {
    const right = b.x > a.x, x1 = a.x + (right ? NODE_WIDTH : 0), x2 = b.x + (right ? 0 : NODE_WIDTH);
    const y1 = a.y + NODE_HEIGHT / 2, y2 = b.y + NODE_HEIGHT / 2;
    const bend = Math.max(45, Math.abs(x2 - x1) * .5) * (right ? 1 : -1);
    return `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`;
  }
  const down = b.y > a.y, x1 = a.x + NODE_WIDTH * .72, x2 = b.x + NODE_WIDTH * .72;
  const y1 = a.y + (down ? NODE_HEIGHT : 0), y2 = b.y + (down ? 0 : NODE_HEIGHT);
  const bend = Math.max(45, Math.abs(y2 - y1) * .4) * (down ? 1 : -1);
  return `M${x1},${y1} C${x1 + 65},${y1 + bend} ${x2 + 65},${y2 - bend} ${x2},${y2}`;
}

export function graphKindHue(kind) {
  const fixed = { contract: 167, extension: 43, batch: 215, "source-record": 211, "raw-record": 248,
    concept: 282, owner: 31, interface: 192, branch: 317, commit: 235, era: 45 };
  return fixed[kind] ?? [...kind].reduce((value, char) => (value * 31 + char.charCodeAt(0)) % 360, 0);
}

export function wrapGraphLabel(label, width = 32, maxLines = 2) {
  const words = label.split(/\s+/u), lines = [];
  let line = "";
  for (const word of words) {
    if (line && line.length + word.length + 1 > width) { lines.push(line); line = ""; }
    line += (line ? " " : "") + word;
  }
  if (line) lines.push(line);
  const result = lines.slice(0, maxLines).map(value => value.length > width ? value.slice(0, width - 1) + "…" : value);
  if (lines.length > maxLines) result[result.length - 1] = result.at(-1).slice(0, width - 1) + "…";
  return result;
}

