import { renderDescription } from "/operator-model.js";

export function installHistory() {
  const dialog = document.querySelector("#history-dialog");
  const list = document.querySelector("#history-results");
  const reader = document.querySelector("#history-reader");
  const status = document.querySelector("#history-status");
  const form = document.querySelector("#history-search");
  let request = 0;
  let controller;
  let returnHash = "";
  let renderedRoute = "";
  let selectedRef = "";
  const viewStates = new Map();
  function captureView() {
    if (renderedRoute) viewStates.set(renderedRoute, {
      reader: reader.scrollTop, list: list.scrollTop,
      disclosures: [...reader.querySelectorAll("details")].map(details => details.open)
    });
  }
  function restoreView(route) {
    const saved = viewStates.get(route);
    if (!saved) return;
    [...reader.querySelectorAll("details")].forEach((details, index) => { details.open = Boolean(saved.disclosures[index]); });
    reader.scrollTop = saved.reader;
    list.scrollTop = saved.list;
  }
  function element(tag, text, parent) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (parent) parent.append(node);
    return node;
  }
  function link(parent, title, ref, revision) {
    const node = element("a", title, parent);
    const params = new URLSearchParams({ ref });
    if (revision) params.set("revision", revision);
    node.href = "#history?" + params.toString();
    return node;
  }
  function route(params = new URLSearchParams()) {
    if (!location.hash.startsWith("#history")) returnHash = location.hash;
    location.hash = "history?" + params.toString();
  }
  function fillFacet(name, values, chosen) {
    const select = form.elements.namedItem(name);
    select.replaceChildren();
    const all = element("option", "All " + name + "s", select); all.value = "";
    for (const value of values) { const option = element("option", value, select); option.value = value; }
    select.value = chosen || "";
  }
  function drawRecord(result) {
    reader.replaceChildren();
    if (!result.ok) {
      const title = element("h3", result.status === "ambiguous" ? "Several records match this reference" : "Reference not indexed", reader);
      title.tabIndex = -1;
      element("p", "The reference is preserved. Its source may be missing, unregistered or outside the indexed coverage.", reader);
      for (const ref of result.candidates || []) link(reader, ref, ref);
      return;
    }
    const r = result.record;
    const meta = element("p", [r.kind, r.standing, r.project, r.date?.slice(0, 10)].filter(Boolean).join(" · "), reader);
    meta.className = "history-meta";
    const title = element("h3", r.title, reader); title.tabIndex = -1;
    if (result.currentRevision !== r.revision) element("p", "Viewing an earlier revision. The current record is available in the revision selector.", reader).className = "history-notice";
    const revisions = element("label", "Revision ", reader);
    const select = element("select", undefined, revisions); select.setAttribute("aria-label", "Record revision");
    for (const v of result.revisions.slice().reverse()) {
      const option = element("option", (v.indexedAt || v.date || "").replace("T", " ").slice(0, 19) + " · " + v.standing + " · " + v.revision.slice(0, 8), select);
      option.value = v.revision;
    }
    select.value = r.revision;
    select.addEventListener("change", () => route(new URLSearchParams({ ref: r.ref, revision: select.value })));
    const jump = element("button", "Explore connections (" + result.links.length + ") and backlinks (" + result.backlinks.length + ")", reader);
    jump.type = "button";
    jump.className = "history-jump";
    let connectionsHeading;
    jump.addEventListener("click", () => connectionsHeading.scrollIntoView({ block: "start" }));
    for (const item of r.items || []) {
      if (!item.response) continue;
      const response = item.response;
      const chosen = response.selectedOptions?.length ? response.selectedOptions : response.selectedOption ? [response.selectedOption] : [];
      element("h4", "Recorded answer", reader);
      const names = chosen.map(value => item.options?.find(option => option.value === value)?.label || String(value));
      element("p", names.length ? names.join("; ") : typeof response.value === "string" ? response.value : JSON.stringify(response.value), reader);
      if (response.notes) element("p", response.notes, reader);
    }
    if (r.method) {
      for (const [key, title] of [["purpose", "Purpose"], ["applicability", "Where this applies"], ["procedure", "Procedure"], ["failures", "Known failures and limits"]]) {
        element("h4", title, reader);
        element("p", r.method[key], reader).className = "history-method-copy";
      }
    }
    if (r.source?.kind === "file" && /\.jsonl?$/iu.test(r.source.path || "")) {
      const original = element("details", undefined, reader);
      element("summary", "Read original source data", original);
      element("pre", r.body, original);
    } else {
      const body = renderDescription(document, r.body);
      const headings = [...body.querySelectorAll("h5")];
      if (headings.length >= 2) {
        const outline = element("details", undefined, reader); outline.className = "history-outline";
        element("summary", "In this record", outline);
        const nav = element("nav", undefined, outline); nav.setAttribute("aria-label", "Record sections");
        for (const heading of headings) {
          const jump = element("button", heading.textContent, nav); jump.type = "button";
          jump.addEventListener("click", () => {
            for (let parent = heading.parentElement; parent && parent !== body; parent = parent.parentElement) {
              if (parent.tagName === "DETAILS") parent.open = true;
            }
            heading.tabIndex = -1;
            heading.scrollIntoView({ block: "start" }); heading.focus({ preventScroll: true });
          });
        }
      }
      reader.append(body);
    }
    connectionsHeading = element("h4", "Connected records", reader);
    if (!result.links.length) element("p", "No outgoing relationships recorded.", reader);
    for (const edge of result.links) {
      const row = element("div", undefined, reader); row.className = "history-relationship";
      element("span", edge.relation.replaceAll("-", " ") + " → ", row);
      link(row, edge.title || edge.target, edge.ref || edge.target, edge.revision);
      element("small", edge.basis + (edge.status === "resolved" ? "" : " · " + edge.status), row);
    }
    element("h4", "Referenced by", reader);
    if (!result.backlinks.length) element("p", "No incoming relationships indexed.", reader);
    for (const edge of result.backlinks) {
      const row = element("div", undefined, reader); row.className = "history-relationship";
      link(row, edge.title, edge.ref);
      element("small", edge.relation.replaceAll("-", " ") + " · " + edge.basis, row);
    }
    const provenance = element("details", undefined, reader);
    element("summary", "Source and identity", provenance);
    element("pre", JSON.stringify({ ref: r.ref, revision: r.revision, source: r.source, coverage: result.coverage }, null, 2), provenance);
    if (result.coverage && result.coverage.status !== "indexed") element("p", "Source currently " + result.coverage.status + "; this is a retained indexed revision.", reader).className = "history-notice";
    reader.scrollTop = 0;
  }
  async function render() {
    const listFocus = list.contains(document.activeElement) ? document.activeElement.getAttribute("href") : null;
    captureView();
    renderedRoute = "";
    const currentRoute = location.hash;
    const current = ++request;
    controller?.abort();
    controller = new AbortController();
    if (!location.hash.startsWith("#history")) { if (dialog.open) dialog.close(); return; }
    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    if (!dialog.open) dialog.showModal();
    status.textContent = "Loading history…";
    reader.replaceChildren();
    element("p", "Loading the selected record…", reader);
    for (const name of ["query", "from", "to"]) form.elements.namedItem(name).value = params.get(name) || "";
    try {
      const listParams = new URLSearchParams(params); listParams.delete("ref"); listParams.delete("revision");
      const listResponse = await fetch("/api/history?" + listParams, { signal: controller.signal });
      const results = await listResponse.json();
      if (current !== request) return;
      if (!results.ok) throw new Error(results.code || "History unavailable");
      for (const name of ["kind", "project", "standing"]) fillFacet(name, results.facets[name === "kind" ? "kinds" : name === "project" ? "projects" : "standings"], params.get(name));
      list.replaceChildren();
      status.textContent = results.total + " records match · " + results.coverage.filter(s => s.status === "indexed").length + " sources indexed";
      for (const item of results.records) {
        const row = element("article", undefined, list);
        const a = link(row, item.title, item.ref);
        const targetParams = new URLSearchParams(params); targetParams.set("ref", item.ref); targetParams.delete("revision");
        a.href = "#history?" + targetParams.toString();
        if (item.ref === params.get("ref")) a.setAttribute("aria-current", "page");
        element("small", [item.kind, item.standing, item.project, item.date?.slice(0, 10)].filter(Boolean).join(" · "), row);
      }
      if (!results.records.length) element("p", "No matching records in the indexed history.", list);
      const page = element("div", undefined, list); page.className = "history-pagination";
      for (const [label, offset] of [["Previous", results.offset - results.limit], ["Next", results.offset + results.limit]]) {
        if (offset < 0 || offset >= results.total) continue;
        const button = element("button", label, page); button.type = "button";
        button.addEventListener("click", () => { const p = new URLSearchParams(params); p.set("offset", String(offset)); route(p); });
      }
      const coverage = element("details", undefined, list);
      element("summary", "Index coverage", coverage);
      element("p", results.scope, coverage);
      for (const source of results.coverage) element("p", source.path + " · " + source.status + (source.reason ? " · " + source.reason : ""), coverage);
      if (params.has("ref")) {
        const response = await fetch("/api/history?" + new URLSearchParams({ ref: params.get("ref"), ...(params.has("revision") ? {revision:params.get("revision")} : {}) }), { signal: controller.signal });
        const result = await response.json();
        if (current !== request) return;
        drawRecord(result);
      } else {
        reader.replaceChildren();
        element("h3", "Decisions, plans and methods", reader);
        element("p", "Search the retained history or choose a record. Follow its connections to inspect the original reasoning, answer and evidence.", reader);
        const methods = element("button", "Browse methods", reader); methods.type = "button";
        methods.addEventListener("click", () => route(new URLSearchParams({ kind: "method" })));
      }
      renderedRoute = currentRoute;
      restoreView(currentRoute);
      const ref = params.get("ref") || "";
      const identity = ref ? JSON.stringify([ref, params.get("revision") || ""]) : "";
      if (identity && identity !== selectedRef) reader.querySelector("h3")?.focus({ preventScroll: true });
      else if (listFocus) [...list.querySelectorAll("a")].find(a => a.getAttribute("href") === listFocus)?.focus({ preventScroll: true });
      selectedRef = identity;
    } catch (error) {
      if (error.name !== "AbortError" && current === request) {
        status.textContent = "History could not be loaded.";
        reader.replaceChildren();
        element("h3", "Record unavailable", reader);
        element("p", "This view could not be loaded. Your review draft is unchanged.", reader);
        const retry = element("button", "Retry history", reader); retry.type = "button";
        retry.addEventListener("click", render);
      }
    }
  }
  document.querySelector("#history-toggle").addEventListener("click", () => route());
  document.addEventListener("click", event => {
    const anchor = event.target.closest?.('a[href^="#history?"]');
    if (!anchor || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    route(new URLSearchParams(anchor.getAttribute("href").slice("#history?".length)));
  });
  document.querySelector("#history-close").addEventListener("click", () => { location.hash = returnHash || "#review"; });
  dialog.addEventListener("cancel", event => { event.preventDefault(); location.hash = returnHash || "#review"; });
  document.querySelector("#history-back").addEventListener("click", () => window.history.back());
  document.querySelector("#history-forward").addEventListener("click", () => window.history.forward());
  form.addEventListener("submit", event => {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const name of ["query", "kind", "project", "standing", "from", "to"]) {
      const value = form.elements.namedItem(name).value.trim();
      if (value) params.set(name, value);
    }
    route(params);
  });
  window.addEventListener("hashchange", render);
  void render();
}
