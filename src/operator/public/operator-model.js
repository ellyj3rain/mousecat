export const OPERATOR_BATCH_BYTES = 224 * 1024;

// A deliberately small, text-only document grammar. Host content never becomes HTML.
// Supported: headings, paragraphs, lists, tables and explicit details/summary blocks.
export function renderDescription(document, value) {
  const root = document.createElement("div");
  root.className = "review-document";
  const lines = String(value || "").replaceAll("\r\n", "\n").split("\n");
  const parents = [root];
  const current = () => parents[parents.length - 1];
  function node(tag, text, parent = current()) {
    const element = document.createElement(tag);
    element.textContent = text;
    const references = /\[([^\]]+)\]\(mousecat:([^\s)]+)\)|\bskill-[a-f0-9]{16}\b|\b(?:[a-z][a-z0-9-]*:)*(?:plan-sha256|content-sha256):[a-f0-9]{64}\b|\b[a-f0-9]{64}\b|\b[a-f0-9]{40}\b/gu;
    if (typeof text === "string" && references.test(text)) {
      element.textContent = "";
      let offset = 0;
      references.lastIndex = 0;
      for (const match of text.matchAll(references)) {
        const before = document.createElement("span"); before.textContent = text.slice(offset, match.index); element.append(before);
        const link = document.createElement("a"); link.textContent = match[1] || match[0];
        link.href = "#history?" + new URLSearchParams({ ref: match[2] || match[0] });
        link.className = "inline-history-reference";
        element.append(link);
        offset = match.index + match[0].length;
      }
      const tail = document.createElement("span"); tail.textContent = text.slice(offset); element.append(tail);
    }
    parent.append(element);
    return element;
  }
  const cells = (line) => line.trim().replace(/^\|/u, "").replace(/\|$/u, "")
    .split(/(?<!\\)\|/u).map(cell => cell.trim().replaceAll("\\|", "|"));
  for (let i = 0; i < lines.length;) {
    const line = lines[i].trim();
    if (!line) { i += 1; continue; }
    if (line === "<details>" && /^<summary>.*<\/summary>$/u.test(lines[i + 1]?.trim() || "")) {
      const details = document.createElement("details");
      details.className = "review-document-details";
      current().append(details);
      node("summary", lines[i + 1].trim().slice(9, -10), details);
      parents.push(details);
      i += 2;
      continue;
    }
    if (line === "</details>" && parents.length > 1) { parents.pop(); i += 1; continue; }
    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (heading) { node("h5", heading[2]); i += 1; continue; }
    if (line.startsWith("|") && /^\|?[\s:|-]+\|?$/u.test(lines[i + 1]?.trim() || "")) {
      const table = document.createElement("table");
      const headers = cells(line);
      const tr = document.createElement("tr");
      const head = document.createElement("thead");
      for (const title of headers) { const th = node("th", title, tr); th.scope = "col"; }
      head.append(tr);
      table.append(head);
      const body = document.createElement("tbody");
      table.append(body);
      current().append(table);
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = document.createElement("tr");
        cells(lines[i]).forEach((cell, index) => {
          const td = node("td", cell, row);
          td.dataset.label = headers[index] || "";
        });
        body.append(row);
        i += 1;
      }
      continue;
    }
    const list = /^(?:[-*]\s+|\d+\.\s+)(.+)$/u.exec(line);
    if (list) {
      const ordered = /^\d/u.test(line);
      const container = document.createElement(ordered ? "ol" : "ul");
      current().append(container);
      const pattern = ordered ? /^\d+\.\s+(.+)$/u : /^[-*]\s+(.+)$/u;
      while (i < lines.length) {
        const match = pattern.exec(lines[i].trim());
        if (!match) break;
        node("li", match[1], container);
        i += 1;
      }
      continue;
    }
    const paragraph = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !/^(?:#{1,6}\s|[-*]\s|\d+\.\s|\||<details>|<\/details>)/u.test(lines[i].trim())) paragraph.push(lines[i++]);
    node("p", paragraph.join("\n"));
  }
  return root;
}

export function recordKey(...parts) {
  return JSON.stringify(parts.map((part) => String(part)));
}

export function reviewAttention(interactions = [], draftKeys = []) {
  const prepared = new Set(draftKeys);
  const entries = [];
  for (const interaction of interactions) {
    for (const item of interaction?.items || []) {
      if (!["open", "deferred"].includes(item?.status)) continue;
      const key = recordKey(interaction.interactionId, item.id);
      entries.push({ key, interactionId: interaction.interactionId,
        projectRef: interaction.projectRef || null, itemId: item.id,
        prepared: prepared.has(key) });
    }
  }
  return { waiting: entries.length, prepared: entries.filter(entry => entry.prepared).length,
    unprepared: entries.filter(entry => !entry.prepared).length, first: entries[0] || null };
}

export function shapeUsesOptionSelection(item) {
  return !["ranking", "parameter", "continuum"].includes(item?.shape);
}

export function resolveActiveSkillRef(controlPlane, interactions = []) {
  const skills = Array.isArray(controlPlane?.skills) ? controlPlane.skills : [];
  const raw = String(interactions[0]?.skillRef || "");
  if (skills.some((skill) => skill.id === raw)) return raw;
  const containing = skills
    .filter((skill) => raw.startsWith(`${skill.id}.`) || raw.startsWith(`${skill.id}/`))
    .sort((left, right) => right.id.length - left.id.length)[0];
  return containing?.id || skills.find((skill) => skill.active)?.id || null;
}

export function operatorCommandBodyBytes(commandId, values) {
  return new TextEncoder().encode(JSON.stringify({ commandId, values })).byteLength;
}

export function planResponseBatches(records, maxBytes = OPERATOR_BATCH_BYTES) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new RangeError("invalid-operator-batch-limit");
  const byInteraction = new Map();
  for (const record of records) {
    const interactionId = String(record.interactionId || "");
    if (!interactionId) throw new TypeError("missing-interaction-id");
    if (!byInteraction.has(interactionId)) byInteraction.set(interactionId, []);
    byInteraction.get(interactionId).push(record);
  }

  const batches = [];
  for (const [interactionId, interactionRecords] of byInteraction.entries()) {
    let responses = [];
    let keys = [];
    for (const record of interactionRecords) {
      const nextResponses = [...responses, record.response];
      const nextBytes = operatorCommandBodyBytes("respond", { interactionId, responses: nextResponses });
      if (nextBytes > maxBytes && responses.length > 0) {
        batches.push({ interactionId, responses, keys });
        responses = [];
        keys = [];
      }
      const singleBytes = operatorCommandBodyBytes("respond", { interactionId, responses: [record.response] });
      if (singleBytes > maxBytes) throw new RangeError("operator-response-exceeds-request-limit");
      responses.push(record.response);
      keys.push(record.key);
    }
    if (responses.length > 0) batches.push({ interactionId, responses, keys });
  }
  return batches;
}
